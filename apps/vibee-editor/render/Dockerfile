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
# exits before it opens a page. ffmpeg is used for muxing, and now also to pull
# the soundtrack out of an attached video so the agent can hear it.
#
# poppler-utils is here for `pdftotext`: a person attaching a PDF used to reach
# the model as a filename and a link it cannot open, so the answer was about the
# name. Two mature binaries beat megabytes of JavaScript for the same job, and a
# subprocess with a timeout is a sandbox a library call is not.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation fonts-noto-color-emoji fonts-dejavu-core \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 \
    libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 \
    libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 \
    libxrandr2 xdg-utils wget ffmpeg poppler-utils \
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

# Remotion downloads its own Chrome Headless Shell. Doing it at build time keeps
# the first render from paying for the download — and makes a broken download a
# failed build rather than a failed render.
RUN npx remotion browser ensure

COPY render/ ./

ENV NODE_ENV=production \
    OUTPUT_DIR=/workspace/render/out \
    REMOTION_DISABLE_HEADFUL_WARNING=1
RUN mkdir -p /workspace/render/out

# Railway assigns PORT at runtime; render-server.ts reads process.env.PORT.
EXPOSE 3333

CMD ["npm", "run", "start"]
