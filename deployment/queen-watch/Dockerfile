# queen-watch: the bot -> render relays probe, hourly, as a Railway cron.
# No npm dependencies: node builtins and fetch only (watch.mjs explains why).
# The previous result lives on a Railway volume mounted at /data. A Railway
# volume is owned by root, so the process stays root: as `node` it could not
# write its state and every run would look like a first run.
FROM node:20-bookworm-slim
WORKDIR /app
COPY watch.mjs /app/watch.mjs
ENV STATE_DIR=/data
CMD ["node", "/app/watch.mjs"]
