# Wave 173 Security Hardening Plan

**Date:** 2026-06-16

## Selected Fixes

### 1. Telegram API Timeout Helpers (HIGH)
**File:** `rings/SILVER-RING-TG00/src/utils.rs` (new module)

All `bot.send_message`, `bot.answer_callback_query`, and `dialogue.update` calls are awaited directly without timeout. If Telegram API stalls, the handler hangs indefinitely, blocking the dispatcher worker.

**Fix:** Create a `utils.rs` module with `send_message_timeout`, `answer_callback_query_timeout`, and `update_dialogue_timeout` wrappers using `tokio::time::timeout(Duration::from_secs(30), ...)`. Apply to the most critical call sites in generation handlers and the cancel-predictions stub.

### 2. NavigationRouter TTL Eviction (MEDIUM)
**File:** `rings/SILVER-RING-TG00/src/navigation.rs`

`NavigationRouter` stores per-chat scene history in a `HashMap<i64, Vec<SceneId>>`. Entries for inactive chats are never removed, causing unbounded memory growth.

**Fix:** Add `last_accessed: HashMap<i64, Instant>` to track activity. Add `evict_inactive(threshold: Duration)` method that removes chats idle longer than the threshold (default 24 hours). Wire it into a periodic background task or call it on every Nth `enter()`.

### 3. Cancel-Predictions Stub Honesty (LOW)
**File:** `rings/SILVER-RING-SN00/src/cancel_predictions.rs`

The handler sends a confirmation message ("All active generations cancelled") but performs no actual cancellation. This misleads users into believing work was stopped while providers continue charging.

**Fix:** Change the message to an honest "Cancellation is not yet supported" and return `AppError::Ai(AiError::Provider { ... })` to signal the limitation upstream.

### 4. Remove `bypass_payment_check` Unused Flag (LOW)
**File:** `rings/GOLD-RING-PR00/src/payment.rs`

`DirectPaymentRequest` contains a `bypass_payment_check: Option<bool>` field that is never consumed anywhere. It is a dangerous toggle in the shared schema that could be accidentally used in future code.

**Fix:** Remove the field from the struct. Check compilation of all downstream consumers.

---

## Verification

```bash
cargo check -p trios-mb-tg -p trios-mb-scenes -p trios-mb-app -p trios-mb-proto
```

---

## Cooperation Options for Next Wave

1. **Telegram API Timeout Blanket** — Apply timeout wrappers to all 255+ remaining `bot.send_message` / `bot.answer_callback_query` / `dialogue.update` call sites across all scene handlers.
2. **In-Memory Storage Boundedness** — Migrate `InMemStorage<Scene>` to Redis-backed storage or add a background eviction task.
3. **Admin Identity De-hardcoding** — Move all hardcoded Telegram IDs (`SUPER_ADMIN_ID`, staff lists) to environment variables / secret store with startup validation.
