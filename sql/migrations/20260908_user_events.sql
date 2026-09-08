-- WHAT PEOPLE DO BETWEEN ARRIVING AND PAYING.
--
-- Two tables already record the ends of the funnel: payments_v2 knows about
-- invoices and charges, prompts_history knows about generations. Nothing knows
-- the middle, and the middle is where everybody stops -- 2380 people have
-- registered and 354 have ever generated anything.
--
-- It is also why a payment defect lived for nine months without being noticed.
-- Top-ups stopped completing in December 2025 (6 completed against 32 pending
-- that month; zero completed from March 2026), and the only trace was rows
-- quietly sitting in PENDING. The logs could not hold the evidence: the window
-- is only as old as the container, and this service deploys many times a day.
--
-- Deliberately small. One row per step, no payload beyond a short detail, so
-- writing it can never be a reason a person waits.

CREATE TABLE IF NOT EXISTS public.user_events (
    id          BIGSERIAL PRIMARY KEY,
    telegram_id TEXT        NOT NULL,
    bot_name    TEXT,
    event       TEXT        NOT NULL,
    detail      JSONB,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- The three questions this table is asked: what happened lately, what does one
-- person's path look like, and how many of each step in a window.
CREATE INDEX IF NOT EXISTS idx_user_events_created_at ON public.user_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_telegram_id ON public.user_events (telegram_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_event ON public.user_events (event, created_at DESC);

COMMENT ON TABLE public.user_events IS
  'Funnel steps between arriving and paying. Written fire-and-forget by the bot; a failed write never blocks a reply.';
