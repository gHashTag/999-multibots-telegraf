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
# Measured 2026-09-22: setting VITE_ADMIN_IDS on the service changed nothing,
# because a name missing from this list is simply not there at build time. The
# bundle kept the fallback and the second admin account saw no admin badge.
ARG VITE_ADMIN_IDS
# The sign-in door on the app's own site: auth.t27.ai is a custom domain of
# vibee-render, and there the refresh token is an HttpOnly cookie, so a sign-in
# outlives the tab (render src/auth/refresh-cookie.ts, player lib/appSession.ts).
# The default is the value; a service variable only overrides it. Set it to
# "off" (anything but an https origin) to go back to the tab's own store.
ARG VITE_AUTH_ORIGIN=https://auth.t27.ai
ENV VITE_ADMIN_IDS=$VITE_ADMIN_IDS \
    VITE_AUTH_ORIGIN=$VITE_AUTH_ORIGIN \
    VITE_API_URL=$VITE_API_URL \
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

# ---------- test ----------
# THE GATE THAT DOES NOT DEPEND ON GITHUB.
#
# Measured 2026-09-21: every GitHub Actions job in this repository stopped
# starting ("recent account payments have failed or your spending limit needs
# to be increased"), on main as on every branch. Deploys never depended on it -
# Railway builds this file on every push to main - but the tests did, so for
# as long as billing was broken nothing checked what shipped. A pull request
# gate can also be merged past; a build step cannot.
#
# So the player's own suite runs HERE, and the image that serves the app
# depends on it (the marker copied into `serve` below): a red test means no new
# image, and the running deployment keeps serving the previous one.
#
#   - tsc --noEmit -p . is the player-only check, clean today (0 errors); the
#     519 of `tsc -b` noted above are the repository-wide config.
#   - --maxWorkers=2 --retry=2: measured on a loaded machine, a full parallel
#     run failed 23 tests that pass alone - waits tuned to a fast laptop, not
#     defects. Two workers and a retry separate the two; a real defect fails
#     all three tries.
#   - Excluded, with the reason: two tests read the repository ROOT, which this
#     build context (apps/vibee-editor) cannot contain - no-later-on-paywall
#     loads scripts/lib/anchored-slice.cjs, and startParamContract scans the
#     bot's own src/. The repository's hooks still run both. The list lives in
#     player/scripts/test-gate.mjs.
#   - Dockerfile, nginx/ and render/ are copied because tests read them as
#     text: this file's build-time names, the nginx template the app ships, and
#     render sources the player mirrors. First real run without them: 4 files
#     failed on ENOENT, none on a defect.
FROM build AS test
WORKDIR /workspace
COPY Dockerfile ./Dockerfile
COPY nginx/ ./nginx/
COPY render/ ./render/
WORKDIR /workspace/player
# scripts/test-gate.mjs runs the suite and decides on the tests themselves (its
# header says why vitest's exit code alone is not enough, and what it refuses).
RUN npx tsc --noEmit -p . \
 && node scripts/test-gate.mjs \
 && touch /workspace/player/.tests-passed

# ---------- queen ----------
# The Queen board moves here from t27.ai, so that the product is ONE server at
# ONE origin (owner, 2026-09-21: "чтобы не два сервера а на одном все было …
# переезд с queen на app", address kept as app.t27.ai).
#
# Same origin is not cosmetic. On t27.ai the board cannot read this app's
# session at all, because sessionStorage belongs to an origin: so it had to ask
# app.t27.ai over postMessage, through the /bridge page and a consent click, for
# a 300-second game token that /mcp accepts for two identity tools and nothing
# else. Served from /queen/ it reads the session the app has already written,
# and the whole bridge hop stops being on the path.
#
# WHY FETCHED AND NOT VENDORED
#
# The board is developed in gHashTag/trinity. A second copy of it in this
# repository would be a copy that drifts from the one people actually edit, and
# the drift would surface as "I fixed it and app.t27.ai still shows the old
# screen". The repository is public, so this clone needs no credential.
#
# PINNED TO A COMMIT, NEVER A BRANCH
#
# An unpinned clone makes this image unreproducible and lets a merge in ANOTHER
# repository silently change what app.t27.ai serves. Railway's watchPatterns
# cannot see that repository either, so a new board does not ship by itself:
# bumping QUEEN_REF below is exactly the commit that ships it, and that is the
# intended way to release the board.
FROM node:20-alpine AS queen
WORKDIR /queen
ARG QUEEN_REPO=https://github.com/gHashTag/trinity.git
ARG QUEEN_REF=e0cadc026fd77df0d2a4b28981f6bd52c0efddcb
RUN apk add --no-cache git

# fetch-by-SHA rather than `clone --branch`: a tag or branch name can be moved
# after the fact, a commit id cannot. GitHub serves an arbitrary reachable SHA.
RUN git init -q . \
 && git remote add origin "$QUEEN_REPO" \
 && git fetch -q --depth 1 origin "$QUEEN_REF" \
 && git checkout -q FETCH_HEAD

# apps/website carries its own package-lock.json and builds standalone; it is
# not part of a workspace that would have to be installed from the repo root.
WORKDIR /queen/apps/website
RUN npm ci --no-audit --no-fund

# vite.config.ts sets `base: './'`, so the bundle already addresses its assets
# relatively and works unchanged under a subpath. That property is held by the
# website's own `check:subpath-urls` gate, which exists precisely because a
# root-absolute URL would resolve to VIBEE's root from under /queen/.
RUN npm run build

# ---------- serve ----------
FROM nginx:alpine AS serve

# envsubst lives in gettext.
RUN apk add --no-cache gettext

COPY --from=build /workspace/player/dist/ /usr/share/nginx/html/
# Nothing is served unless the test stage passed: this COPY is what makes
# BuildKit run it (an unreferenced stage is skipped), and the file itself is
# deleted again at once.
COPY --from=test /workspace/player/.tests-passed /tmp/.tests-passed
RUN rm /tmp/.tests-passed
COPY --from=queen /queen/apps/website/dist/ /usr/share/nginx/html/queen/
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint-vibee.sh
RUN chmod +x /docker-entrypoint-vibee.sh && chmod -R 755 /usr/share/nginx/html

# Documentation only — Railway routes to $PORT, which the entrypoint substitutes.
EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint-vibee.sh"]