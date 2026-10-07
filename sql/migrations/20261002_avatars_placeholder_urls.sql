-- Two bots carried an avatar_url that never existed: AI_STARS_bot pointed at
-- via.placeholder.com and LeeSolarbot at example.com. getPhotoUrl returns the
-- stored value as-is, so their menu photo was sent from a dead address.
-- Neither bot has its own picture in the bucket (landingpage/avatars/<bot>/ is
-- empty, checked 2026-10-02), so both get the house default that getPhotoUrl
-- already uses for bots without a row (DEFAULT_BOT_PHOTO_URL), in the bucket
-- form the other avatar rows use. Rows are kept: `avatars` is the bot registry.
BEGIN;

CREATE TABLE IF NOT EXISTS avatars_placeholder_url_backup_20261002 AS
SELECT * FROM avatars
WHERE avatar_url LIKE 'https://via.placeholder.com/%'
   OR avatar_url LIKE 'https://example.com/%';

UPDATE avatars
SET avatar_url = 'https://bucket-production-8259.up.railway.app/vibee-assets/landingpage/avatars/neuro_blogger_bot/levels/1.jpg',
    updated_at = now()
WHERE (telegram_id, bot_name) IN (
  SELECT telegram_id, bot_name FROM avatars_placeholder_url_backup_20261002
);

COMMIT;
