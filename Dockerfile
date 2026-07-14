# syntax=docker/dockerfile:1

# --- build: install (with native toolchain), build packages + web + server, prune dev deps ---
FROM node:22-slim AS build
WORKDIR /app
# better-sqlite3 compiles native bindings; provide the toolchain for the install step.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci
RUN npm run build --workspace @shadrin-v/i18n \
  && npm run build --workspace @shadrin-v/engine \
  && npm run build --workspace @app/web \
  && npm run build --workspace @app/server
# Drop dev dependencies from node_modules; keep the compiled better-sqlite3 binding.
RUN npm prune --omit=dev

# --- runtime: thin Fastify serving /api + the built SPA ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 STATIC_DIR=/app/web DB_PATH=/app/data/app.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/web/dist ./web
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
