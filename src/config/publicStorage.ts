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
