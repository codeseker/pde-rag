# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Single-image build for Render (and any Docker host).
#
#   nginx  :$PORT   static React app + reverse proxy  (public entry point)
#   node   :3000    NestJS API (/ask, /feed)          (internal)
#   python :8000    FastAPI + SymPy verifier           (internal)
#
# The browser only ever talks to its own origin, so CORS never applies.
# The only external dependency is a PostgreSQL database with pgvector.
# ---------------------------------------------------------------------------

# --- 1. Frontend build ------------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /app
RUN npm install -g pnpm@12.14.0
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
# An empty API base makes the browser call "/ask" and "/feed" on the same
# origin that served the page, which is what removes the CORS question.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm build

# --- 2. Backend build -------------------------------------------------------
FROM node:22-alpine AS backend
WORKDIR /app
RUN npm install -g pnpm@12.14.0
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY backend/nest-cli.json backend/tsconfig.json backend/tsconfig.build.json backend/drizzle.config.ts ./
COPY backend/src ./src
COPY backend/drizzle ./drizzle
RUN pnpm build

# --- 3. Runtime -------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    nginx \
    python3 \
    python3-venv \
    python3-pip \
    supervisor \
    tini \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=10000 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Backend: production dependencies + compiled output + migrations.
RUN npm install -g pnpm@12.14.0
WORKDIR /app/backend
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile \
  && rm -rf "$(pnpm store path)" \
  && rm -rf /root/.cache
COPY --from=backend /app/dist ./dist
COPY --from=backend /app/drizzle ./drizzle

# Verifier: FastAPI + SymPy in an isolated virtualenv.
WORKDIR /app/verifier
COPY verifier/app.py ./app.py
COPY verifier/requirements.txt ./requirements.txt
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# Frontend static assets.
COPY --from=frontend /app/dist /usr/share/nginx/html

# Reverse proxy, process supervisor and entrypoint.
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/site.conf.template /etc/nginx/templates/site.conf.template
COPY deploy/supervisord.conf /etc/supervisor/supervisord.conf
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /var/log/nginx /var/lib/nginx /run

EXPOSE 10000
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
