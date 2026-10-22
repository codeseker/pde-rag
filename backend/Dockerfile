FROM node:22-alpine AS build
RUN npm install -g pnpm@12.14.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY nest-cli.json tsconfig.json tsconfig.build.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
RUN pnpm build

FROM node:22-alpine AS runtime
RUN npm install -g pnpm@12.14.0
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
EXPOSE 3000
CMD ["node", "dist/main.js"]
