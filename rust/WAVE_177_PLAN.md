# Wave 177 Plan

Date: 2026-06-16

## Research Summary

### Weaknesses identified

1. **Missing `deny_unknown_fields` on payment structs (MEDIUM)** — All payment callback/request structs in `GOLD-RING-PR00/src/payment.rs` lack `#[serde(deny_unknown_fields)]`. These structs deserialize inbound data from payment gateways (Robokassa, Telegram, x402, TON). Without the attribute, unknown fields are silently ignored, which could mask field-name typos, variant mis-match attacks on untagged enums, or silently swallowed data corruption.

2. **Missing `telegram_id` sentinel guard in `handle_nav_callback` (MEDIUM)** — The core navigation callback handler extracts `q.from.id.0 as i64` at lines 215 and 233 without checking `<= 0`. A corrupted or synthetic callback query could pass `0` or negative IDs to `load_lang_by_id` and `enter_scene_greeting`, causing DB lookups with invalid identifiers and potentially leaking error messages.

3. **Missing `tracing::instrument` on core dispatcher functions (MEDIUM)** — The 5 core Telegram dispatcher functions in `handlers.rs` (`handle_command`, `handle_nav_callback`, `handle_main_menu_msg`, `handle_help_state_msg`, `handle_balance_state_msg`) and `enter_scene_greeting` lack `#[tracing::instrument]`. This creates an observability blind spot in production: handler latency, error rates, and span correlation are invisible in Jaeger/Grafana Tempo.

### Literature

- **`deny_unknown_fields` defense** — OWASP Deserialization Cheat Sheet: "Use `deny_unknown_fields` on all inbound deserialization structs unless `flatten` is required. Unknown fields indicate either a schema mismatch (client outdated) or an injection attempt."
- **Sentinel value rejection** — CWE-20 (Improper Input Validation): "Reject sentinel and out-of-range identifiers at the earliest boundary before they reach the database or business logic."
- **Distributed tracing for async handlers** — OpenTelemetry best practices: "Every async request handler must carry `tracing::instrument` so spans propagate across await points. Without it, distributed traces break at handler boundaries, making root-cause analysis impossible."

## Selected Fixes (3 items)

### Fix 1: `deny_unknown_fields` on payment structs
**File:** `rings/GOLD-RING-PR00/src/payment.rs`
- Add `#[serde(deny_unknown_fields)]` to all structs that derive `Deserialize`:
  - `RobokassaCallback`
  - `TelegramPreCheckoutQuery`
  - `TelegramUserInfo`
  - `TelegramSuccessfulPayment`
  - `X402PaymentResponse`
  - `TonTransaction`
  - `DirectPaymentRequest`
  - `DirectPaymentResult`
  - `BalanceChange`
- Keep `Serialize` untouched on outbound-only structs (`RobokassaPaymentUrl`, `TelegramStarsPayment`, `X402PaymentRequest`, `TonPaymentLink`) since they are not deserialized from external input. Actually, `X402PaymentRequest` and `DirectPaymentRequest` are also deserialized from API requests, so they get the attribute too.

### Fix 2: `telegram_id` sentinel guard in `handle_nav_callback`
**File:** `rings/SILVER-RING-SN00/src/handlers.rs`
- Extract `tid` from `q.from.id.0 as i64` at the top of `handle_nav_callback`.
- Add `if tid <= 0 { tracing::warn!(...); return Ok(()); }` guard before any DB call or `enter_scene_greeting`.
- Pass the validated `tid` to `load_lang_by_id` and `enter_scene_greeting`.

### Fix 3: `tracing::instrument` on core dispatcher functions
**File:** `rings/SILVER-RING-SN00/src/handlers.rs`
- Add `#[tracing::instrument(skip_all)]` to:
  - `handle_command`
  - `handle_nav_callback`
  - `handle_main_menu_msg`
  - `handle_help_state_msg`
  - `handle_balance_state_msg`
- Add `#[tracing::instrument(skip(bot, db, telegram_id), fields(scene = ?scene_id, telegram_id))]` to `enter_scene_greeting`.

## Verification Steps

1. `cargo check -p trios-mb-proto` for `deny_unknown_fields` changes.
2. `cargo check -p trios-mb-scenes` for handler changes.
3. `cargo check --workspace` for full compilation.
