# ci-bridge: GitHub pull requests -> the check-runner -> commit statuses
# (bridge.mjs explains why). No npm dependency: Node's own fetch and the
# image's tar. Nothing is kept between runs; the state is the statuses on
# GitHub.
FROM node:20-bookworm-slim
WORKDIR /app
COPY bridge.mjs /app/
CMD ["node", "/app/bridge.mjs"]
