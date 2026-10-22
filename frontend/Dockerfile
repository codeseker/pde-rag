FROM node:22-alpine AS build
WORKDIR /app

RUN npm install -g pnpm@12.14.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# The deployed front-end talks to the Render service directly. For local
# development pass --build-arg VITE_API_URL=http://localhost:3000 (the root
# docker-compose file does this automatically).
ARG VITE_API_URL=https://pde-rag.onrender.com
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
