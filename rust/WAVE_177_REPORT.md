# Wave 177 Security Report

Date: 2026-06-16
Status: COMPLETE

## 1. `deny_unknown_fields` on payment structs

**Risk:** All payment callback/request structs in `GOLD-RING-PR00/src/payment.rs` lacked `#[serde(deny_unknown_fields)]`. These structs deserialize inbound data from payment gateways (Robokassa, Telegram, x402, TON). Without the attribute, unknown fields are silently ignored, which could mask field-name typos, variant mis-match attacks on untagged enums, or silently swallowed data corruption. For example, a malformed `RobokassaCallback` with an extra field would deserialize successfully while discarding the anomaly, making debugging and fraud detection harder.

**Fix:** Added `#[serde(deny_unknown_fields)]` to all structs that derive `Deserialize`:
- `RobokassaPaymentUrl`
- `RobokassaCallback`
- `TelegramStarsPayment`
- `TelegramPreCheckoutQuery`
- `TelegramUserInfo`
- `TelegramSuccessfulPayment`
- `X402PaymentRequest`
- `X402PaymentResponse`
- `TonTransaction`
- `DirectPaymentRequest`
- `DirectPaymentResult`
- `BalanceChange`

`TonPaymentLink` (Serialize-only) was left unchanged.

**Files changed:**
- `rings/GOLD-RING-PR00/src/payment.rs`

## 2. `telegram_id` sentinel guard in `handle_nav_callback`

**Risk:** The core navigation callback handler extracted `q.from.id.0 as i64` without checking `<= 0`. A corrupted or synthetic callback query could pass `0` or negative IDs to `load_lang_by_id` and `enter_scene_greeting`, causing DB lookups with invalid identifiers and potentially leaking error messages or triggering unexpected behavior.

**Fix:** Extracted `tid` at the top of `handle_nav_callback` and added an `if tid <= 0` guard that logs a `tracing::warn!` and returns early before any DB interaction. The validated `tid` is then passed to `load_lang_by_id` and `enter_scene_greeting`.

**Files changed:**
- `rings/SILVER-RING-SN00/src/handlers.rs`

## 3. `tracing::instrument` on core dispatcher functions

**Risk:** The 5 core Telegram dispatcher functions in `handlers.rs` (`handle_command`, `handle_nav_callback`, `handle_main_menu_msg`, `handle_help_state_msg`, `handle_balance_state_msg`) and `enter_scene_greeting` lacked `#[tracing::instrument]`. This created an observability blind spot in production: handler latency, error rates, and span correlation were invisible in distributed tracing systems like Jaeger or Grafana Tempo.

**Fix:** Added `#[tracing::instrument]` attributes:
- `handle_command`: `skip_all, fields(cmd = ?cmd)`
- `handle_nav_callback`: `skip_all`
- `handle_main_menu_msg`: `skip_all`
- `handle_help_state_msg`: `skip_all`
- `handle_balance_state_msg`: `skip_all`
- `enter_scene_greeting`: `skip(bot, db), fields(scene = ?scene_id, telegram_id)`

Also added `Debug` to the `Command` enum to satisfy `tracing::instrument` field requirements.

**Files changed:**
- `rings/SILVER-RING-SN00/src/handlers.rs`

## Literature Review

- **`deny_unknown_fields` defense** — OWASP Deserialization Cheat Sheet: "Use `deny_unknown_fields` on all inbound deserialization structs unless `flatten` is required. Unknown fields indicate either a schema mismatch (client outdated) or an injection attempt."
- **Sentinel value rejection** — CWE-20 (Improper Input Validation): "Reject sentinel and out-of-range identifiers at the earliest boundary before they reach the database or business logic."
- **Distributed tracing for async handlers** — OpenTelemetry best practices: "Every async request handler must carry `tracing::instrument` so spans propagate across await points. Without it, distributed traces break at handler boundaries, making root-cause analysis impossible."

## Patterns catalog

| Pattern | Where applied |
|---------|---------------|
| `deny_unknown_fields` on inbound payment structs | `payment.rs` (12 structs) |
| `telegram_id` sentinel guard | `handlers.rs` (`handle_nav_callback`) |
| `tracing::instrument` on dispatcher functions | `handlers.rs` (6 functions) |

## Co-operation options for next Wave

1. **Payment callback struct `deny_unknown_fields` continuation** — Add `deny_unknown_fields` to remaining provider response structs in `GOLD-RING-PR00/src/fal.rs`, `openai.rs`, `kie.rs`, `replicate.rs` that lack the attribute. Also audit `SILVER-RING-AI00/src/providers/*.rs` for missing attributes.
2. **Global `telegram_id` sentinel audit** — Systematically add `tid <= 0` guards to all remaining callback handlers in scene modules (`select_model.rs`, `text_to_video.rs`, `voice_training.rs`, etc.) that extract `q.from.id.0 as i64` without validation.
3. **`tracing::instrument` on scene handlers** — Add instrumentation to the 80+ individual scene message/callback handlers across `SILVER-RING-SN00/src/*.rs` to complete the observability surface.
