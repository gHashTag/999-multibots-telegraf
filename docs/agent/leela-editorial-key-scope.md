# Leela editorial credential — draft-only-v1

Status: implementation contract, 2026-09-12. Not deployed or provisioned.

## Problem and boundaries

Leela needs private draft synchronization without a full user's publishing,
finance, Telegram, agent-chat, or shared SOUL authority. Use the existing MCP
server and existing private skills/content-plan storage, not another backend.
The root SOUL and personal `user_soul` are explicitly out of scope.

This contract precedes the implementation. The repository points to the central
t27 spec bank but contains no local `.t27` compiler/spec workflow for this
service; this patch is not claimed to be generated or compiler-certified.

## Runtime contract

- Optional server configuration: `LEELA_EDITORIAL_AGENT_KEYS=key:telegramId`,
  comma-separated pairs. Values belong only in the render service's secret
  manager, never source, logs, chat, URLs, or the browser. Use independent random
  keys. Do not reuse `AGENT_KEYS`, `RENDER_API_KEY`, or a bot token.
- Bind to the actual positive numeric Telegram ID from Leela's private claim
  and explicit owner approval. A username or stored public profile alone is
  not proof. No global administrator, keeper, finance, or publication grant.
  The canonical actor domain matches Leela: `/^[1-9]\d{0,15}$/` and
  `Number.isSafeInteger(Number(owner))`, including small IDs and the maximum
  safe integer; no arbitrary five-digit minimum or fifteen-digit maximum.
- Only `X-Agent-Key` authenticates this scope. A recognized editorial key in
  `X-Api-Key`, Authorization, either Telegram init-data header, duplicated
  headers, or alongside another credential is denied, even in warn mode.
  Editorial/full-key collisions never upgrade: editorial precedence applies.
  Ambiguous or malformed matching bindings fail closed.
- Credential-bearing requests may reach only `POST /mcp` and harmless
  `GET /mcp`, `GET /health`, and the two existing well-known agent cards.
  All other routes (including public paths, chat and A2A) are forbidden before
  public-route bypass. Ordinary credentials retain their existing behavior.
- Scoped `initialize` adds exactly
  `result._meta["leela.editorial.scope"] = "draft-only-v1"`.
  Full credentials never receive this marker.
- `tools/list` returns exactly these existing schemas:
  `whoami`, `skills_list`, `skills_create`, `plan_list`,
  `plan_goal_create`, `plan_item_add`.
- Calling any other tool returns JSON-RPC error `-32003`, before obtaining a
  database pool or dispatching a handler. HTTP path/credential denial is 403.
- MCP validates a non-null, non-array JSON object before reading its ID:
  `jsonrpc: "2.0"`, a nonempty string method, and optional object/non-array
  params. An optional ID must be null, a string, or a finite number.
  Invalid envelopes return HTTP 400 / JSON-RPC `-32600` with `id: null`;
  malformed JSON retains the existing `-32700` response. This validation applies
  to both editorial and full credentials and prevents an uncaught null access.
- `whoami` returns only the credential-bound `telegram_id`. The bridge must
  compare it to its approved actor before any reads or writes.
- Scoped skills are private and named with the exact case-sensitive `Leela:`
  prefix. Scoped goals and item titles use the same prefix. Lists are restricted
  to the bound person's private Leela skills/goals; item insertion must verify
  both the bound owner and Leela goal namespace. No caller-supplied identity or
  scope is trusted. A title namespace is not a new bot/project tenant boundary.
- Existing result envelopes stay unchanged: tool output is in
  `result.structuredContent`, also JSON text in `result.content`.
  Existing tool length/quota limits and default `idea` status remain.

## Acceptance and implementation plan

1. Shared, lazy credential policy used before public bypass and before all
   identity precedence/fallback paths; no database lookup for editorial keys.
2. Carry scope explicitly into MCP dispatch and tool context, and deny editorial
   keys at direct chat/A2A entry points even without the outer HTTP guard.
3. Behavioral tests execute actual auth/resolver/dispatcher with a denial matrix
   for public/protected paths, alternate/mixed headers, collisions, invalid
   bindings, wrong identities, and every tool outside the six-name allowlist.
4. Test real namespace filters and ownership queries against a query-aware fake.
   Kill at least one mutation of the actual authorization/dispatch guard.
5. Run targeted security regressions and service/test type checking. No live
   credential configuration, database calls, deployment, commit, or push.

## Operational limitations

- Revocation: remove the dedicated pair from deployed secret configuration and
  restart/redeploy according to the service's normal rollout procedure. Never
  leave the same secret in another key store; otherwise removal could restore
  the other credential's authority.
- Storage is still user-scoped. Skills can influence that user's other agents
  if those agents load every skill; Leela skills must contain explicit triggers.
- Existing list handlers lazily ensure their tables; "read" means no user-content
  mutation, not a database role with zero DDL privileges.
- Item creation has no unique day-title constraint. The bridge should reconcile
  by exact title and serialize its sync. This is retry-friendly, not guaranteed
  exactly-once under concurrent writers. No schema change is introduced here.
- A stolen editorial key can read/create within its approved user's Leela
  namespace. Rate limits, key rotation, and approval remain operational duties.
