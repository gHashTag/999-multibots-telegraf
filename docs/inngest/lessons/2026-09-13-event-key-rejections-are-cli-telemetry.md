# Lesson 2026-09-13: `rejecting event; event key not recognized` on the self-hosted Inngest server was the server's own CLI telemetry

## What was observed (Railway production, read through the owner's browser)

- Service `inngest/inngest` (image `ghcr.io/ghashtag/inngest:mcp-auth`, v1.44.0 + MCP auth fix):
  ~11–12 log lines per minute `rejecting event; event key not recognized`, steady since the
  service exists, plus bursts of 8–9 lines within two seconds every minute and larger bursts at
  `:00`/`:30`. The upstream log line (`pkg/api/api.go`, `ReceiveEvent`) carries no key, sender or
  event name, so the audit of 2026-09-13 morning could only rule things out: bot and server share
  the same `INNGEST_EVENT_KEY` (SHA-256 compared in-page), no other Railway service has
  `INNGEST_*` variables, the public edge shows no `/e/…` requests, no process on the owner's Mac.
- The fork was rebuilt with diagnostics on the reject path (never the key itself):
  `key_sha256_prefix`, `key_len`, `user_agent`, `remote_addr`, `x_forwarded_for`, `host`,
  `event_names`. First 50 rejects after the redeploy (deployment `4acbc889`, 08:38Z):
  all from `127.0.0.1`, `User-Agent: go:v0.15.1`, `host 127.0.0.1:8288`, key length 86,
  events `cli/dev_ui.loaded` ×49 and `cli/command.executed` ×1.

## Cause [измерено]

`pkg/api/tel/tel.go` in the Inngest CLI creates an `inngestgo` client with a hard-coded
86-character Inngest Cloud event key (app id `tel`) and sends usage telemetry on every dev-UI
page load and command execution. Inside the container the Go SDK resolves its base URL to the
local server (`127.0.0.1:8288`), so the telemetry is posted to the very server that enforces
`INNGEST_EVENT_KEY` — and is rejected. Every request for the dashboard HTML (health checks,
status pollers, humans) produces one line. Function execution, bot events and Queen events were
never affected: legitimate `received event` lines use the shared key.

## What was done

- `DO_NOT_TRACK=1` added to the `inngest/inngest` service (approved by the owner; the CLI's own
  telemetry switch, `tel.Disabled()`), service redeployed.
- The fork keeps the diagnostic fields on the reject path
  ([gHashTag/inngest `deploy/v1.44.0-mcp-auth`](https://github.com/gHashTag/inngest/tree/deploy/v1.44.0-mcp-auth)),
  so the next real key mismatch names its sender in one log line.
- Bot side ([#2363](https://github.com/gHashTag/999-multibots-telegraf/pull/2363)): startup no
  longer prints 20–30-character prefixes of `RENDER_INNGEST_*` keys, and
  `reels-loop-generate` uses the shared client instead of a private one keyed by the unset
  `BOT_INNGEST_EVENT_KEY`.

## Rule

- A log line about a rejected credential must say **who** and **which** (hash prefix, length,
  remote address, user agent, event names) — otherwise the next audit spends hours ruling out
  candidates by hashing variables. Add the fields before hunting the sender.
- On a self-hosted Inngest with `INNGEST_EVENT_KEY`, set `DO_NOT_TRACK=1`; otherwise the
  server's own telemetry fills the error log at the rate the dashboard is polled.
- Before treating `FAILED` runs as broken functions, read `functions.manifest.json`:
  `probe_expect = FAILED-at-guard` runs with `e2e_test: true` are the probe suite doing its job
  (witness `docs/inngest/witness/2026-09-13-probe-suite-02-17Z.json`: 28/28 match).
