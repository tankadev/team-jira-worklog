# syntax=docker/dockerfile:1

# ---- deps: install node_modules (better-sqlite3 is native, hence the toolchain)
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: produce the standalone server
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- run: only what the standalone server needs
FROM node:22-alpine AS run
WORKDIR /app
# tzdata so TZ resolves — worklog days are local days, not UTC ones.
RUN apk add --no-cache tzdata \
 && addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 PORT=3847 TZ=Asia/Ho_Chi_Minh

COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Spawned by path at runtime, so the tracer never picks them up.
COPY --from=build --chown=app:app /app/lib/modules/code-review/supervise.mjs ./lib/modules/code-review/
COPY --from=build --chown=app:app /app/lib/modules/sdk-release/supervise.mjs ./lib/modules/sdk-release/
RUN mkdir -p data && chown app:app data

USER app
EXPOSE 3847
CMD ["node", "server.js"]
