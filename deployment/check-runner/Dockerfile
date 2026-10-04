# The cloud check runner (server.mjs): tsc and vitest for this repository,
# run here instead of on the owner's 8 GB Mac (owner, 2026-09-22).
# Node 20 is what the render and the player build with; git and bash for the
# checks' own scripts; tar for the archive the request carries.
#
# Since 2026-10-04 it also runs gHashTag/trinity's website checks (suite
# `website`; owner: "run all experiments on Railway, the computer here is
# choking"). Those want two more things:
#   - Node 22, the version trinity's CI pins. A whole Node 22 -- node and its
#     own npm -- sits in /opt/node22; server.mjs puts it first on PATH for the
#     website suite only, so the bot's suites stay on Node 20.
#   - A browser. trinity's browser contracts look for CHROME_PATH, then
#     /usr/bin/chromium, and print "no Chrome found -- skipping" when there is
#     none. They start it without --no-sandbox, which Chromium refuses as
#     root, so the flags go in through Debian's own launcher: /usr/bin/chromium
#     sources every file in /etc/chromium.d and passes $CHROMIUM_FLAGS.
# The last RUN proves both at build time: an image whose browser cannot start
# headless as root does not build.
FROM node:22-bookworm-slim AS node22

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash git tar ca-certificates python3 make g++ ffmpeg \
      chromium fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node22 /usr/local/bin/node /opt/node22/bin/node
COPY --from=node22 /usr/local/lib/node_modules/npm /opt/node22/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /opt/node22/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /opt/node22/bin/npx \
    && printf '%s\n' \
      'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --no-sandbox --disable-dev-shm-usage"' \
      > /etc/chromium.d/zz-check-runner \
    && /opt/node22/bin/node --version | grep -q '^v22\.' \
    && PATH=/opt/node22/bin:$PATH npm --version \
    && node --version | grep -q '^v20\.' \
    && chromium --headless=new --dump-dom about:blank 2>/dev/null \
      | grep -q '<body'
WORKDIR /app
COPY server.mjs /app/server.mjs
# Dependencies installed per lockfile live on the volume mounted at /cache.
ENV CHECK_CACHE=/cache CHECK_WORK=/tmp/work CHROME_PATH=/usr/bin/chromium
EXPOSE 8080
CMD ["node", "/app/server.mjs"]
