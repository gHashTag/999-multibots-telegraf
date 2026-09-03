BEGIN;

CREATE TABLE IF NOT EXISTS agent_conversation_messages (
  id          bigserial PRIMARY KEY,
  telegram_id text NOT NULL,
  channel     text NOT NULL CHECK (channel IN ('mini_app', 'telegram')),
  external_id text NOT NULL,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 50000),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_id, channel, external_id)
);

CREATE INDEX IF NOT EXISTS agent_conversation_owner_tail_idx
  ON agent_conversation_messages (telegram_id, id DESC);

CREATE TABLE IF NOT EXISTS agent_conversation_state (
  telegram_id text PRIMARY KEY,
  epoch       bigint NOT NULL DEFAULT 0,
  cleared_at  timestamptz
);

COMMIT;
