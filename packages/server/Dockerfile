# syntax=docker/dockerfile:1.7
# choda-deck companion image — multi-stage, monorepo-aware.
# Build from REPO ROOT: `docker build -f packages/server/Dockerfile -t choda-companion .`

# --- Stage 1: install + build web bundle (Vite) ---
FROM node:22-slim AS web-builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.0.9 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/
RUN pnpm install --frozen-lockfile --filter shared --filter web

COPY packages/shared ./packages/shared
COPY packages/web ./packages/web
RUN pnpm --filter shared build && pnpm --filter web build

# --- Stage 2: install + build server ---
FROM node:22-slim AS server-builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.0.9 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/server/package.json ./packages/server/
RUN pnpm install --frozen-lockfile --filter server

COPY packages/server ./packages/server
RUN pnpm --filter server build

# --- Stage 3: runtime ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV CHODA_WEB_DIST=/app/web-dist

# Server runtime deps only
COPY packages/server/package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=server-builder /app/packages/server/dist ./dist
COPY --from=web-builder /app/packages/web/dist /app/web-dist

USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
