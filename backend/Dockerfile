FROM node:22-alpine AS build
RUN npm install -g pnpm@12.14.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY nest-cli.json tsconfig.json tsconfig.build.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
RUN pnpm build && test -f dist/main.js && test -f dist/ask/prompts/classify.txt

FROM node:22-alpine AS runtime
RUN npm install -g pnpm@12.14.0
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=6s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
