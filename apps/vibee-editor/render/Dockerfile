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
WORKDIR /workspace/render
# --install-links COPIES the file:../packages/vibee-atoms dependency into
# node_modules instead of symlinking it. Without it Remotion's webpack bundles
# straight out of /workspace/packages/vibee-atoms/src and resolves 'jotai' by
# walking up from there — /workspace/packages/node_modules and
# /workspace/node_modules do not exist, so the bundle fails at startup with
# "Can't resolve 'jotai'" and the server never opens its port.
RUN npm ci --install-links --no-audit --no-fund

# BELT AND BRACES FOR THE DAY npm DECIDES TO LINK ANYWAY.
#
# `--install-links` is what the comment above relies on, and the lockfile
# records this dependency as `link: true`. When those two disagree -- and they
# did, with nothing in this repository changing -- npm symlinks instead of
# copying, resolution walks up from /workspace/packages/vibee-atoms/src, and
# the server dies at startup:
#
#   Error: Cannot find module 'jotai/utils'
#     requireStack: /workspace/packages/vibee-atoms/src/storage.ts
#                   ... render-server.ts
#
# MEASURED 2026-09-23: vibee-render started failing at 13:42 and kept failing
# for three hours while the 13:18 image went on serving, so nothing looked
# broken from outside and no deploy reached production either.
#
# One package at the one path resolution looks at. It costs a few hundred
# kilobytes and removes a whole class of "it built, it does not start".
RUN npm i --prefix /workspace --no-save --no-audit --no-fund jotai@^2.6.0

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
