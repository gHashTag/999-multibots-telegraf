BEGIN;

CREATE TABLE IF NOT EXISTS agent_training_progress (
  telegram_id text PRIMARY KEY,
  course_key text NOT NULL DEFAULT 'agent-operator-v1'
    CHECK (course_key = 'agent-operator-v1'),
  current_lesson integer NOT NULL DEFAULT 1
    CHECK (current_lesson BETWEEN 1 AND 8),
  completed_lessons integer[] NOT NULL DEFAULT '{}',
  last_evidence text NOT NULL DEFAULT ''
    CHECK (char_length(last_evidence) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
