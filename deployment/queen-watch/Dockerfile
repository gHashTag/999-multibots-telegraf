# queen-watch: the bot -> render relays probe, the BROWSER page and the
# database schema drift check, hourly, as a Railway cron.
# One npm dependency, pg, for the schema watch only (watch.mjs explains why);
# installed from the committed lockfile, nothing else.
# The previous result lives on a Railway volume mounted at /data. A Railway
# volume is owned by root, so the process stays root: as `node` it could not
# write its state and every run would look like a first run.
FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json /app/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY watch.mjs igla.mjs schema.mjs schema-baseline.json telegram-api.cjs /app/
ENV STATE_DIR=/data
CMD ["node", "/app/watch.mjs"]
