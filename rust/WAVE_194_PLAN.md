# Wave 194 Security Plan

| Item | Value |
|------|-------|
| Date | 2026-06-18 |
| Branch | master |

## Literature Review

1. **grammY — "Scaling Up III: Reliability"** — Telegram bot frameworks emphasize that ALL state-mutating API calls (not just `send_message`) must have timeout wrappers. A stalled `dialogue.update` can leave the user in an inconsistent FSM state and block the handler thread indefinitely.
2. **PostgreSQL Docs — "Data Integrity"** — Input validation at enqueue time prevents logically invalid data from entering the queue. A `max_attempts` of zero or negative creates a silently undequeuable job — a form of logic-level denial of service.
3. **CWE-209: Information Exposure Through Error Messages** — Debug formatting (`{:?}`) on internal types sent to end users leaks implementation details, aiding reconnaissance and reducing the effort for targeted attacks.
4. **Tokio Docs — "Timeout Patterns"** — Timeout wrappers should be uniform across all I/O boundaries. Inconsistent wrapping (some calls use helpers, others use inline `tokio::time::timeout`) creates maintenance burden and makes it easy to miss a call site during refactors.
5. **OWASP API Security Top 10 — API7:2023** — Security misconfiguration includes missing input validation on parameters that control core business logic (like retry limits).

## Selected Fixes (exactly 3)

### Fix 1 — `dialogue.update` and `dialogue.exit` timeout wrappers in `handlers.rs` (MEDIUM)
**Files:** `rings/SILVER-RING-SN00/src/handlers.rs`, `rings/SILVER-RING-TG00/src/utils.rs`

**Problem:** `handlers.rs` contains 5 bare `dialogue.update(...).await?` calls and 1 bare `dialogue.exit().await?` call. Under Telegram API congestion or in-memory storage stalls, these hang indefinitely, leaving the user in an inconsistent FSM state and blocking the dispatcher thread. Wave 193 wrapped `send_message` in `handlers.rs` but left `dialogue.update` and `dialogue.exit` untouched.

**Approach:**
- Create `dialogue_update_timeout` and `dialogue_exit_timeout` helpers in `trios_mb_tg::utils.rs`, modeled after `send_message_timeout` and `answer_callback_query_timeout` (30s `TELEGRAM_API_TIMEOUT`).
- Replace all 6 bare calls in `handlers.rs` with the wrappers.
- The helpers return `Result<(), std::io::Error>`, which auto-converts to `HandlerError` via `?`.

**Calls to wrap:**
- `dialogue.update(Scene::MainMenu).await?;` (lines 227, 313, 326)
- `dialogue.update(scene).await?;` (lines 236, 270)
- `dialogue.exit().await?;` (line 231)

---

### Fix 2 — `max_attempts` validation at enqueue time (MEDIUM)
**File:** `rings/SILVER-RING-JB00/src/queue.rs`

**Problem:** `request.max_attempts.unwrap_or(3)` accepts any `i32`, including `0` and negative values. When `max_attempts <= 0`, the dequeue condition `attempts < max_attempts` is always false, so the job is never dequeued and remains in `Queued` status forever. This is a logic-level DoS: a single malformed enqueue request creates a permanently stuck job.

**Approach:**
- Add validation: `let max_attempts = request.max_attempts.unwrap_or(3).max(1);`
- Log a warning if the original value was <= 0, but clamp to at least 1.
- Also update `TEST-UTILS/src/mock_job_queue.rs` line 45 to match.

---

### Fix 3 — `send_message_timeout` in Instagram handlers + info disclosure fix (MEDIUM/LOW)
**Files:** `rings/SILVER-RING-SN00/src/instagram_scraping.rs`, `rings/SILVER-RING-SN00/src/instagram_parser.rs`, `rings/SILVER-RING-SN00/src/subscription.rs`

**Problem A:** `instagram_scraping.rs` and `instagram_parser.rs` contain 15 bare `bot.send_message(...).await?` calls without timeout wrappers. Under Telegram API congestion, these stall the handler thread.

**Problem B:** `subscription.rs` line 30 uses `format!("{:?}", st)` which leaks internal Rust enum variant names and field structure to end users via Telegram messages.

**Approach:**
- Replace all bare `bot.send_message` calls in both Instagram files with `send_message_timeout(&bot, chat_id, text, None).await?;`.
- Add `use trios_mb_tg::send_message_timeout;` to both files.
- Replace `format!("{:?}", st)` in `subscription.rs` with a user-friendly string based on the `Subscription` enum variants (e.g., `match st` to produce localized text like "Free", "Basic", "Pro").

## Deferred Items

| Item | Severity | Reason |
|------|----------|--------|
| Remaining 89 `dialogue.update` calls across 38 files | MEDIUM | Only `handlers.rs` wrapped in this wave. Other files deferred incrementally. |
| Remaining 216 `bot.send_message` calls across 40 files | MEDIUM | `handlers.rs` + 2 Instagram files done. Remaining deferred. |
| `check_json_body_size` chunked-transfer bypass | MEDIUM | Would touch all 9 provider files. Large refactor deferred. |
| `spawn_traced` divergence between worker.rs and main.rs | MEDIUM | Architectural change requiring careful testing. Deferred. |
| `dotenvy::dotenv().ok()` path validation | LOW | Startup-only, deferred. |

## Verification Steps

1. `cargo check -p trios-mb-tg -p trios-mb-jobs -p trios-mb-scenes` on host target
2. `cargo test -p trios-mb-e2e-tests --test e2e_jobs`

## Commit Message

```
feat: Wave 194 — dialogue timeout wrappers, max_attempts validation, instagram fixes

- Fix 1: Added dialogue_update_timeout and dialogue_exit_timeout
  helpers in trios_mb_tg::utils.rs, and wrapped all 6 bare calls
  in handlers.rs to prevent FSM state-loss under API congestion.
- Fix 2: Enforced max_attempts >= 1 at job enqueue time,
  preventing permanently undequeuable jobs from malformed requests.
- Fix 3: Replaced bare bot.send_message in instagram_scraping.rs
  and instagram_parser.rs with send_message_timeout. Fixed
  subscription.rs info disclosure by replacing {:?} with
  localized variant names.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
