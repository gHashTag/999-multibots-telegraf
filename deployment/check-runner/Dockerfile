# The cloud check runner (server.mjs): tsc and vitest for this repository,
# run here instead of on the owner's 8 GB Mac (owner, 2026-09-22).
# Node 20 is what the render and the player build with; git and bash for the
# checks' own scripts; tar for the archive the request carries.
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash git tar ca-certificates python3 make g++ ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server.mjs /app/server.mjs
# Dependencies installed per lockfile live on the volume mounted at /cache.
ENV CHECK_CACHE=/cache CHECK_WORK=/tmp/work
EXPOSE 8080
CMD ["node", "/app/server.mjs"]
