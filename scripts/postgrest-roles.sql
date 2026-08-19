-- =====================================================================
-- Roles PostgREST needs, mirroring the ones Supabase provides.
--
-- The app authenticates with a single key for everything and never signs
-- anyone in (zero .auth call sites), so in practice only one role is used.
-- Which one is NOT obvious: SUPABASE_SERVICE_KEY in this project is misnamed
-- and carries role=anon, while SUPABASE_SERVICE_ROLE_KEY carries
-- role=service_role. src/core/supabase/client.ts prefers SUPABASE_SERVICE_KEY,
-- so the live bot has been talking to Supabase as ANON this whole time.
--
-- ANON НЕ ПОЛУЧАЕТ НИЧЕГО. Первая версия этого файла давала ему GRANT ALL с
-- пометкой «сузим позже». Это была дыра, и её открыл именно этот скрипт.
--
-- В PostgREST anon — это роль запроса БЕЗ токена, то есть любой человек в
-- интернете. Замерено на живом шлюзе: GET /rest/v1/payments_v2 вообще без
-- заголовков отдавал 200 и content-range 0-0/17135, GET /rest/v1/users отдавал
-- telegram_id, а анонимный OpenAPI объявлял DELETE и PATCH на 11 таблицах,
-- включая payments_v2 — реестр, суммированием которого считается баланс
-- каждого пользователя. Один DELETE обнулил бы все балансы разом.
--
-- Поэтому переход на Railway идёт под service_role-ключом, а не под
-- SUPABASE_SERVICE_KEY (который, вопреки имени, несёт role=anon).
-- =====================================================================

BEGIN;

-- PostgREST switches into these with SET ROLE, so they must be NOLOGIN and
-- grantable to the connecting user.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

-- The connecting user must be a member of every role it may switch into.
GRANT anon, authenticated, service_role TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- Tables created later must not silently become invisible.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO authenticated, service_role;

-- Идемпотентно снимает всё, что могла раздать прошлая версия файла: без этого
-- повторный прогон оставил бы уже выданные привилегии на месте.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE USAGE ON SCHEMA public FROM anon;

COMMIT;
