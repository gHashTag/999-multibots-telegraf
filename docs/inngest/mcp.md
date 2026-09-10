# Inngest MCP — read-only health tools

`src/inngest_app/mcp-server.ts` is a stdio MCP server. Besides the historical
tools (`send_event`, `invoke_function`, …) it now exposes three **read-only**
tools that never send events or invoke functions:

| tool | input | returns |
|---|---|---|
| `inngest_health` | — | text: app connectivity + 24h completed/failed/running, failing functions, manifest↔app drift |
| `inngest_functions` | `domain?` | JSON: manifest functions joined with live status (`id, slug, triggers, control, deployed, runs24h, runs7d, lastRun, lastError`) |
| `inngest_failed_runs` | `run_id?` | JSON: functions with `runs24h.failed > 0` and their `lastError`; with `run_id` → `run(runID){id status output}` |

Runs are read in pages of 200 (`RUNS_PAGE_SIZE`): the server silently answers `first ≥ 400` with its default 40, so until 2026-09-10 every counter here was built on the newest 40 runs only.

Counters (`runs24h`, `runs7d`) have an `invoked` field: runs started by `invokeFunction`
(dashboard, MCP, `/inngest_probe`; event name `inngest/function.invoked…`) are counted there and in
`total` only — never as completed/failed — and never become a function's `lastError`. Reason: on
2026-09-09 22:11 one probe suite made the 24 h report read "10 failed, 41.7 %".

Data source: `INNGEST_GQL_URL` (default `${INNGEST_BASE_URL}/v0/gql`, falls back
to `INNGEST_DEV_URL`, then `http://127.0.0.1:8288`). Same code path as
`GET /api/inngest/functions/status` (30 s cache).

## Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "inngest-999": {
      "command": "bun",
      "args": ["run", "/ABS/PATH/999-multibots-telegraf/src/inngest_app/mcp-server.ts"],
      "env": {
        "INNGEST_GQL_URL": "http://127.0.0.1:8288/v0/gql"
      }
    }
  }
}
```

## Claude Desktop / Claude Code (`claude_desktop_config.json` or `.mcp.json`)

```json
{
  "mcpServers": {
    "inngest-999": {
      "command": "bun",
      "args": ["run", "/ABS/PATH/999-multibots-telegraf/src/inngest_app/mcp-server.ts"],
      "env": { "INNGEST_GQL_URL": "http://127.0.0.1:8288/v0/gql" }
    }
  }
}
```

For production data, tunnel the private Inngest service first
(`railway ssh`/port-forward) and point `INNGEST_GQL_URL` at the tunnel — see
[security.md](./security.md). Do not point it at a public Inngest URL; there
should not be one.

## Inngest's own MCP endpoint

The self-hosted Inngest server also serves `/mcp`. It requires
`Authorization: Bearer <INNGEST_SIGNING_KEY>`; it is a *write-capable* surface
(invoke, cancel). Prefer the read-only tools above for agents; use `/mcp` only
from an operator's machine with the signing key.

Observed 2026-09-10 against the current server: `initialize` answers without
any header (serverInfo `inngest-dev` 1.0.0, tools capability), `tools/call`
does not. The Inngest UI's "Dev Server MCP Setup" page shows the client-side
configuration for Claude Code, Codex and Cursor:

```bash
# Claude Code
claude mcp add --transport http inngest-dev <INNGEST_URL>/mcp
# Codex
codex mcp add inngest-dev --url <INNGEST_URL>/mcp
```

```json
// Cursor: .cursor/mcp.json
{ "mcpServers": { "inngest-dev": { "url": "<INNGEST_URL>/mcp" } } }
```

`<INNGEST_URL>` is the address the *client's* machine can reach. Claude
Desktop's main chat only accepts a public URL — which is exactly what
[security.md](./security.md) step 5 removes. Do not keep the public Railway
domain for the sake of Claude Desktop; use the stdio server above (read-only,
runs on the operator's machine) or reach `/mcp` over a tunnel to the private
network. Claude Code, Codex and Cursor work with either.

To *trigger* every served function in safe mode (not just read its status), see
`docs/inngest/probe-suite.md` — the admin command `/inngest_probe`.
