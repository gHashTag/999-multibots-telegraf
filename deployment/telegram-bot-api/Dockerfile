# OUR OWN TELEGRAM BOT API SERVER.
#
# Built FROM aiogram/telegram-bot-api (https://github.com/aiogram/telegram-bot-api),
# the maintained image of Telegram's open-source server
# (https://github.com/tdlib/telegram-bot-api, Boost Software License 1.0).
# Its entrypoint and binary are used unchanged; this file adds the read-only
# file endpoint, the media sweeper and the move script. Why any of it exists:
# src/services/telegramApi.ts and README.md beside this file.
#
# Pinned to a Bot API version AND its digest: a server that changes under a
# redeploy is a server whose behaviour changes without a commit. To upgrade,
# change both, in a commit that says why.
FROM aiogram/telegram-bot-api:10.3@sha256:83ec3f119aa68db1602c0cd3634a42f4a399051411df8ebb70f3e62ade67eb80

# node runs the file endpoint and the move script. Nothing from npm: both are
# plain node with no dependencies.
RUN apk add --no-cache nodejs

# --local: getFile hands over up to 2000 MB, as an absolute path on this disk.
# The working directory is the Railway VOLUME (mounted at this path): the
# bot sessions live there too, and without the volume every redeploy would
# log every moved bot out of this server.
#
# `::` on both ports: Railway's private network between services has been
# IPv6 (deployment/remote-browser/cdp-bridge.conf measured the same trap).
ENV TELEGRAM_LOCAL=1 \
    TELEGRAM_WORK_DIR=/var/lib/telegram-bot-api \
    TELEGRAM_HTTP_PORT=8081 \
    TELEGRAM_HTTP_IP_ADDRESS=:: \
    FILES_PORT=8082 \
    FILES_HOST=:: \
    FILES_TTL_HOURS=24

WORKDIR /opt/bot-api
COPY start.mjs file-server.mjs sweep.mjs bot-api-move.cjs ./

# TELEGRAM_API_ID and TELEGRAM_API_HASH come from the service's variables
# (README.md); the upstream entrypoint refuses to start without them.
EXPOSE 8081 8082
ENTRYPOINT ["node", "/opt/bot-api/start.mjs"]
