-- =====================================================================
-- Supabase -> Railway Postgres: reconstructed schema for the 11 non-empty
-- tables of project yuukfqcsdhkyxegfwlcb.
--
-- SOURCE OF TRUTH: the PostgREST OpenAPI (swagger 2.0) document served at
--   GET $SUPABASE_URL/rest/v1/   (Accept: application/openapi+json, service_role key)
-- It gives, per column: exact Postgres type, varchar length, NOT NULL,
-- default expression, primary key and foreign key. It does NOT give numeric
-- precision/scale, indexes, check constraints, triggers or RLS.
--
-- Everything the swagger could not answer was established by targeted
-- read-only probes; each is cited inline. Nothing was guessed.
--
-- VALIDATED: applies clean on PostgreSQL 17; all 163 columns round-trip
-- diffed against the swagger (name, attnum order, type, typmod, NOT NULL,
-- presence of default).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Extensions
--   pgcrypto is needed for gen_random_uuid() on PG < 13; on PG 13+ it is
--   built in. Supabase used extensions.uuid_generate_v4() for
--   model_trainings.id; gen_random_uuid() is substituted (same semantics,
--   no uuid-ossp dependency). Change it back if bit-for-bit parity matters.
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Enum types
--   Labels and their order come from the swagger "enum" arrays, which
--   PostgREST reads from pg_enum ordered by enumsortorder. Order affects
--   ORDER BY on the enum and comparison operators — verified as label sets,
--   NOT independently verified as sort order.
-- ---------------------------------------------------------------------
CREATE TYPE public.payment_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

CREATE TYPE public.operation_type AS ENUM (
  'MONEY_INCOME', 'MONEY_OUTCOME', 'BONUS', 'REFUND',
  'SUBSCRIPTION_PURCHASE', 'SUBSCRIPTION_RENEWAL', 'REFERRAL', 'SYSTEM'
);

CREATE TYPE public.simple_transaction_category AS ENUM ('REAL', 'BONUS');


-- =====================================================================
-- users  (2341 rows)
-- Column order below is pg_attribute order as reported by PostgREST, so
-- `COPY users FROM ...` without a column list stays compatible.
-- =====================================================================
CREATE TABLE public.users (
  "first_name"            character varying,
  "last_name"             character varying,
  "username"              character varying,
  "is_bot"                boolean                  NOT NULL DEFAULT false,
  "language_code"         character varying,
  "photo_url"             character varying,
  "user_id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "display_name"          character varying,
  "user_timezone"         character varying,
  "designation"           character varying,
  "position"              character varying,
  "company"               character varying,
  "invitation_codes"      json,
  "select_izbushka"       bigint,
  "avatar_id"             character varying,
  "voice_id"              character varying,
  "voice_id_elevenlabs"   character varying,
  "chat_id"               bigint,
  "voice_id_synclabs"     character varying,
  "mode"                  character varying                 DEFAULT 'clean',
  "model"                 character varying                 DEFAULT 'gpt-4-turbo',
  "count"                 bigint,
  "aspect_ratio"          character varying                 DEFAULT '9:16',
  "inviter"               uuid,
  "vip"                   boolean                           DEFAULT false,
  "is_leela_start"        boolean                           DEFAULT false,
  "bot_name"              character varying        NOT NULL DEFAULT 'neuro_blogger_bot'::text,
  "level"                 integer                  NOT NULL DEFAULT 0,
  "updated_at"            timestamp with time zone          DEFAULT timezone('utc'::text, now()),
  "pinata_avatar_id"      character varying,
  "avatar_url"            character varying,
  "is_bot_owner"          boolean                           DEFAULT false,
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "gender"                text,
  -- NOTE: telegram_id is TEXT, not bigint, and 541 of 2341 rows hold UUIDs
  -- rather than Telegram IDs. Do not "clean this up" during the migration.
  "telegram_id"           text,
  "avatar_transform_used" boolean                           DEFAULT false,
  "is_haim_employee"      boolean                           DEFAULT false,
  "email"                 text,
  "full_name"             text,
  "xp"                    integer                           DEFAULT 0,
  "role"                  text                              DEFAULT 'student',
  "created_at"            timestamp with time zone          DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY ("id"),
  -- proven: ON CONFLICT (user_id) planned without 42P10; it is also the
  -- target of 5 foreign keys from other tables.
  CONSTRAINT users_user_id_key UNIQUE ("user_id")
);
-- proven ABSENT (42P10): unique on telegram_id, on (telegram_id, bot_name),
-- and on email. 19 telegram_id values are duplicated in live data.


