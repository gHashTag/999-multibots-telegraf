# Wave 210 Plan — Silent Failure Elimination (Batch 2)

## Theme
Continue eliminating silent failure patterns that hide production outages from operators.

## Literature References
1. Kleppmann, *Designing Data-Intensive Applications* (O'Reilly, 2017) — Chapter 8: "Reliability" — silent failures are the most dangerous category because they disable alarms.
2. Google SRE Book, Chapter 6: "Monitoring Distributed Systems" — "failures you can't observe are failures you can't fix"; surface all degradation.
3. SIGPLAN 2021 "Failure Skies: An Empirical Study of Alert Qualities" — conclusion: suppressing errors correlates with prolonged MTTR.

---

## Fix 1 — Shutdown Panic Visibility
### File
`rings/BRONZE-RING-APP/src/main.rs`
### Weakness
Graceful-shutdown loop iterates over `bot_handles: Vec<(CancellationToken, JoinHandle<()>)>` and waits for each task with a 5-second timeout. The `JoinHandle` result is dropped via `let _ =`, so if a spawned bot task panicked during shutdown, the panic message is never logged and the operator sees a clean exit despite data loss or corruption.
### Remediation
Inspect the `JoinHandle` result:
- `Ok(Ok(()))` — clean exit, trace at `debug`.
- `Ok(Err(join_err))` — the bot task panicked; trace at `error` with bot identity.
- `Err(_elapsed)` — timeout waiting for shutdown; trace at `warn`.

---

## Fix 2 — Subscription DB Outage Masked
### File
`rings/SILVER-RING-SN00/src/subscription.rs`
### Weakness
Line 30: `let current_sub = db.check_subscription(tid).await.ok().flatten();`
The `.ok()` converts a DB error into `None`. Then `.flatten()` collapses `Option<Option<SubscriptionType>>` into `Option<SubscriptionType>`. During a database outage every user receives "No active subscription" as if they were free-tier users. No log entry indicates a database problem.
### Remediation
Replace the chain with a `match`:
- `Ok(Some(sub))` — trace the subscription check at `debug`.
- `Ok(None)` — valid "no subscription" state.
- `Err(e)` — trace at `error` and return early with the AppError (fail-closed).

---

## Fix 3 — CallbackData Parse Failures Unobserved
### File
`rings/GOLD-RING-PR00/src/telegram.rs`
### Weakness
Lines 44–49: `pub fn parse(data: &str) -> Option<Self> { … serde_json::from_str(data).ok() }`
`.ok()` turns deserialization errors into `None`. Malformed callback data (whether from Telegram anomalies or potential fuzzing/probing) produces zero log signal. An attacker could probe callback payload shapes without leaving any trace.
### Remediation
Remove `.ok()`. Keep the method returning `Option<Self>` but log at `warn` when parsing fails, including a truncated preview of the offending payload for forensics.

---

## Decomposition Checklist
- [ ] Fix 1 implemented
- [ ] Fix 2 implemented
- [ ] Fix 3 implemented
- [ ] `cargo check` passes with zero warnings
- [ ] `WAVE_210_REPORT.md` written
- [ ] `wave-210-patterns.md` written
- [ ] `MEMORY.md` updated
- [ ] `skill.md` updated
- [ ] Committed

## Cooperation Variants for Wave 211
1. **Telemetry Gap → Time-Delayed Alerts** — Search for places where we log `warn!` but don't increment a metric counter, meaning alerts never fire.
2. **Circuit-Breaker Hidden States** — Audit the async circuit breaker to ensure state transitions (open→half-open) are never silently lost under contention.
3. **Webhook Retry Exhaustion** — Ensure webhook delivery failures that exhaust retries produce a terminal `error!` log and/or DLQ metric rather than quietly vanishing.
