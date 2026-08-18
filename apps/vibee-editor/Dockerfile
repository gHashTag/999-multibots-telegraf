# VIBEE video editor — Telegram Mini App + web SPA.
#
# Build context MUST be apps/vibee-editor (Railway "Root Directory"), not
# apps/vibee-editor/player: player/package.json depends on
# "@vibee/atoms": "file:../packages/vibee-atoms" and vite.config.ts aliases
# '@vibee/atoms' -> '../packages/vibee-atoms/src'. Both escape player/, and a
# Docker build context cannot COPY above its own root.

# ---------- build ----------
# package.json engines: node >=20 <23.
FROM node:20-alpine AS build
WORKDIR /workspace

# The local file: dependency must exist before `npm ci` runs, otherwise npm
# resolves it to a dangling symlink and vite fails to resolve @vibee/atoms in
# 74 source files.
COPY packages/ ./packages/

# Manifests first so the dependency layer caches independently of source edits.
# .npmrc carries legacy-peer-deps=true, which is REQUIRED: @sentry/react@7 has
# a peer range of react 15-18 and this app runs react 19.
COPY player/package.json player/package-lock.json player/.npmrc ./player/
WORKDIR /workspace/player
RUN npm ci --no-audit --no-fund

# Source last — this layer changes on every commit.
COPY player/ ./

# VITE_* are read via import.meta.env and are baked into the bundle at BUILD
# time. Railway service variables reach a Dockerfile build only through explicit
# ARG declarations, so each one has to be listed here and passed through.
ARG VITE_API_URL
ARG VITE_RENDER_URL
ARG VITE_RENDER_SERVER_URL
ARG VITE_BRIDGE_URL
ARG VITE_WS_URL
ARG VITE_AGENT_WS_URL
ARG VITE_SENTRY_DSN
ARG VITE_WALLET_CONNECT_PROJECT_ID
ARG VITE_APP_VERSION
ENV VITE_API_URL=$VITE_API_URL \
    VITE_RENDER_URL=$VITE_RENDER_URL \
    VITE_RENDER_SERVER_URL=$VITE_RENDER_SERVER_URL \
    VITE_BRIDGE_URL=$VITE_BRIDGE_URL \
    VITE_WS_URL=$VITE_WS_URL \
    VITE_AGENT_WS_URL=$VITE_AGENT_WS_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_WALLET_CONNECT_PROJECT_ID=$VITE_WALLET_CONNECT_PROJECT_ID \
    VITE_APP_VERSION=$VITE_APP_VERSION

# `npm run build` is `vite build` (no type check). NOT `build:check`:
# `tsc -b` currently emits 519 pre-existing errors in this tree.
RUN npm run build

# ---------- serve ----------
FROM nginx:alpine AS serve

# envsubst lives in gettext.
RUN apk add --no-cache gettext

COPY --from=build /workspace/player/dist/ /usr/share/nginx/html/
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint-vibee.sh
RUN chmod +x /docker-entrypoint-vibee.sh && chmod -R 755 /usr/share/nginx/html

# Documentation only — Railway routes to $PORT, which the entrypoint substitutes.
EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint-vibee.sh"]
