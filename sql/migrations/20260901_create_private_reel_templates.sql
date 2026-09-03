BEGIN;

CREATE TABLE IF NOT EXISTS user_reel_templates (
  id               bigserial PRIMARY KEY,
  telegram_id      text NOT NULL,
  name             text NOT NULL,
  source_video_url text,
  recipe           jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_id, name),
  UNIQUE (id, telegram_id)
);

CREATE INDEX IF NOT EXISTS user_reel_templates_owner
  ON user_reel_templates (telegram_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_reel_drafts (
  id           bigserial PRIMARY KEY,
  telegram_id  text NOT NULL,
  template_id  bigint NOT NULL,
  topic        text NOT NULL,
  storyboard   jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_id, template_id, topic),
  FOREIGN KEY (template_id, telegram_id)
    REFERENCES user_reel_templates(id, telegram_id)
);

COMMIT;
