# Wave 256 Plan

**Theme:** Access-control sentinel hardening and payment gateway callback input validation.

---

## Fix 1 — Access-control sentinel guards (HIGH)

**File:** `rings/SILVER-RING-TG00/src/access.rs`

Currently only `is_super_admin` explicitly rejects `user_id == 0` (the sentinel). If someone accidentally configures `"HAIM_GROUP_STAFF_IDS=0,123"`, then `is_staff(0)` and `is_admin(0)` would return true, granting privileges to the sentinel value.

Add `if user_id == SUPER_ADMIN_SENTINEL { return false; }` to:
- `is_admin`
- `is_staff`
- `has_parsing_access`

**Why:** Defense-in-depth. The sentinel value must never grant privileges under any configuration.

---

## Fix 2 — X402 transaction hash length cap (MEDIUM)

**File:** `rings/SILVER-RING-PY00/src/x402.rs`

`verify_callback` extracts `transaction_hash` from the callback payload with no length validation. A malicious or malfunctioning x402 facilitator could send a multi-megabyte string, causing DB query exhaustion when `transaction_id` is passed to `get_transaction_by_external_id`.

Add a length cap (`MAX_TRANSACTION_ID_LEN = 256`) after extracting `tx_hash`.

**Why:** Untrusted external input must be bounded before reaching persistence layers (CWE-770).

---

## Fix 3 — TON transaction hash length cap (MEDIUM)

**File:** `rings/SILVER-RING-PY00/src/ton.rs`

`verify_callback` extracts `hash` from the callback payload with no length validation. Same risk as Fix 2.

Add a length cap (`MAX_TRANSACTION_ID_LEN = 256`) after extracting `hash`.

**Why:** Same as Fix 2 — untrusted payment callback fields must be bounded before DB lookup.

---

**Verification:**
- `cargo check -p trios-mb-tg --target aarch64-apple-darwin`
- `cargo check -p trios-mb-payment --target aarch64-apple-darwin`

**Commit:** `security: access-control sentinel guards, x402/ton transaction hash length caps (Wave 256)`
