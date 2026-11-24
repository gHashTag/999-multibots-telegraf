# One step per batch, not one step per audience (2026-10-09)

Spec: t27 `specs/functions/broadcast-message-send.t27` (PR gHashTag/t27#8021).

## What happened

`broadcast-message-send` sent to the whole audience inside one `step.run('send-messages')`. Inngest memoises a step only once it returns, so a crash or timeout at recipient 400 of 500 re-ran the step from recipient 1 on retry: 399 people got the message twice. The service also re-queried the users table inside the send, ignoring the list `fetch-users` had already produced, and a Telegram 429 was logged like any other error while its `retry_after` was never read.

## Rules that follow

1. The unit of memoisation is the step. Any loop over external side effects (messages, payments, API calls) that can exceed a few seconds goes one `step.run` per bounded batch; name the step after stable data in the batch (`send-batch-<firstId>`), not after the loop index alone.
2. Put `step.sleep` between batches rather than `setTimeout` inside the step: the sleep is durable and costs no HTTP budget.
3. Hand the step exactly the rows it must process (`recipients`), never let it re-derive the audience from the database -- a re-derived audience can differ from the one the previous batch was cut from.
4. Inside a batch, a 429 is waited out (`retry_after`, capped) and the recipient counted as an error. Throwing `RetryAfterError` at batch level would re-run the whole batch and double-send to those already served.
5. Fan-outs from one bot token get `concurrency: 1` keyed on `bot_name`; two overlapping broadcasts share the same ~30 msg/s budget and trip 429 for both.

## Not verified

No live broadcast on the deployed build; the 1s pause and batch size 25 are from Telegram's published bot-wide limit, not from a measurement on this bot.
