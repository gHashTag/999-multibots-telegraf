# Inngest security notes (self-hosted server on Railway)

Status as of 2026-09-09. Applies to the self-hosted Inngest server that the
`telegram-bot-client` app (`src/api_server`, `serve()` at `/api/inngest`)
registers with.

## 1. What is exposed today

| Surface | Auth today | Risk |
|---|---|---|
| Inngest server GraphQL `POST <public-railway-url>/v0/gql` | **none** | read *and* write: `runs`, `apps`, event payloads (user ids, texts), plus mutations (`invokeFunction`, `cancelRun`, `rerun`) reachable by anyone who knows the URL |
| Inngest server UI `/` | none | same data as above, visually |
| Inngest server event ingest `/e/<key>` | event key | expected; keep `INNGEST_EVENT_KEY` secret |
| Inngest server MCP `/mcp` | `Authorization: Bearer <INNGEST_SIGNING_KEY>` | fine as long as the signing key stays private |
| App `POST /api/inngest` (serve handler) | Inngest request signature (`INNGEST_SIGNING_KEY`) | fine — unsigned calls get 401 from the SDK |
| App `GET /api/inngest/functions/status` (this PR) | none, **read-only**, 30 s cache, CORS allow-list | exposes function ids, run counts, last error ids — no payloads, no mutations |

The probe on 2026-09-09 used the unauthenticated GraphQL endpoint to enumerate
runs for all 28 functions from outside Railway. That is the gap this document
closes: once the public status endpoint exists on the app, **the Inngest
service itself no longer needs a public URL**.

## 2. Target state

```
           internet
              │
              ▼
   ┌───────────────────────┐        private network (railway.internal)
   │ app: 999-multibots    │──────────────────────────────────────────┐
   │  /api/inngest (serve) │◄── Inngest server calls back here        │
   │  /api/inngest/functions/status  (public, read-only)              │
   └───────────────────────┘                                          ▼
                                                    ┌────────────────────────────┐
                                                    │ inngest (self-hosted)      │
                                                    │ http://inngest.railway.    │
                                                    │        internal:8288       │
                                                    │  /v0/gql, /e/<key>, /mcp   │
                                                    │  NO public domain          │
                                                    └────────────────────────────┘
```

Consumers of run data (t27.ai «Функции» tab, log-monitor fallback, MCP
health tools) read `GET /api/inngest/functions/status` on the app, which in
turn queries GraphQL over the private network.

## 3. Railway steps (private Inngest service)

Do these in order; each step is reversible.

1. **Deploy this PR** so the app exposes `/api/inngest/functions/status`
   and reads `INNGEST_GQL_URL` / `INNGEST_BASE_URL`.
2. **Set variables on the app service** (Railway → app → Variables):
   - `INNGEST_BASE_URL=http://inngest.railway.internal:8288`
     (or the existing `INNGEST_DEV_URL` if that is what the SDK uses today —
     both are honoured by `resolveInngestGqlUrl()`).
   - optional `INNGEST_GQL_URL=http://inngest.railway.internal:8288/v0/gql`
     (explicit override; default is `${INNGEST_BASE_URL}/v0/gql`).
   - keep `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` unchanged.
3. **Point the Inngest server at the app over the private network** (Inngest
   service → Variables): the app URL used by the server to call
   `/api/inngest` should be `http://<app-service>.railway.internal:<PORT>/api/inngest`
   (`INNGEST_SDK_URL` / "App URL" in the dashboard "Apps → Sync"). Re-sync the
   app in the Inngest UI once and confirm `connected: true` via
   `GET /api/inngest/functions/status`.
4. **Verify from the app** with the private URL before removing the public
   one: `curl -s https://<app-public-url>/api/inngest/functions/status | jq .app`
   must show `connected: true` and `functions[].deployed: true` for the 28
   served functions.
5. **Remove the public domain from the Inngest service** (Railway → inngest
   service → Settings → Networking → delete the public domain). Keep only the
   private `inngest.railway.internal` hostname.
6. **Operators' access to the Inngest UI** afterwards: `railway ssh` /
   `railway run` port-forward, or a Tailscale/Cloudflare Access sidecar. Do
   **not** re-add a public domain "just for the UI".
7. **MCP for Cursor/Claude**: use the app's stdio MCP server
   (`src/inngest_app/mcp-server.ts`, tools `inngest_health`,
   `inngest_functions`, `inngest_failed_runs`) with `INNGEST_GQL_URL` pointing
   at the private URL through a Railway tunnel, or Inngest's own `/mcp` with
   `Authorization: Bearer <INNGEST_SIGNING_KEY>` — never expose `/mcp` without
   the bearer token.

## 4. Rollback

Re-add the public domain to the Inngest service and unset `INNGEST_GQL_URL`.
The app's status endpoint degrades to `503 {error:"inngest-unreachable"}` if
GraphQL is not reachable — it never throws and never blocks the bot.

## 5. Invariants enforced by tests

- `src/__tests__/inngest/functionsStatus.test.ts`: the three GraphQL queries
  contain no `mutation`; CORS allow-list is exactly `https://t27.ai` +
  `http://localhost:*`; unreachable Inngest → 503 error payload.
- `src/__tests__/api_server/mountOrder.test.ts`: the public status router is
  mounted before any `requireInternalKey` mount and before the serve handler.
- `src/__tests__/inngest/manifestConformance.test.ts`: nothing outside the
  manifest is served; nothing marked `code-only/unregistered` is served.

## 6. Safe mode (operational safety, not network security)

`isSafeMode(event)` (`src/inngest_app/safeMode.ts`) is true when
`event.data.e2e_test === true` or `INNGEST_SAFE_MODE=1`. In safe mode every
served function that charges balance, calls a paid API or messages users
redirects Telegram output to `ADMIN_CHAT_ID` and returns
`{ skipped: true, reason: 'safe-mode' }` from the paid/charging step. Use it
for every manual invoke from the Inngest UI or MCP — the 2026-09-09 probe of
`daily-sales-advisor` messaged 13 bot owners because no such switch existed.
