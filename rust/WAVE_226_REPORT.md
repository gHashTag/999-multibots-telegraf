# WAVE 226 REPORT

## Summary
Three availability and input-validation hardening fixes applied across dialogue state handlers. All changes compile cleanly and existing tests pass.

---

## Fix 1 — Cap image accumulation in `morphing.rs`
**Severity:** HIGH  
**Category:** CWE-770 (Allocation of Resources Without Limits or Throttling)

The morphing handler accepted an unlimited number of uploaded photos into `MorphingState.images`, a `Vec<String>` persisted in `InMemStorage`. Because `InMemStorage` lacks TTL eviction, an attacker could send a stream of photos from many chats, causing per-chat state to grow unbounded until the bot process OOM-killed.

**File:** `rings/SILVER-RING-SN00/src/morphing.rs`

**Change:** Added `const MAX_MORPHING_IMAGES: usize = 10;` and a pre-push guard. When the cap is reached, the handler sends a localized error message ("Maximum 10 images allowed for morphing") and returns `Ok(())` without mutating state.

**Literature:** CWE-770 states that missing bounds on resource allocation allows attackers to exhaust memory, CPU, or storage. The `InMemStorage` backend compounds the risk because state is never evicted; a per-session cap is the standard compensating control.

---

## Fix 2 — Cap image accumulation in `train_flux_model.rs`
**Severity:** HIGH  
**Category:** CWE-770

Identical unbounded accumulation existed in `train_flux_model.rs`. `TrainFluxModelState.images` accepted unlimited `file_id`s. Flux LoRA training expects a bounded set of reference images; unlimited accumulation served no product purpose and created the same DoS vector.

**File:** `rings/SILVER-RING-SN00/src/train_flux_model.rs`

**Change:** Added `const MAX_TRAIN_IMAGES: usize = 20;` and a pre-push guard. When the cap is reached, the handler sends a localized error ("Maximum 20 images allowed for training") and returns `Ok(())` without mutating state.

**Literature:** CWE-770. Training pipelines have a practical ceiling (provider APIs typically reject or degrade on excessive inputs); enforcing the cap at ingestion prevents both abuse and accidental oversized submissions.

---

## Fix 3 — Empty-prompt validation in `text_to_image.rs` and `text_to_video.rs`
**Severity:** MEDIUM  
**Category:** CWE-20 (Improper Input Validation)

Both handlers checked `text.len() > 4000` but never rejected empty or whitespace-only prompts. An empty prompt was stored in state, forwarded to the AI provider, queued in the job system, and consumed generation credits for no value. This wasted provider quota and polluted the job queue.

**Files:**
- `rings/SILVER-RING-SN00/src/text_to_image.rs`
- `rings/SILVER-RING-SN00/src/text_to_video.rs`

**Change:** Added `if text.trim().is_empty()` immediately after extracting text and before the length check. Sends a localized error ("❌ Empty prompt is not allowed") and returns `Ok(())`.

**Literature:** CWE-20 — empty/whitespace-only input should be rejected at the earliest chokepoint before downstream resource allocation (provider quota, job queue slot, DB row). OWASP Input Validation Cheat Sheet recommends rejecting empty values before length checks.

---

## Verification
```bash
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-scenes
   Finished dev profile [unoptimized + debuginfo] target(s) in 7.85s

$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo test -p trios-mb-ai
   Finished test profile [unoptimized + debuginfo] target(s) in 0.58s
   test result: ok. 5 passed; 0 failed
```

---

## Deferred Items
- `bot.get_me()` timeout wrapping in `instagram_scraping.rs` + `instagram_parser.rs`
- Non-owned `update_generation_status` / `get_generation` used by webhook handlers (defense-in-depth)
- Hardcoded Replicate model digest in `replicate.rs`
- `database_url` stored as plain `String` in `config.rs` (should migrate to `SecretString`)
- Architectural migration from `InMemStorage` to `RedisStorage` for bounded dialogue state

---

## Three Cooperation Variants for Wave 227

### Variant A — Timeout wrapping for `bot.get_me()` in Instagram handlers
`instagram_scraping.rs` and `instagram_parser.rs` call `bot.get_me().await` without timeout. If the Telegram API stalls, the bot worker thread hangs indefinitely. Wrapping this in `tokio::time::timeout` (consistent with the rest of the codebase's `send_message_timeout` / `answer_callback_query_timeout` helpers) closes the last Telegram API timeout gap.

### Variant B — Webhook handler IDOR hardening (owned-method migration)
Replicate and KIE webhook handlers call `update_generation_status(generation_id, ...)` and `get_generation(generation_id)` without verifying that the generation belongs to any specific user. Migrating these call sites to the `_owned` variants (`update_generation_status_owned`, `get_generation_owned`) would add a defense-in-depth ownership check even after signature verification.

### Variant C — `database_url` SecretString migration + hardcoded digest externalization
Two configuration hygiene issues remain: `GOLD-RING-TY00/src/config.rs` stores `database_url` as a plain `String` (risk of accidental logging exposure), and `SILVER-RING-AI00/src/providers/replicate.rs` bakes a model digest hash into source code. Fixing both would improve secret hygiene and deployment flexibility.

---

*Sources:*
- [CWE-770](https://cwe.mitre.org/data/definitions/770.html)
- [CWE-20](https://cwe.mitre.org/data/definitions/20.html)
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [OWASP DoS Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
