-- 20260829_increment_attempts_rpc.sql
--
-- Atomic attempts increment for pending_messages — closes the residual race in
-- the notification retry fix (#1115).
--
-- WHY. markMessageAsFailed already writes attempts = current + 1, which stops
-- the infinite 60s retry storm (#1115). But that is a read-modify-write in
-- application code: if two processors (or replicas) handle the same row, both
-- read the same attempts and both write the same +1, losing an increment. The
-- old code even tried to call increment_attempts() — an RPC that never existed.
-- This creates it so the increment can be made atomic DB-side.
--
-- WHAT. increment_attempts bumps attempts by one and stamps last_attempt in a
-- single UPDATE, returning the new value. No advisory lock is needed: a single
-- UPDATE ... SET attempts = attempts + 1 is atomic per row.
--
-- NOT APPLIED BY THE LOOP. Prepared by an autonomous agent without database
-- access — inert until an owner runs it (see docs/owner/atomic-rpcs.md). Once it
-- exists, markMessageAsFailed can switch its `attempts: message.attempts + 1`
-- for `attempts: <returned value>` via this RPC; until then the app's read-add-1
-- is the correct behaviour and must stay.

CREATE OR REPLACE FUNCTION increment_attempts(
  p_message_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_attempts INTEGER;
BEGIN
  UPDATE pending_messages
     SET attempts = attempts + 1,
         last_attempt = now()
   WHERE id = p_message_id
  RETURNING attempts INTO v_attempts;

  RETURN v_attempts; -- NULL if no row matched
END;
$$;

-- If pending_messages.id is TEXT rather than UUID, change the parameter type to
-- TEXT to match — verify against the live schema before applying.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS increment_attempts(UUID);
