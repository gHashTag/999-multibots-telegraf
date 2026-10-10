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
#
# Since 2026-10-05 it also runs the experiments (suites `mutants` and
# `spec`, suites.mjs) that until then still ran on the Mac. `tri mutants`
# needs python3, git and vitest, all here already. A spec's controls need
#   - t27c, built from gHashTag/t27 at a pinned commit (T27_REF): t27 ships
#     no release binary, and its build.rs reads files outside bootstrap/, so
#     it is built from the whole tree, `cargo build -p t27c`;
#   - zig 0.16.0, which `t27c test-report` compiles each spec's tests with,
#     the version t27's own CI pins (.github/workflows/queen-doctor.yml).
# Both go in /usr/local/bin: `bash -l` resets PATH, and that stays on it.
# A missing one makes the spec suite answer "unmeasured" (2), never 0; the
# build checks both start, so a broken one does not deploy.
FROM node:22-bookworm-slim AS node22

FROM rust:1-bookworm AS t27c
ARG T27_REF=732f43990257cb8fd07b3317023ff05f1b24dd68
RUN apt-get update && apt-get install -y --no-install-recommends \
      pkg-config libssl-dev git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git init -q /t27 && cd /t27 \
    && git remote add origin https://github.com/gHashTag/t27.git \
    && git fetch -q --depth 1 origin "$T27_REF" \
    && git checkout -q FETCH_HEAD
WORKDIR /t27
RUN cargo build --release -p t27c && ./target/release/t27c --help > /dev/null

FROM debian:bookworm-slim AS zig
ARG ZIG_VERSION=0.16.0
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl xz-utils ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL "https://ziglang.org/download/${ZIG_VERSION}/zig-x86_64-linux-${ZIG_VERSION}.tar.xz" \
      | tar -xJ -C /opt \
    && mv "/opt/zig-x86_64-linux-${ZIG_VERSION}" /opt/zig \
    && /opt/zig/zig version | grep -qx "$ZIG_VERSION"

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash git tar ca-certificates python3 make g++ ffmpeg \
      chromium fonts-liberation libssl3 tini \
    && rm -rf /var/lib/apt/lists/*
COPY --from=t27c /t27/target/release/t27c /usr/local/bin/t27c
COPY --from=zig /opt/zig /opt/zig
RUN ln -s /opt/zig/zig /usr/local/bin/zig \
    && zig version | grep -qx '0.16.0' \
    && t27c --help > /dev/null
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
COPY server.mjs suites.mjs /app/
# Dependencies installed per lockfile live on the volume mounted at /cache.
ENV CHECK_CACHE=/cache CHECK_WORK=/tmp/work CHROME_PATH=/usr/bin/chromium
EXPOSE 8080
# tini is PID 1 and reaps orphans. Node as PID 1 never waits on the grandchildren
# a killed run or a test leaves behind; 2026-10-06..10 their zombies filled the
# process table until every spawn failed with EAGAIN (pthread_create, spawn tar).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/app/server.mjs"]
