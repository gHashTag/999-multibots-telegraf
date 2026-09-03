# Omnichannel agent chat contract

Date: 2026-09-01

## User-visible contract

1. `@t27ai_bot` accepts ordinary private text messages without requiring a
   menu, model-selection button, or wizard.
2. Telegram and the Mini App use the same Trinity agent, tool registry, owner
   identity and canonical conversation stored in Railway PostgreSQL.
3. A message written in Telegram appears in the Mini App history and a message
   written in the Mini App is part of the next Telegram turn.
4. Telegram shows a native live draft while the answer is generated and then
   sends one persistent final message. Tool execution is shown as a temporary
   status, not as hidden chain-of-thought.
5. The Mini App keeps its structured streaming UI (text deltas, tool status,
   asset previews) and rehydrates completed server messages after reload.

## Identity and data boundaries

- Mini App identity comes only from verified Telegram `initData`, an app
  session, or an already owner-bound agent key. No `telegramId` is accepted in
  request bodies or query strings.
- Telegram identity comes only from the update delivered to the existing Stars
  webhook of `@t27ai_bot`. Both its random path and Telegram
  `X-Telegram-Bot-Api-Secret-Token` header are required; group/channel messages
  and bot senders are ignored. The path and header use independent secrets, so
  an edge access-log leak of the URL cannot forge the header.
- Every stored message is scoped by the verified Telegram owner. External
  update/message IDs are idempotency keys; webhook retries must not create a
  second model run or duplicate transcript rows.
- Raw provider reasoning, credentials, upstream response bodies and webhook
  secrets are never stored, streamed or logged.
- Tool calls keep the existing approval, quota and ownership rules. A chat
  transport must not widen the tool registry.

## Persistence and streaming protocol

- The server owns message IDs, channel metadata and timestamps.
- Store the user turn before generation. Store the completed assistant turn
  after generation with `delivery=pending`, including redacted tool names.
  Telegram persists `next_chunk`, total chunks and returned Bot API message IDs
  after every final chunk, then marks the reply `sent`. A webhook retry resumes
  only final delivery from the first unrecorded chunk.
- A duplicate durable user turn with no assistant row never replays the model
  or tools: the server stores an explicit interrupted assistant message and
  requires a new human message to retry. This avoids repeating an unknown
  partially completed side effect.
- All turns and new-thread markers take the same bounded PostgreSQL advisory
  lock for the verified owner. A crash releases the lock automatically.
- Load a bounded, oldest-first tail for model context and UI hydration.
- Browser streaming remains authenticated `fetch` + NDJSON because
  `EventSource` cannot attach Telegram auth headers.
- Telegram uses Bot API `sendMessageDraft`, updated at most once per second,
  and always follows it with `sendMessage`; `sendChatAction` is the fallback.
- A disconnected Mini App recovers persisted messages on the next history
  load. It never automatically replays an incomplete model/tool run. If only a
  durable user row exists, the retry request converts it to an explicit
  interrupted assistant message; the owner deliberately sends a new turn.
- Telegram final delivery is at-least-once across the unavoidable crash window
  between a successful Bot API response and the following metadata update.
  Per-chunk progress limits that window to the just-sent chunk rather than the
  whole answer.
- “New conversation” advances an owner epoch under the same lock. It does not
  destroy transcript rows and cannot race an active turn.

## Acceptance criteria

- A signed Mini App owner can GET only their canonical history and POST a new
  message without supplying history or an identity field.
- A private Telegram text update creates one user row, executes `runAgent`
  once, streams drafts, creates one assistant row and sends one final reply.
- Replaying a completed Telegram update is a no-op. Replaying an incomplete
  update never restarts generation: it resumes a persisted pending final reply
  or stores a deterministic interrupted reply under the owner lock.
- A second owner cannot read or influence the first owner's transcript.
- Mini App hydration merges server history without duplicating an in-flight
  local message.
- `/start` and `/help` return a deterministic button-free welcome without a
  model call; payment updates and non-private/non-text updates do not enter the
  agent text path.
- Focused tests, render/player typecheck, production builds and responsive chat
  QA are green before release.

## Primary-source rationale

- Telegram Bot API `sendMessageDraft` is an ephemeral streaming preview; the
  final result must be persisted with `sendMessage`. Draft updates share Bot
  API rate limits, so the application throttles them locally.
- Telegram webhooks support `secret_token`; delivery is retryable, so update
  processing must be idempotent.
- Persistent chat UIs need server-generated message IDs, storage on completion,
  and rehydration after disconnect. Structured start/delta/tool/finish events
  keep presentation separate from model context.

References:

- https://core.telegram.org/bots/api#sendmessagedraft
- https://core.telegram.org/bots/api#setwebhook
- https://core.telegram.org/bots/features#streaming-replies
- https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence
- https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams
- https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol

## Rollout and rollback

1. Non-revertable prerequisite: apply
   `migrations/20260901_agent_conversation_messages.sql`, then run
   `make agent-conversation-preflight`. Runtime requests never create schema.
2. Create a new independent `TELEGRAM_WEBHOOK_HEADER_SECRET` out of band. While
   the old path-only handler is still live, call `setWebhook` with the existing
   URL plus that `secret_token` and payment-only `allowed_updates`; record the
   successful Bot API response. `getWebhookInfo` verifies URL/update settings
   but deliberately cannot reveal or prove the secret.
3. Deploy the strict path+header prerequisite with the agent flag still off,
   then trigger one owner-controlled benign Telegram update and record a real
   successful delivery through the header boundary. This security prerequisite
   is not reverted with the product. If the canary fails, repair/re-set the new
   secret; never restore path-only authentication.
4. Deploy and smoke render while `TELEGRAM_AGENT_WEBHOOK_ENABLED` is absent.
   The existing webhook remains payment-only, but now requires both secrets.
5. Deploy the player and verify owner history hydration and new-thread archive.
6. Set `TELEGRAM_AGENT_WEBHOOK_ENABLED=1` only when `BOT_TOKEN_12` and
   `TOKENS_PAYMENT_BOT_TOKEN` identify the same bot. The periodic webhook
   repair then adds `message` to `allowed_updates` and sets `secret_token`.
7. Roll back the product first by removing the flag, then revert only the
   transcript/transport/player product commit. Keep the additive migration and
   strict webhook header prerequisite. Never restore path-only authentication.
