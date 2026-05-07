-- Migration: Remove unique constraint from username
-- Date: 2025-12-28
-- Reason: username should NOT be unique because:
--   1. Multiple users can have the same display name
--   2. Users can change their Telegram username
--   3. telegram_id is the true unique identifier
--
-- Error that triggered this:
--   duplicate key value violates unique constraint "users_username_key" (code: 23505)

-- Remove the unique constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;

-- Verify: telegram_id should remain unique
-- SELECT constraint_name FROM information_schema.table_constraints
-- WHERE table_name = 'users' AND constraint_type = 'UNIQUE';
