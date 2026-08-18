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
-- Both are therefore granted full table access here. Narrowing anon later is a
-- deliberate change with a blast radius, not a detail to get right by accident.
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

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Tables created later must not silently become invisible.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

COMMIT;
