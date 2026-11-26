# syntax=docker/dockerfile:1

# ---- Build stage: install production dependencies --------------------------
# python3/make/g++ are only needed if better-sqlite3 has no prebuilt binary
# for this Node version and has to compile from source.
FROM node:26-slim AS build
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# allowScripts in package.json lets better-sqlite3's install script run.
RUN npm ci --omit=dev && npm cache clean --force

# ---- Runtime stage ----------------------------------------------------------
FROM node:26-slim
ENV NODE_ENV=production \
    DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=8080
WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

# /data holds menu.db and uploads/. Mount a host folder or volume here.
RUN mkdir -p /data/uploads && chown -R node:node /data

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# node runs as PID 1 and handles SIGTERM itself (graceful shutdown in src/server.js).
CMD ["node", "src/server.js"]
