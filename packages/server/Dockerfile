# syntax=docker/dockerfile:1.7
# choda-deck companion server — multi-stage image (~150 MB).

# --- Builder ---
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json ./
RUN npm install --include=dev

COPY tsconfig.build.json ./
COPY src ./src
RUN npm run build && cp -r src/static dist/static

# --- Runtime ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
