# Wave 220 Plan

## Objective
Apply three hardening fixes to eliminate unbounded monetary amounts and a silent database-error path in the trios-mb Rust monorepo.

---

## Fix 1 — Unbounded payment amount in Telegram scene handler

**File:** `rings/SILVER-RING-SN00/src/payment.rs`  
**Finding:** The `handle_payment_msg` handler parses user-supplied top-up amounts with `text.parse::<f64>()` and validates only `is_finite() && amount > 0.0`. There is no upper bound. A user can enter an arbitrarily large amount (e.g., `1e30`), which passes the existing checks. The resulting `f64` is stored in `PaymentFlowState.amount` and passed downstream to payment processors. While downstream validation may catch extreme values, the lack of an early ceiling violates the defense-in-depth principle and can surprise operators or cause confusion in support tickets.

**Literature:**
- CWE-20 — Improper Input Validation: "The product receives input or data, but it does not validate or incorrectly validates the input."
- PCI DSS Requirement 6.5.1 — Input Validation: "Applications must validate all input to prevent injection flaws and ensure data integrity."
- Stripe API design: every amount field accepts an explicit maximum to prevent business-logic abuse.

**Implementation:**
Add `const MAX_PAYMENT_AMOUNT: f64 = 100_000.0;` to `handle_payment_msg`. After the existing `is_finite() && amount > 0.0` check, add `if amount > MAX_PAYMENT_AMOUNT { ... reject ... }`. Return a localized error message.

**Verification:**
`cargo check --package trios-mb-scenes`, `cargo test --package trios-mb-scenes`

---

## Fix 2 — Unbounded Robokassa callback amount

**File:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`  
**Finding:** The `robokassa_callback` handler parses `form.out_sum.parse::<f64>()` and validates `is_finite() && v >= 0.0`. Like Fix 1, there is no upper bound. A forged or replayed callback with a colossal `out_sum` value would pass validation and proceed to `verify_callback`. While signature verification would reject an attacker-forged callback, a legitimate but buggy Robokassa backend could theoretically send an anomalous amount. An upper bound acts as a final circuit breaker before the amount reaches the payment-completion logic.

**Literature:**
- CWE-20 — Improper Input Validation
- OWASP Cheat Sheet: "For numeric input, define both minimum and maximum acceptable values."
- NIST SP 800-53 Rev. 5 — SI-10: "The information system checks the validity of information system inputs."

**Implementation:**
Add `const MAX_PAYMENT_AMOUNT: f64 = 100_000.0;` to `robokassa_callback`. After the existing finite/non-negative check, add `if v > MAX_PAYMENT_AMOUNT { ... reject ... }`. Return `"ERROR: amount exceeds maximum allowed"`.

**Verification:**
`cargo check --package trios-mb-server`, `cargo test --package trios-mb-server`, `cargo check --workspace`

---

## Fix 3 — Silent DB error in referral count display

**File:** `rings/SILVER-RING-SN00/src/handlers.rs`  
**Finding:** `SceneId::Invite` branch uses `db.get_referral_count(telegram_id).await.unwrap_or(0)`. If the database connection is temporarily unavailable, the `Result` becomes `Err`, and `unwrap_or(0)` silently substitutes `0`. The user sees "Referrals: 0" with no indication that the query failed. This masks operational outages and leads to false support tickets ("I know I have referrals but it shows zero"). Similar patterns exist in `invite.rs`.

**Literature:**
- CWE-391 — Unhandled Error Condition: "Errors, especially those produced by external systems, are not properly handled."
- SRE Book: "Fail loudly. A silent failure is worse than a noisy one because it delays detection and recovery."

**Implementation:**
Replace `unwrap_or(0)` with an explicit `match` that:
1. On `Ok(count)` → displays the actual count.
2. On `Err(e)` → logs `tracing::error!` with the error and displays a localized fallback message ("Unable to load referral count. Try again later.") instead of `0`.

Apply the same fix to `invite.rs` line 27.

**Verification:**
`cargo check --package trios-mb-scenes`, `cargo test --package trios-mb-scenes`

---

## Success Criteria
- All three fixes compile cleanly (`cargo check --workspace`).
- Unit tests in affected crates pass.
- No clippy warnings introduced.