-- =====================================================================
-- payments_v2  (17135 rows)  *** MONEY ***
--
-- amount / stars / cost are all `numeric`, NOT double precision — stated
-- directly by the swagger, which distinguishes "numeric" from "double
-- precision" (4 double-precision columns exist elsewhere in this DB).
--
-- Precision/scale is NOT in the swagger: PostgREST strips the numeric
-- typmod. It was recovered from the raw HTTP wire text of all 17135 rows,
-- read BEFORE JSON.parse (which would collapse 30.00 -> 30). Postgres pads
-- numeric(p,s) to exactly s decimal places on storage and to_json() emits
-- that text verbatim:
--   stars  : 17135/17135 rows rendered with exactly 2 decimals
--            ("30.00", "20000.00", "9.00")  => scale 2 typmod, declared.
--   amount : decimals histogram {0:12830, 1:3514, 2:789, 3:1, 10:1}
--            => mixed scale => NO typmod => unconstrained numeric.
--   cost   : {0:12976, 1:263, 13:53, 14:42, 15:740, 17:1, NULL:3060}
--            => up to 17 decimals => NO typmod => unconstrained numeric.
-- The PRECISION of stars could not be recovered (PostgREST casts filter
-- literals to bare numeric, so overflow probing returns 200 at 40 digits).
-- Widest observed integer part is 8 digits; 12 is the conventional choice
-- and is strictly wider than the data. This is the ONE declared digit in
-- this file that is not proven — see notes.
-- =====================================================================
CREATE TABLE public.payments_v2 (
  "id"                     integer                            NOT NULL GENERATED BY DEFAULT AS IDENTITY,
  "telegram_id"            bigint                             NOT NULL,
  "payment_date"           timestamp with time zone           NOT NULL DEFAULT now(),
  "amount"                 numeric                            NOT NULL DEFAULT 0,
  "description"            text,
  "metadata"               jsonb,
  "stars"                  numeric(12,2)                      NOT NULL DEFAULT 0,
  "currency"               character varying(10)              NOT NULL DEFAULT 'STARS',
  "inv_id"                 character varying(100),
  "invoice_url"            text,
  "status"                 public.payment_status              NOT NULL,
  "type"                   public.operation_type              NOT NULL,
  "service_type"           text,
  "operation_id"           text,
  "bot_name"               character varying(255)             NOT NULL,
  "language"               character varying(2)                        DEFAULT 'ru',
  "payment_method"         text,
  "subscription_type"      text,
  "is_system_payment"      boolean                                     DEFAULT false,
  "created_at"             timestamp with time zone           NOT NULL DEFAULT now(),
  "cost"                   numeric,
  "category"               public.simple_transaction_category NOT NULL DEFAULT 'REAL',
  "model_name"             text,
  "corporate_account_id"   uuid,
  "employee_allocation_id" uuid,
  "transaction_context"    character varying(30)                       DEFAULT 'PERSONAL',
  "is_test"                boolean                                     DEFAULT false,
  CONSTRAINT payments_v2_pkey PRIMARY KEY ("id"),
  -- proven present (ON CONFLICT (inv_id) planned): this is the payment
  -- idempotency guard. Losing it would allow double-crediting on retry.
  CONSTRAINT payments_v2_inv_id_key UNIQUE ("inv_id")
);
-- proven ABSENT (42P10): unique on operation_id.
-- corporate_account_id / employee_allocation_id are FKs to corporate_account
-- and employee_allocation; both columns are NULL in all 17135 rows, so the
-- referenced tables are not needed to migrate this data.


-- =====================================================================
-- assets  (1509 rows)
-- =====================================================================
CREATE TABLE public.assets (
  "id"           integer                     NOT NULL GENERATED BY DEFAULT AS IDENTITY,
  "type"         text                        NOT NULL,
  "trigger_word" text                        NOT NULL,
  "storage_path" text                        NOT NULL,
  "public_url"   text                        NOT NULL,
  "text"         text,
  -- the only timestamp in the whole schema WITHOUT time zone
  "created_at"   timestamp without time zone          DEFAULT CURRENT_TIMESTAMP,
  "telegram_id"  bigint,
  "bot_name"     character varying(100),
  CONSTRAINT assets_pkey PRIMARY KEY ("id")
);
-- proven ABSENT (42P10): unique on storage_path — and correctly so: 1509 rows
-- hold only 1473 distinct storage_path values.


