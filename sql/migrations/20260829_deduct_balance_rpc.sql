-- 20260829_deduct_balance_rpc.sql
--
-- Atomic balance deduction — the missing RPC behind issue #999.
--
-- WHY. Balance is not a column; it is the ledger sum over payments_v2:
--   SUM(stars) WHERE type='MONEY_INCOME'  minus  SUM(stars) WHERE type='MONEY_OUTCOME'
--   (both filtered to status='COMPLETED'), per get_user_balance_stats_optimized.
-- Every deduction path in the app today (updateUserBalance, directPayment,
-- processBalanceOperation) does read-check-write in application code, which is
-- NOT atomic: two concurrent taps (or two bot replicas) both read the same
-- balance, both pass the check, and both insert a MONEY_OUTCOME row — a
-- double-spend. CLAUDE.md documents that deduct_balance does not exist and all
-- paths are double-spend-prone (#999). The in-process withUserBalanceLock is a
-- single-process mitigation only; multi-replica needs this DB-side RPC.
--
-- WHAT. deduct_balance serialises per user with a transaction-scoped advisory
-- lock, recomputes the balance inside that lock, refuses when it is
-- insufficient, and otherwise inserts one COMPLETED MONEY_OUTCOME row — all in
-- one transaction, so it is atomic across connections and replicas.
--
-- NOT APPLIED BY THE LOOP. This file was prepared by an autonomous agent that
-- has no database access; it changes nothing until an owner runs it against
-- Supabase (see docs/owner/atomic-rpcs.md). Before wiring the app to call it,
-- verify the column list below against the live payments_v2 schema — the NOT
-- NULL / default set is taken from CreatePaymentV2Schema in
-- src/core/supabase/updateUserBalance.ts, which is the app's own insert shape.

CREATE OR REPLACE FUNCTION deduct_balance(
  p_telegram_id  BIGINT,
  p_amount       NUMERIC,
  p_service_type TEXT DEFAULT NULL,
  p_description  TEXT DEFAULT 'Balance deduction',
  p_bot_name     TEXT DEFAULT 'unknown_bot',
  p_metadata     JSONB DEFAULT '{}'::jsonb
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance NUMERIC;
  v_inv_id  TEXT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'reason', 'invalid_amount', 'balance', NULL);
  END IF;

  -- Serialise concurrent deductions for THIS user for the length of the
  -- transaction. Two callers (even on different replicas) cannot both pass the
  -- balance check before the other's MONEY_OUTCOME row is visible.
  PERFORM pg_advisory_xact_lock(p_telegram_id);

  SELECT COALESCE(SUM(stars) FILTER (WHERE type = 'MONEY_INCOME'), 0)
       - COALESCE(SUM(stars) FILTER (WHERE type = 'MONEY_OUTCOME'), 0)
    INTO v_balance
  FROM payments_v2
  WHERE telegram_id = p_telegram_id
    AND status = 'COMPLETED';

  IF v_balance < p_amount THEN
    RETURN json_build_object(
      'success', false,
      'reason', 'insufficient',
      'balance', v_balance,
      'required', p_amount
    );
  END IF;

  v_inv_id := 'deduct-' || p_telegram_id || '-' ||
              (extract(epoch FROM clock_timestamp()) * 1000)::bigint;

  INSERT INTO payments_v2 (
    telegram_id, stars, amount, type, category, status,
    currency, payment_method, service_type, description,
    bot_name, inv_id, payment_date, metadata
  ) VALUES (
    p_telegram_id, p_amount, 0, 'MONEY_OUTCOME', 'REAL', 'COMPLETED',
    'XTR', 'System', p_service_type, p_description,
    p_bot_name, v_inv_id, now(), p_metadata
  );

  RETURN json_build_object(
    'success', true,
    'balance', v_balance - p_amount,
    'inv_id', v_inv_id
  );
END;
$$;

-- Rollback:
--   DROP FUNCTION IF EXISTS deduct_balance(BIGINT, NUMERIC, TEXT, TEXT, TEXT, JSONB);
