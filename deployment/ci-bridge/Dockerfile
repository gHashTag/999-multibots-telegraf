# ci-bridge: GitHub pull requests -> the check-runner -> a mark on GitHub
# (bridge.mjs explains why). No npm dependency: Node's own fetch and the
# image's tar. Nothing is kept between runs; the state is the marks on
# GitHub. Node 22 because the bridge imports its spec's generated modules
# (spec/*.gen.ts, spec/*.logic.ts) as TypeScript, types stripped.
FROM node:22-bookworm-slim
WORKDIR /app
RUN echo '{"type":"module"}' > /app/package.json
COPY bridge.mjs /app/
COPY spec/ci-bridge.gen.ts spec/ci-bridge.logic.ts /app/spec/
RUN node --experimental-strip-types -e "import('/app/bridge.mjs')"
CMD ["node", "--experimental-strip-types", "/app/bridge.mjs"]
