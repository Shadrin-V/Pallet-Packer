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
# Root build script builds workspaces in explicit dependency order
# (i18n → engine → contracts → web → server); see package.json / LKWkalk-dsu.
RUN npm run build
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
# Container healthcheck (Coolify/Traefik can consume it). Node 22 has global fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
