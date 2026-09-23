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
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation fonts-noto-color-emoji fonts-dejavu-core \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 \
    libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 \
    libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 \
    libxrandr2 xdg-utils wget ffmpeg poppler-utils libarchive-tools \
  && rm -rf /var/lib/apt/lists/*

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
WORKDIR /workspace/packages/vibee-atoms
RUN npm ci --omit=dev --no-audit --no-fund

WORKDIR /workspace/render
# --install-links COPIES the file:../packages/vibee-atoms dependency into
# node_modules instead of symlinking it. Without it Remotion's webpack bundles
# straight out of /workspace/packages/vibee-atoms/src and resolves 'jotai' by
# walking up from there — /workspace/packages/node_modules and
# /workspace/node_modules do not exist, so the bundle fails at startup with
# "Can't resolve 'jotai'" and the server never opens its port.
RUN npm ci --install-links --no-audit --no-fund

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
