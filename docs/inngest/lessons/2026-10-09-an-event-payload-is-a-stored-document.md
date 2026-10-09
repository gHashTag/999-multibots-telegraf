# An event payload is a stored document (2026-10-09)

Spec: t27 `specs/functions/reels-loop-generate.t27`, `specs/functions/content-scripts-generate.t27` (PR gHashTag/t27#8023).

## What happened

`reels-loop-generate` built its Telegraf from `event.data.bot_token`; `content-scripts-generate` accepted `openai_api_key` in its zod schema and preferred it over the env. Inngest stores every event with its run and shows the payload in the dashboard and in traces; both secrets were therefore readable to anyone with dashboard access, for as long as the run history is kept.

## Rules that follow

1. An event carries identifiers, never credentials: `bot_name`, not `bot_token`; nothing for API keys. The step resolves the credential from env or the registry (`getBotByName`).
2. When a legacy sender cannot be changed at once, keep the old field as a fallback that logs a warning without printing the value, and mark it deprecated in the spec. The leak then ends when the sender is fixed, and the function tells you which sender still leaks.
3. Removing a field from a zod schema is a safe migration step: zod strips unknown keys, so an old sender keeps working while the function stops reading the secret. It does not scrub the stored event -- that is the sender's fix.
4. Step outputs are stored too. Never return a bot instance, a token, or a client from `step.run`.

## Not verified

Whether the self-hosted Inngest dashboard is reachable without login was not checked (earlier note: the UI loaded without a sign-in; whether payloads are readable unauthenticated is unknown). The sender of `reels/loop.generate` is outside the repo.
