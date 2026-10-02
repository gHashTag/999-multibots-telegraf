/**
 * Public object base of the self-hosted storage behind the Railway
 * `supabase-gateway` (storage-api + MinIO, see apps/supabase-gateway/README.md).
 *
 * The bot switched off the cloud Supabase project on 2026-10-01 and every
 * object was copied with its path unchanged, so a cloud URL
 * `https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>`
 * maps to `${PUBLIC_STORAGE_BASE}/<bucket>/<path>` one to one.
 *
 * A plain constant rather than `supabase.storage.getPublicUrl()`: it is used in
 * module-level tables (model price lists) that load before secrets do.
 */
export const PUBLIC_STORAGE_BASE =
  'https://supabase-gateway-production-122d.up.railway.app/storage/v1/object/public'

export const publicStorageUrl = (bucket: string, path: string): string =>
  `${PUBLIC_STORAGE_BASE}/${bucket}/${path}`

/**
 * The picture a bot with no avatar of its own gets.
 *
 * There used to be a `step` argument substituted into `levels/${step}.jpg`.
 * Checked in storage on 2026-10-02: every bot's `levels/` holds `1.jpg` and
 * nothing else, `levels/2..22.jpg` never existed on the cloud host either, and
 * the only caller ever asked for step 1. The argument could only turn a
 * working address into a dead one, so it is gone.
 *
 * Lives here rather than in getPhotoUrl so writers of `avatars` rows can use
 * it without importing the bot registry.
 */
export const DEFAULT_BOT_PHOTO_URL = publicStorageUrl(
  'landingpage',
  'avatars/neuro_blogger_bot/levels/1.jpg'
)
