# Atomic balance & retry RPCs (owner action required)

Two Postgres functions the app has needed for a long time but that no autonomous
loop can create — they require applying SQL to the Supabase database, which needs
owner access. The migration files are in `sql/migrations/` and change **nothing**
until you run them.

| RPC                  | Migration                                            | Closes                                                                                      | Why it needs the DB                                                                                               |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `deduct_balance`     | `sql/migrations/20260829_deduct_balance_rpc.sql`     | **#999** double-spend (two taps / two replicas each pass the balance check and both charge) | Atomicity across connections/replicas can only come from the DB; app-side `withUserBalanceLock` is single-process |
| `increment_attempts` | `sql/migrations/20260829_increment_attempts_rpc.sql` | residual race in **#1115** (two processors lose an `attempts` increment)                    | A single `UPDATE ... attempts + 1` is atomic per row                                                              |

## Apply

1. **Verify the schema first.** The `deduct_balance` INSERT column list is taken
   from the app's own insert (`CreatePaymentV2Schema` in
   `src/core/supabase/updateUserBalance.ts`). Confirm `payments_v2` still has
   those columns and their NOT NULL / default constraints, and confirm
   `pending_messages.id`'s type (the increment RPC assumes `UUID`; switch the
   parameter to `TEXT` if it is text).

2. **Run the migrations** (Supabase SQL editor, or CLI):

   ```bash
   supabase db execute --file sql/migrations/20260829_deduct_balance_rpc.sql
   supabase db execute --file sql/migrations/20260829_increment_attempts_rpc.sql
   ```

3. **Smoke-test** in a transaction you roll back:

   ```sql
   BEGIN;
   SELECT deduct_balance(<telegram_id>, 1, 'smoke_test', 'smoke', 'test_bot');  -- expect success:true, balance-1
   SELECT deduct_balance(<telegram_id>, 999999999, 'smoke_test');              -- expect success:false, reason:insufficient
   ROLLBACK;
   ```

## After the RPCs exist — wiring (a separate PR)

The app is deliberately **not** wired to these yet: calling a non-existent RPC
would break the very paths it is meant to protect. Once the functions are live:

- Route every deduction (`updateUserBalance` MONEY_OUTCOME, `directPayment`,
  `processBalanceOperation`) through `supabase.rpc('deduct_balance', …)` and act
  on `success`, instead of read-check-write. Keep `withUserBalanceLock` until
  the switch is proven, then it becomes redundant.
- In `markMessageAsFailed`, replace `attempts: message.attempts + 1` with the
  value returned by `increment_attempts`.

Each is one PR with a mutation-checked test, gated on these functions existing in
the target database.

## Provenance

Prepared autonomously (loop-fable) alongside the wizard-side and served-handler
fixes for the 0-cost class and the #1115 retry fix. The agent has no DB access,
so it stopped at ready-to-apply SQL + this runbook — the apply step is yours.
