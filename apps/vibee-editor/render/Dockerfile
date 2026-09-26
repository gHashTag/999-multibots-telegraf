# VIBEE render server — Remotion video rendering.
#
# Build context is apps/vibee-editor (the same Root Directory as the editor
# service), because package.json depends on "@vibee/atoms":
# "file:../packages/vibee-atoms" and Docker cannot COPY above its context root.
# Railway points this service at render/Dockerfile via dockerfilePath.
#
# Debian, not Alpine: Remotion renders in headless Chrome, which needs glibc.

FROM node:20-bookworm-slim

# Chrome's shared-library dependencies plus fonts. Without the fonts, text in
# rendered compositions falls back to boxes; without libnss3/libatk/etc Chrome
# exits before it opens a page. ffmpeg is used for muxing, and to take the
# soundtrack out of a video too big for the transcriber.
#
# The agent's file readers (src/agent/media-extract.ts, EXTERNAL_TOOLS):
# poppler-utils for `pdftotext` (a PDF used to reach the model as a filename),
# libarchive-tools for `bsdtar -t` (a rar/7z/tar is LISTED, never unpacked).
# dockerfile-has-the-readers.test.ts fails if a reader's package goes missing.
#
# The RTL and FPGA engineers' hands (src/agent/hdl-run.ts, hdl_run):
# verilator (lint), iverilog + vvp (simulate a testbench), yosys
# (synth_xilinx; stat). Without them the tool says "not installed" and the
# agent must answer "не запускалось" -- hdl-run-in-the-image.test.ts.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation fonts-noto-color-emoji fonts-dejavu-core \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 \
    libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 \
    libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 \
    libxrandr2 xdg-utils wget ffmpeg poppler-utils libarchive-tools unzip \
    iverilog verilator yosys \
    python3 util-linux \
  && rm -rf /var/lib/apt/lists/*

# The coding scientist's hands (src/agent/code-run.ts, code_run): Deno runs
# TS/JS in a sandbox with every permission denied; python3 runs boxed by
# unshare -rn (no network) + prlimit (util-linux), as nobody. Without them the
# tool says "not installed" and the agent must answer "не запускалось" --
# code-run-in-the-image.test.ts. Deno is pinned and installed to a dir on PATH.
ENV DENO_VERSION=v2.9.6 DENO_INSTALL=/usr/local
RUN wget -qO /tmp/deno.zip \
      "https://github.com/denoland/deno/releases/download/${DENO_VERSION}/deno-x86_64-unknown-linux-gnu.zip" \
  && unzip -o /tmp/deno.zip -d /usr/local/bin \
  && rm /tmp/deno.zip \
  && chmod +x /usr/local/bin/deno \
  && deno --version

WORKDIR /workspace

# The local file: dependency must exist before npm install resolves it.
COPY packages/ ./packages/

COPY render/package.json render/package-lock.json ./render/

# THE SHARED PACKAGE NEEDS ITS OWN DEPENDENCIES TOO.
#
# 2026-09-23, production: the render would not boot -- "Cannot find module
# 'jotai/utils'", thrown from /workspace/packages/vibee-atoms/src/storage.ts.
# `npm ci --install-links` below is meant to COPY that package into the
# render's node_modules, but the lockfile was written without that flag, so
# npm honours it and links instead: the code then runs from
# /workspace/packages/vibee-atoms, where there is no node_modules to walk up
# into. Installing the package's own dependencies where the package actually
# is makes both paths work, whichever npm chooses.
# NOT --omit=dev: in that package jotai is a peer dependency and a dev one,
# and nothing else. Omitting dev installed nothing at all, and the render
# still could not boot (measured on the deploy that followed).
WORKDIR /workspace/packages/vibee-atoms
RUN npm ci --no-audit --no-fund

WORKDIR /workspace/render
# --install-links COPIES the file:../packages/vibee-atoms dependency into
# node_modules instead of symlinking it. Without it Remotion's webpack bundles
# straight out of /workspace/packages/vibee-atoms/src and resolves 'jotai' by
# walking up from there — /workspace/packages/node_modules and
# /workspace/node_modules do not exist, so the bundle fails at startup with
# "Can't resolve 'jotai'" and the server never opens its port.
RUN npm ci --install-links --no-audit --no-fund

# AND THE SAME DEPENDENCIES ONE DIRECTORY UP, FOR THE SOURCE THAT IS NOT COPIED.
#
# --install-links above covers what WEBPACK bundles. It does not cover what the
# server imports at RUNTIME: tsconfig maps '@vibee/atoms' to
# '../packages/vibee-atoms/src', and tsx follows that map, so those files are
# loaded from /workspace/packages -- never from the copy inside
# render/node_modules. Resolution then walks up from /workspace/packages and
# finds nothing, because /workspace/node_modules does not exist.
#
# Measured 2026-09-23: the atoms barrel began re-exporting `storage.ts`, which
# imports `jotai/utils`. The render server died at startup with "Cannot find
# module 'jotai/utils'", two deploys in a row FAILED, and /health kept
# answering 200 from the previous image -- so main looked alive while nothing
# merged into it was being deployed.
#
# The link makes resolution from /workspace/packages behave exactly like
# resolution from /workspace/render, which is the truth of it: that source is
# compiled as part of this application and must see this application's
# dependencies. Copying one package would fix today's import and wait for the
# next peer dependency.
RUN ln -sfn /workspace/render/node_modules /workspace/node_modules

# Remotion downloads its own Chrome Headless Shell. Doing it at build time keeps
# the first render from paying for the download — and makes a broken download a
# failed build rather than a failed render.
RUN npx remotion browser ensure

# THE OWNER'S VOICE TRAVELS WITH THE SERVICE, because it now lives in it.
#
# SOUL.md sets the tone of every agent answer and every published post. It used
# to live at the repository root -- ABOVE this build context (apps/vibee-editor)
# -- so Docker could not reach it and the image never had it. /health said so
# with `ownerVoiceLoaded: false` from the day that flag was added, and the
# prompt was quietly taught to stop pointing at a section that was not there.
#
# It sits in `render/` rather than one level up on purpose: this line already
# carries that folder, and Railway rebuilds this service when it changes, so a
# rewritten voice reaches production the way every other change does.
COPY render/ ./

ENV NODE_ENV=production \
    OUTPUT_DIR=/workspace/render/out \
    REMOTION_DISABLE_HEADFUL_WARNING=1
RUN mkdir -p /workspace/render/out

# Railway assigns PORT at runtime; render-server.ts reads process.env.PORT.
EXPOSE 3333

CMD ["npm", "run", "start"]
