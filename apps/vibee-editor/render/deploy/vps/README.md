# vibee-render on the T27OS VPS -- the migration kit

The render service (`render/src/render-server.ts`) currently runs on Railway
(`vibee-render-production.up.railway.app`). This kit moves it onto the
project's own VPS under systemd + docker compose, with Caddy terminating TLS.
Railway stays for the mini app.

## MEASURED HARDWARE FLOOR (2026-10-26)

The current VPS (331257.fornex.cloud) does NOT meet it -- do not deploy there
before the upgrade:

| resource  | current VPS      | floor for this service                     |
| --------- | ---------------- | ------------------------------------------ |
| CPU       | 2 cores          | 4 cores (Remotion renders eat all of them) |
| RAM       | 3.8 GB, 2.1 free | 8 GB (headless Chrome + ffmpeg per render) |
| disk free | 14 GB (65% used) | 40 GB (the image alone is 5-8 GB: Chrome,  |
|           |                  | ffmpeg, verilator, yosis, iverilog, deno)  |

The image is the SAME Dockerfile Railway builds (`render/Dockerfile`, build
context `apps/vibee-editor`), so a machine that meets the floor runs exactly
what production runs.

## Deploy (one evening, after the upgrade)

1. Clone with a deploy key:
   `gh repo deploy-key add` or a fine-grained token; then
   `git clone git@github.com:gHashTag/999-multibots-telegraf.git /opt/vibee-render/repo`
2. Secrets: copy the variable set from the Railway service (railway variables)
   or Infisical into `/opt/vibee-render/.env` (chmod 600). `env.example` lists
   every name the code reads; the only one that MUST change value is
   `RAILWAY_SERVICE_QUEEN_OLLAMA_URL` -- that is Railway-internal DNS, so on
   the VPS either expose queen-ollama or accept the chain without its ollama
   leg (the agent answers; `OLLAMA_ENABLED` stays unset).
3. `cd /opt/vibee-render/repo/apps/vibee-editor/render/deploy/vps`
   `cp docker-compose.yml vibee-render.service caddy-vibee-render.conf /opt/vibee-render/`
   `docker compose -f /opt/vibee-render/docker-compose.yml build`
4. `cp vibee-render.service /etc/systemd/system/ && systemctl daemon-reload`
   `systemctl enable --now vibee-render`
5. Caddy: append `caddy-vibee-render.conf` to the Caddyfile, set the DNS
   record (a duckdns name works -- see givel-tma precedent), reload Caddy.
6. Healthcheck: `curl https://<name>.duckdns.org/health` (first boot warms
   Chrome; allow 300 s, the same window Railway uses).

## Cutover

The bot points at the render through ONE variable: `RENDER_BASE_URL`-shaped
BASE in `src/services/modelSwitch.ts` is read from the bot's env -- flip the
bot's render URL to the VPS name, restart the bot process. Keep Railway warm
for a day as the rollback path, then power the Railway service down.

## Rollback

Flip the bot's BASE back to `https://vibee-render-production.up.railway.app`
and restart the bot. The VPS service keeps running; nothing else to undo.
