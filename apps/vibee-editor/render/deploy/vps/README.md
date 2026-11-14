# t27ai-render on the Fornex VPS

The render server (`render/render-server.ts`) and its Postgres, re-hosted from
the dead Railway service `vibee-render` onto the VPS `331257.fornex.cloud`.
It carries the course ladder (`POST/GET /api/course/key`,
`POST /api/course/progress`) and the CRM tables behind it, and is what
`@t27ai_bot` calls over `X-Api-Key`.

Everything here is additive and isolated: its own directory `/opt/t27ai-render`,
its own docker network `t27ai-net`, its own volume `t27ai-pgdata`, two own
systemd units, one own Caddy block. No other service on the host is read,
touched or restarted.

## What runs

| Part                      | How                                                           | Listens                               |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| `t27ai-render-db.service` | `postgres:16-alpine`, 512 MB, own volume                      | docker network only                   |
| `t27ai-render.service`    | image `t27ai-render:local` (`render/Dockerfile`), 3 GB, 2 CPU | `127.0.0.1:8090`                      |
| Caddy block               | `caddy-t27ai-render.conf`, only `/health` and `/api/*`        | `https://t27ai-130-17-9-230.sslip.io` |

The host has no `docker compose` plugin, so the units call `docker run`
directly; nothing is installed on the host.

## Deploy

1. Source (a clean tree, no `node_modules`), from a checkout of the commit to
   ship; the build context is `apps/vibee-editor`. Send only what the image
   copies (about 18 MB; the whole editor tree is ~110 MB and crawls over the
   uplink):
   `git archive HEAD apps/vibee-editor/packages apps/vibee-editor/render apps/vibee-editor/.dockerignore | ssh root@<vps> 'tar -x -C /opt/t27ai-render/src'`
2. Secrets, written on the VPS, mode 0600, never in git:
   `/opt/t27ai-render/db.env` (`POSTGRES_USER`, `POSTGRES_PASSWORD`,
   `POSTGRES_DB`) and `/opt/t27ai-render/.env` (the minimum block at the top of
   `env.example`; add other names only when needed and **delete a name you do
   not set instead of leaving it empty**, an empty value reads as "set").
3. Image, with the host kept usable while it builds (classic builder honours
   the limits): `cd /opt/t27ai-render/src/apps/vibee-editor && DOCKER_BUILDKIT=0
nice -n 19 docker build --memory 3g --cpu-quota 200000 -f render/Dockerfile
-t t27ai-render:local .`
4. Units: copy `t27ai-render-db.service` and `t27ai-render.service` to
   `/etc/systemd/system/`, `systemctl daemon-reload`,
   `systemctl enable --now t27ai-render-db t27ai-render`.
5. Caddy: append `caddy-t27ai-render.conf` to `/etc/caddy/Caddyfile`,
   `caddy validate --config /etc/caddy/Caddyfile`, then `systemctl reload caddy`.
6. Check: `curl -s https://t27ai-130-17-9-230.sslip.io/health` is 200 from
   outside, and `GET /api/course/key?k=x` answers `{"ok":false,...}` (never a
   404 or a 502). The whole ladder, on the VPS with the key from `.env`
   (never print it): `POST /api/course/key` with `X-Api-Key` and
   `{"telegram_id":"<digits>","step":"bot","route":"<slug>"}` returns a key;
   `GET /api/course/key?k=<key>` reads it back; `POST /api/course/progress`
   with `{"key","course","lesson"}` files a lesson. Without the header the
   mint answers `server_key_required`. A smoke test leaves rows in
   `course_*` and `crm_*`: clear them before real traffic.

The first image build takes about 6 minutes on this host (apt layer first).

## Rollback

`systemctl disable --now t27ai-render t27ai-render-db`, then remove the Caddy
block and reload. The volume `t27ai-pgdata` keeps the data until
`docker volume rm`. Nothing else on the host depends on these units.

## Secrets by name

| Name                                | Where                       | Who                                                                                                                           |
| ----------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD` (+ user, db)    | `db.env`                    | generated on the VPS, never shown                                                                                             |
| `DATABASE_URL`                      | render `.env`               | built on the VPS from the above                                                                                               |
| `SESSION_SIGNING_KEY` (>= 32 chars) | render `.env`               | generated on the VPS; changing it kills every issued key                                                                      |
| `RENDER_API_KEY`                    | render `.env` and `bot.env` | generated on the VPS; the same value on both sides                                                                            |
| `OWNER_TELEGRAM_ID`                 | render `.env`               | owner                                                                                                                         |
| `TELEGRAM_BOT_TOKEN`                | render `.env`               | owner, from @BotFather (the house bot the owner is notified through); optional, a missing one only silences the owner message |
| `BOT_TOKEN_12`                      | `bot.env`                   | owner, from @BotFather, written on the VPS by the owner himself                                                               |

## Needs the owner (the bot)

Everything above makes the render, the course key and the CRM touches work.
The bot process (`t27ai-bot`, the Telegraf monolith, root `Dockerfile`) is
**not started by this kit** until these are settled:

- a fresh `BOT_TOKEN_12` from @BotFather (the old tokens answer 401/404); the
  owner writes it into `bot.env` on the VPS;
- the monolith's data store: it reads Supabase through Infisical in
  production and the Railway gateway it used is gone;
- the one-line change below.

## Parked (hand-written TypeScript, not in this PR)

`src/services/courseAccess.ts` still calls the render at a hard-coded Railway
host. Its sibling services read `RENDER_BASE_URL` first; the course door needs
the same line, nothing else:

```ts
const RENDER =
  process.env.RENDER_BASE_URL ||
  'https://vibee-render-production.up.railway.app'
```

The site's render address is generated from the course spec in trinity
(`renderBase`) and is a separate change there.
