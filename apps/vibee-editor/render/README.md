# vibee-render

Remotion render server for the VIBEE editor. Railway service `vibee-render` in
project **999** (production).

Replaces `vibee-render-server.fly.dev`, which no longer serves — its TLS
handshake fails, i.e. the app is gone. Export in the editor had been failing at
its first step, the render server health check, ever since.

## Railway configuration

**Root Directory must be `apps/vibee-editor`**, with `dockerfilePath` set to
`render/Dockerfile`. `package.json` depends on
`"@vibee/atoms": "file:../packages/vibee-atoms"`, and Docker cannot COPY above
its build context root — so the context has to be the parent of both `render/`
and `packages/`, exactly as for the editor service.

Watch patterns are scoped to `apps/vibee-editor/render/**` and
`apps/vibee-editor/packages/**`.

> Setting Root Directory **after** creating the service is a race: the first
> deployment starts immediately and builds the repo-root Dockerfile — the bot's —
> which then fails its health check. Both this service and `vibee-editor` hit
> that. The fix is a fresh deploy once the configuration is saved.

## Endpoints

| | |
|---|---|
| `GET /health` | health check (`render-server.ts:1037`) |
| `POST /render` | start a render, returns `renderId` |
| `GET /render/:id/status` | SSE progress stream |
| `POST /api/notify/render-start` | notify Telegram that a render began |

## Telegram delivery

`render-server.ts` calls `sendVideo` (line 117) and `sendMessage` (line 88)
against the Bot API directly, so the finished video is delivered to the user's
chat. This needs `TELEGRAM_BOT_TOKEN`, set on the service as a reference to the
bot service's variable rather than a copied value.

## Media

The server does **not** ship the 492MB `public/` directory the fly.io image had.
`toAbsoluteUrl` in the editor resolves relative media against the editor's own
origin, where that media is already deployed, so the render server fetches it
over HTTPS like any other URL.

## Docker

Debian rather than Alpine: Remotion renders in headless Chrome, which needs
glibc. Chrome's shared libraries and fonts are installed explicitly — without
the fonts, text in compositions renders as boxes. `remotion browser ensure` runs
at build time so a broken Chrome download fails the build, not the first render.

No Xvfb, unlike the old fly.io entrypoint: every `renderMedia` call here passes
`headless: true`.

## Local

```bash
cd apps/vibee-editor/render
npm install
npm start          # tsx render-server.ts, PORT defaults to 3333
```