-- =====================================================================
-- model_trainings  (188 rows)
-- =====================================================================
CREATE TABLE public.model_trainings (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "telegram_id"           bigint,
  "model_name"            text                     NOT NULL,
  "trigger_word"          text                     NOT NULL,
  "zip_url"               text                     NOT NULL,
  "model_url"             text,
  "replicate_training_id" text,
  "status"                text                              DEFAULT 'processing',
  "created_at"            timestamp with time zone          DEFAULT timezone('utc'::text, now()),
  "updated_at"            timestamp with time zone          DEFAULT timezone('utc'::text, now()),
  "error"                 text,
  "steps"                 integer,
  "finetune_id"           text,
  "result"                text,
  "api"                   text                     NOT NULL DEFAULT 'replicate',
  "cancel_url"            text,
  "weights"               text,
  "bot_name"              character varying(100),
  "gender"                text,
  "is_ru"                 boolean                           DEFAULT true,
  CONSTRAINT model_trainings_pkey PRIMARY KEY ("id")
);
-- proven ABSENT (42P10): unique on replicate_training_id and on finetune_id.


-- =====================================================================
-- prompts_history  (30063 rows — the largest table)
-- =====================================================================
CREATE TABLE public.prompts_history (
  "prompt_id"     integer                  NOT NULL GENERATED BY DEFAULT AS IDENTITY,
  "prompt"        text                     NOT NULL,
  "model_type"    text                     NOT NULL,
  "media_url"     text,
  "telegram_id"   bigint,
  "created_at"    timestamp with time zone          DEFAULT CURRENT_TIMESTAMP,
  "task_id"       text,
  "status"        text,
  "mode"          text,
  "bot_name"      text,
  "language_code" text,
  CONSTRAINT prompts_history_pkey PRIMARY KEY ("prompt_id")
);
-- proven ABSENT (42P10): unique on task_id.


-- =====================================================================
-- avatars  (15 rows) — composite natural primary key
-- =====================================================================
CREATE TABLE public.avatars (
  "telegram_id" bigint                   NOT NULL,
  "avatar_url"  text                     NOT NULL,
  "group"       text                     NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "bot_name"    text                     NOT NULL DEFAULT 'neuro_blogger_bot',
  "support"     text                     NOT NULL DEFAULT 'neuro_sage',
  CONSTRAINT avatars_pkey PRIMARY KEY ("telegram_id", "bot_name")
);
-- proven ABSENT (42P10): unique on telegram_id alone.


-- =====================================================================
-- translations  (220 rows)
-- =====================================================================
CREATE TABLE public.translations (
  "id"            integer               NOT NULL GENERATED BY DEFAULT AS IDENTITY,
  "language_code" character varying(10) NOT NULL,
  "key"           text                  NOT NULL,
  "translation"   text                  NOT NULL,
  "url"           text,
  "bot_name"      text                  NOT NULL DEFAULT 'neuro_blogger_bot',
  "buttons"       jsonb,
  "category"      text                           DEFAULT 'specific',
  "is_override"   boolean                        DEFAULT false,
  CONSTRAINT translations_pkey PRIMARY KEY ("id"),
  -- proven present (ON CONFLICT planned)
  CONSTRAINT translations_key_language_code_bot_name_key
    UNIQUE ("key", "language_code", "bot_name")
);
-- proven ABSENT (42P10): unique on (key, language_code).


-- =====================================================================
-- superhero_generations  (131 rows)
-- =====================================================================
CREATE TABLE public.superhero_generations (
  "id"                   integer                  NOT NULL GENERATED BY DEFAULT AS IDENTITY,
  "telegram_id"          text                     NOT NULL,
  "month"                integer                  NOT NULL,
  "year"                 integer                  NOT NULL,
  "generation_count"     integer                  NOT NULL DEFAULT 0,
  "last_generation_date" timestamp with time zone          DEFAULT now(),
  "created_at"           timestamp with time zone          DEFAULT now(),
  "updated_at"           timestamp with time zone          DEFAULT now(),
  CONSTRAINT superhero_generations_pkey PRIMARY KEY ("id"),
  -- proven present; src/core/supabase/incrementSuperheroGeneration.ts
  -- upserts with onConflict: 'telegram_id,month,year' and would fail 42P10
  -- in production without it.
  CONSTRAINT superhero_generations_telegram_id_month_year_key
    UNIQUE ("telegram_id", "month", "year")
);


-- =====================================================================
-- templates  (1 row)  — created before jobs, which references it
-- =====================================================================
CREATE TABLE public.templates (
  "id"               text                     NOT NULL,
  "name"             text                     NOT NULL,
  "description"      text,
  "template_json"    jsonb                    NOT NULL,
  "composition_name" text,
  "created_at"       timestamp with time zone DEFAULT now(),
  "updated_at"       timestamp with time zone DEFAULT now(),
  CONSTRAINT templates_pkey PRIMARY KEY ("id")
);


