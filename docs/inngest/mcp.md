# Inngest MCP — read-only health tools

`src/inngest_app/mcp-server.ts` is a stdio MCP server. Besides the historical
tools (`send_event`, `invoke_function`, …) it now exposes three **read-only**
tools that never send events or invoke functions:

| tool | input | returns |
|---|---|---|
| `inngest_health` | — | text: app connectivity + 24h completed/failed/running, failing functions, manifest↔app drift |
| `inngest_functions` | `domain?` | JSON: manifest functions joined with live status (`id, slug, triggers, control, deployed, runs24h, runs7d, lastRun, lastError`) |
| `inngest_failed_runs` | `run_id?` | JSON: functions with `runs24h.failed > 0` and their `lastError`; with `run_id` → `run(runID){id status output}` |

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

To *trigger* every served function in safe mode (not just read its status), see
`docs/inngest/probe-suite.md` — the admin command `/inngest_probe`.
