-- increment_attempts.sql — Railway reconstruction of the live cloud RPC.
--
-- ============================================================================
-- WHICH OF THE THREE CONTRADICTORY CLAIMS IS FALSE
-- ============================================================================
-- Three statements existed in the repo/cloud about this function. Two of them
-- are FALSE. Probed against the live cloud on 2026-09-03:
--
--   TRUE   The cloud OpenAPI lists /rpc/increment_attempts(message_id uuid).
--          Confirmed by direct call: POST {"message_id":"<uuid>"} -> HTTP 200.
--          The declared type really is uuid: POST {"message_id":"not-a-uuid"}
--          -> 22P02 "invalid input syntax for type uuid".
--
--   FALSE  sql/migrations/20260829_increment_attempts_rpc.sql header: "the old
--          code even tried to call increment_attempts() — an RPC that never
--          existed", and "NOT APPLIED ... inert". The RPC EXISTS in the live
--          cloud database right now. What never existed is the *p_message_id*
--          spelling that that migration declares:
--            POST {"p_message_id":...} -> PGRST202
--              "Could not find the function public.increment_attempts(p_message_id)"
--              hint: "Perhaps you meant to call public.increment_attempts(message_id)"
--          There is exactly ONE overload, and its parameter is `message_id`.
--          So the migration is not merely unapplied — applying it would have
--          created a SECOND, differently-named overload alongside the real one.
--
--   FALSE  src/handlers/notificationHandler.ts:207 "the RPC is not even
--          defined". It is defined. The rest of that comment is still correct
--          and important: the old code never awaited the query builder, so the
--          RPC never actually ran and an object was PATCHed into an integer
--          column. The bug was real; the stated cause was wrong.
--
--   Consequence: docs/owner/atomic-rpcs.md step 1 ("confirm pending_messages.id
--   type ... switch the parameter to TEXT if it is text") is answered — id is
--   genuinely `uuid`, default gen_random_uuid(). No TEXT variant is needed.
--
-- ============================================================================
-- HOW THE BODY WAS DERIVED (the source is nowhere in the repo)
-- ============================================================================
-- 1. It performs an UPDATE. PostgREST runs GET in a READ ONLY transaction, and
--    this Supabase PostgREST does not pre-screen volatility (all 84 RPCs list
--    GET, including delete_user_by_telegram_id). So GET reaches Postgres:
--      GET /rpc/increment_attempts?message_id=<random uuid>
--      -> HTTP 405, 25006 "cannot execute UPDATE in a read-only transaction"
--    Postgres itself names UPDATE, from inside the function. Proof of a write.
--
-- 2. It is VOLATILE, not STABLE. The error above is 25006 (transaction-level).
--    A STABLE/IMMUTABLE function executing an UPDATE fails EARLIER, in SPI,
--    with 0A000 "UPDATE is not allowed in a non-volatile function". Getting
--    25006 instead means SPI's read-only flag was off => provolatile = 'v'.
--    This discriminator was not assumed — it was validated on Railway inside a
--    rolled-back transaction:
--      STABLE clone of this body, called normally
--        -> 0A000 "UPDATE is not allowed in a non-volatile function"
--      this VOLATILE function, called in BEGIN TRANSACTION READ ONLY
--        -> 25006 "cannot execute UPDATE in a read-only transaction"
--    The cloud produced the second message, so the cloud function is VOLATILE.
--
-- 3. The UPDATE targets pending_messages. Across all 60+ cloud tables in the
--    OpenAPI spec, pending_messages is the ONLY one with an `attempts` column
--    and the ONLY one with a `last_attempt` column.
--
-- 4. It returns a SCALAR, and NULL when no row matches.
--      POST with a random uuid matching no row -> HTTP 200, body: null
--    Not `[]` (so not SETOF / RETURNS TABLE), and Accept: text/csv yields the
--    header `pgrst_scalar` (PostgREST's name for a non-composite return), which
--    a `RETURNS void` function would not produce.
--
-- NOT ESTABLISHED — see the honest list at the bottom of this file.
--
-- Probe safety: every cloud call used the random non-matching uuid
-- 61068dfb-9548-4a7c-96a8-30b7f7253635, verified beforehand to select 0 rows.
-- Nothing in the cloud was written (count re-checked as 0 afterwards).
--
-- ============================================================================
-- VERIFIED ON RAILWAY AFTER APPLYING THIS FILE
-- ============================================================================
--   signature   increment_attempts(message_id uuid) RETURNS integer
--               provolatile = 'v', prosecdef = false, exactly 1 overload
--               -> name, parameter name and parameter type match cloud exactly
--   columns     all 10 columns match the cloud spec's type / nullability /
--               default, one for one
--   no match    increment_attempts(<random uuid>) -> NULL   (cloud: JSON null)
--   match       attempts 0 -> returns 1 -> returns 2; last_attempt stamped;
--               `error` and `sent` left untouched
--   atomicity   20 concurrent RPC calls on one row -> attempts = 20 (0 lost).
--               Control: the same 20 through the app's current
--               read-modify-write (`attempts: message.attempts + 1` in
--               markMessageAsFailed) -> attempts = 1, i.e. 19 increments lost.
--               This is the race the RPC exists to close, reproduced.
--   idempotent  the whole file re-applies cleanly (IF NOT EXISTS / OR REPLACE)
-- ============================================================================


-- ---------------------------------------------------------------------------
-- TABLE — transcribed from the live cloud definitions.pending_messages
-- ---------------------------------------------------------------------------
-- Cloud comment on the table: "Очередь уведомлений для отправки пользователям".
-- NOT NULL set taken from the spec's `required` list:
--   id, telegram_id, message, message_type, priority, attempts, sent
-- (created_at, last_attempt, error are absent from `required` => nullable,
--  even though created_at carries a default.)
-- Note telegram_id is TEXT here, not bigint as in payments_v2. Kept as-is.

CREATE TABLE IF NOT EXISTS public.pending_messages (
  id            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  telegram_id   text                     NOT NULL,
  message       text                     NOT NULL,
  message_type  text                     NOT NULL DEFAULT 'general',
  created_at    timestamp with time zone          DEFAULT now(),
  priority      text                     NOT NULL DEFAULT 'medium',
  attempts      integer                  NOT NULL DEFAULT 0,
  last_attempt  timestamp with time zone,
  sent          boolean                  NOT NULL DEFAULT false,
  error         text,
  CONSTRAINT pending_messages_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.pending_messages IS 'Очередь уведомлений для отправки пользователям';
COMMENT ON COLUMN public.pending_messages.sent IS 'Флаг успешной отправки';

-- ROWS ARE DELIBERATELY NOT COPIED, and this is not a judgement call:
-- the cloud table is EMPTY. `Prefer: count=exact` returns `content-range: */0`
-- and `select=*&limit=5` returns []. There are zero rows to migrate, so the
-- duplicate-send hazard of copying a live queue never arises. Create empty.

-- No index beyond the primary key. The hot query in
-- src/handlers/notificationHandler.ts is
--   WHERE sent = false AND attempts < 3 ORDER BY priority, created_at LIMIT 50
-- and the obvious partial index for it is below — but cloud's indexes are NOT
-- observable through PostgREST, so adding it would be invention, not migration.
-- The table starts empty; add this only if the queue ever grows.
--
--   CREATE INDEX IF NOT EXISTS pending_messages_queue_idx
--     ON public.pending_messages (priority, created_at)
--     WHERE sent = false;
--
-- No CHECK constraint on `priority` either. The TS interface narrows it to
-- 'high' | 'medium' | 'low', but the cloud column is plain text (the spec shows
-- format "text" with no enum), and a CHECK constraint is invisible to
-- PostgREST. Adding one could reject rows the cloud accepts.


-- ---------------------------------------------------------------------------
-- FUNCTION — signature copied verbatim from the live cloud
-- ---------------------------------------------------------------------------
-- Parameter is `message_id` (cloud), NOT `p_message_id` (repo migration).
-- VOLATILE and SECURITY INVOKER are the defaults and are left implicit;
-- VOLATILE is required for the UPDATE and matches the probed cloud volatility.

CREATE OR REPLACE FUNCTION public.increment_attempts(message_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_attempts integer;
BEGIN
  UPDATE public.pending_messages
     SET attempts     = pending_messages.attempts + 1,
         last_attempt = now()
   -- parameter qualified with the function name so this keeps working if a
   -- column named message_id is ever added; today there is none, so this is
   -- behaviourally identical to a bare `message_id`.
   WHERE pending_messages.id = increment_attempts.message_id
  RETURNING pending_messages.attempts INTO v_attempts;

  -- No row matched -> v_attempts stays NULL -> PostgREST emits JSON `null`,
  -- which is exactly what the live cloud returns for a non-matching uuid.
  RETURN v_attempts;
END;
$$;

COMMENT ON FUNCTION public.increment_attempts(uuid) IS
  'Atomically bumps pending_messages.attempts by one and stamps last_attempt; returns the new attempts, or NULL if no row matched. Reconstructed from observed cloud behaviour 2026-09-03 — the cloud body is not in source control.';

-- Rollback:
--   DROP FUNCTION IF EXISTS public.increment_attempts(uuid);
--   -- the table is intentionally NOT dropped by a rollback of this function.


-- ============================================================================
-- WHAT COULD NOT BE ESTABLISHED
-- ============================================================================
-- * The MATCHING-ROW behaviour of the cloud function is unverified, and cannot
--   be verified without writing to cloud (forbidden) — the cloud queue is empty,
--   so there is no pre-existing row to call it against. Only the no-match path
--   (-> null) was observed. Everything about the matching path (+1 step size,
--   the last_attempt stamp, whether it also touches `error` or `sent`) is
--   INFERRED from the function name, the exclusive ownership of attempts /
--   last_attempt by this table, and the repo migration's intent.
-- * The exact return TYPE. Observable facts: scalar, non-void, NULL on no
--   match. `integer` is inferred from the attempts column being integer and
--   from the caller assigning the result back into it; a bigint or numeric
--   return is indistinguishable when the value is NULL.
-- * SECURITY INVOKER vs DEFINER on the cloud function, its owner, and its GRANTs
--   — none are exposed by PostgREST. Irrelevant on Railway (no RLS, app connects
--   as owner), so the default INVOKER is used.
-- * Cloud indexes, CHECK constraints, FKs and triggers on pending_messages —
--   PostgREST exposes columns, types, defaults and nullability only.
-- ============================================================================