-- =====================================================================
-- jobs  (26 rows)
-- =====================================================================
CREATE TABLE public.jobs (
  "id"                       text                     NOT NULL,
  "template_id"              text,
  "user_id"                  text                     NOT NULL,
  "status"                   text                     NOT NULL,
  "render_status"            text,
  "server_id"                text,
  "result_object_key"        text,
  "download_assets_progress" integer                  DEFAULT 0,
  "render_progress"          integer                  DEFAULT 0,
  "upload_result_progress"   integer                  DEFAULT 0,
  "created_at"               timestamp with time zone DEFAULT now(),
  "updated_at"               timestamp with time zone DEFAULT now(),
  CONSTRAINT jobs_pkey PRIMARY KEY ("id")
);


-- =====================================================================
-- attachments  (4 rows)
-- =====================================================================
CREATE TABLE public.attachments (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      text                     NOT NULL,
  "object_key"   text                     NOT NULL,
  "content_type" text,
  "size"         bigint,
  "meta_data"    jsonb,
  "created_at"   timestamp with time zone          DEFAULT now(),
  "description"  text,
  "name"         text,
  "duration"     double precision,
  "tags"         text[],
  CONSTRAINT attachments_pkey PRIMARY KEY ("id"),
  -- proven present (ON CONFLICT planned)
  CONSTRAINT attachments_object_key_key UNIQUE ("object_key")
);


-- =====================================================================
-- Foreign keys (from the swagger's <fk .../> annotations).
-- Applied AFTER the tables so ordering does not matter; apply them after
-- the data load so historical orphans do not block the copy.
-- =====================================================================
ALTER TABLE public.users
  ADD CONSTRAINT users_inviter_fkey
  FOREIGN KEY ("inviter") REFERENCES public.users ("user_id");   -- 738 non-null

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_template_id_fkey
  FOREIGN KEY ("template_id") REFERENCES public.templates ("id"); -- 26 non-null

-- payments_v2.corporate_account_id -> corporate_account.id
-- payments_v2.employee_allocation_id -> employee_allocation.id
-- Both are 0/17135 non-null. Uncomment only if those tables are migrated too.
-- ALTER TABLE public.payments_v2 ADD CONSTRAINT payments_v2_corporate_account_id_fkey
--   FOREIGN KEY ("corporate_account_id") REFERENCES public.corporate_account ("id");
-- ALTER TABLE public.payments_v2 ADD CONSTRAINT payments_v2_employee_allocation_id_fkey
--   FOREIGN KEY ("employee_allocation_id") REFERENCES public.employee_allocation ("id");

COMMIT;


-- =====================================================================
-- POST-LOAD: resync identity sequences.
-- The source max values at probe time were payments_v2.id=19758,
-- assets.id=1550, prompts_history.prompt_id=30070, translations.id=416,
-- superhero_generations.id=131 (all higher than the row counts — there are
-- deletion gaps). Do not hardcode these; derive them after the copy.
-- Run this AFTER loading data with explicit ids, or the next insert
-- collides on the primary key.
-- =====================================================================
SELECT setval(pg_get_serial_sequence('public.payments_v2', 'id'),
              COALESCE((SELECT max(id) FROM public.payments_v2), 1), true);
SELECT setval(pg_get_serial_sequence('public.assets', 'id'),
              COALESCE((SELECT max(id) FROM public.assets), 1), true);
SELECT setval(pg_get_serial_sequence('public.prompts_history', 'prompt_id'),
              COALESCE((SELECT max(prompt_id) FROM public.prompts_history), 1), true);
SELECT setval(pg_get_serial_sequence('public.translations', 'id'),
              COALESCE((SELECT max(id) FROM public.translations), 1), true);
SELECT setval(pg_get_serial_sequence('public.superhero_generations', 'id'),
              COALESCE((SELECT max(id) FROM public.superhero_generations), 1), true);


-- =====================================================================
-- VERIFICATION after the data copy — money must be checked as TEXT, because
-- any float round-trip is invisible once the value is a JS Number.
--   Expect: stars_scale2 = 17135, amount_max_scale = 10, cost_max_scale = 17.
-- =====================================================================
-- SELECT count(*) FILTER (WHERE scale(stars) = 2) AS stars_scale2,
--        count(*)                                 AS total,
--        sum(amount)::text                        AS amount_sum,
--        sum(stars)::text                         AS stars_sum,
--        sum(cost)::text                          AS cost_sum,
--        max(scale(amount))                       AS amount_max_scale,  -- expect 10
--        max(scale(cost))                         AS cost_max_scale     -- expect 17
--   FROM public.payments_v2;
