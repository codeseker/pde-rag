# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Single-image build for Render (and any Docker host).
#
#   nginx  :$PORT   static React app + reverse proxy  (public entry point)
#   node   :3000    NestJS API (/ask, /feed)          (internal)
#   python :8000    FastAPI + SymPy verifier           (internal)
#
# The frontend calls the public Render origin; nginx still forwards those
# paths to the internal API. Keeping the absolute base URL explicit prevents a
# production bundle from silently falling back to localhost.
#
# The only external dependency is a PostgreSQL database with pgvector.
# ---------------------------------------------------------------------------

# --- 1. Frontend build ------------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /app
RUN npm install -g pnpm@12.14.0
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
# The browser talks to the public Render origin. Keeping the absolute base URL
# explicit also prevents a production bundle from falling back to localhost.
ARG VITE_API_URL=https://pde-rag.onrender.com
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm build && test -f dist/index.html && test -d dist/assets

# --- 2. Backend build -------------------------------------------------------
FROM node:22-alpine AS backend
WORKDIR /app
RUN npm install -g pnpm@12.14.0
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY backend/nest-cli.json backend/tsconfig.json backend/tsconfig.build.json backend/drizzle.config.ts ./
COPY backend/src ./src
COPY backend/drizzle ./drizzle
RUN pnpm build && test -f dist/main.js && test -f dist/ask/prompts/classify.txt

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
RUN test -f dist/main.js \
  && test -f dist/ask/prompts/classify.txt \
  && test -f drizzle/meta/_journal.json \
  && node -e "require('@nestjs/core'); require('drizzle-orm'); require('pg');"

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
COPY deploy/healthcheck.js /usr/local/bin/healthcheck.js
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/healthcheck.js \
  && mkdir -p /var/log/nginx /var/lib/nginx /var/log/supervisor /run

EXPOSE 10000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=6s --start-period=60s --retries=3 \
  CMD ["node", "/usr/local/bin/healthcheck.js"]
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
