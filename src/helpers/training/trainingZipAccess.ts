/**
 * The LoRA training archive is a ZIP of 10+ personal FACE photos — biometric
 * PII. Replicate downloads it over plain HTTP from whatever `input_images`
 * says, so that value is a bearer capability over somebody's face set.
 *
 * Two things follow, and this module owns both:
 *
 * 1. The link handed to the provider is minted AT THE MOMENT the training is
 *    started and is never the stored value. What we keep in `model_trainings`
 *    .zip_url (and in the Inngest event payload, which Inngest retains) stays
 *    exactly as it is — it is a location, not an access grant. Older rows hold
 *    a PUBLIC `images/train/*.zip` URL; those are re-signed here too, which is
 *    what finally lets that exception leave the bucket policy.
 * 2. Nothing may log the signed form. `redactTrainingZipUrl` is the only shape
 *    allowed near a log line.
 */

/**
 * Lifetime of the link handed to the training provider.
 *
 * Justified against the code's own clocks, not a round number:
 * `checkStuckTrainings.ts` calls a training stuck at 3 h
 * (`STUCK_THRESHOLD_HOURS`) and alerts at 6 h (`ALERT_THRESHOLD_HOURS`), and
 * the wizard promises the user "~1-2 hours". Six hours is therefore this
 * codebase's own line for "this training is already broken". Doubling it
 * leaves room for a training that sits behind another one (generateModelTraining
 * runs at `concurrency: 2`) plus Replicate's own GPU queue, while keeping the
 * capability far shorter than the 7 days a default presign would hand out.
 * Past this point `checkStuckTrainings` has already retired the training, so an
 * expired link cannot make anything worse — and a retry re-signs anyway.
 */
export const TRAINING_ZIP_SIGNED_URL_TTL_SECONDS = 12 * 60 * 60

/** Where the archive actually lives, independent of how it was addressed. */
export interface TrainingZipLocation {
  bucket: string
  key: string
}

/**
 * The slice of `supabase.storage` this module needs. Narrow on purpose: the
 * tests hand it a fake signer, and a fake that satisfies this cannot quietly
 * satisfy less than the real client does.
 */
export interface TrainingZipStorage {
  from(bucket: string): {
    createSignedUrl(
      key: string,
      expiresIn: number
    ): Promise<{
      data: { signedUrl?: string | null } | null
      error: { message?: string } | null
    }>
  }
}

/** Marks a value that addresses OUR storage, so it must never leave unsigned. */
const OUR_STORAGE_MARKER = '/storage/v1/object/'

/**
 * `/storage/v1/object/[public|sign|authenticated/]<bucket>/<key...>`.
 * The access-mode segment is optional because Supabase has used all four
 * spellings over the life of these rows.
 */
const OBJECT_PATH =
  /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/]+)\/(.+)$/

/**
 * Read the bucket and key out of a stored value — a public URL, an expired
 * signed URL, or a bare `bucket/key`. Returns null when the value does not
 * address our storage at all (a provider-hosted URL from some other flow).
 */
export function parseTrainingZipLocation(
  stored: string
): TrainingZipLocation | null {
  if (!stored) return null

  if (!stored.includes('://')) {
    const slash = stored.indexOf('/')
    if (slash <= 0 || slash === stored.length - 1) return null
    return {
      bucket: stored.slice(0, slash),
      key: stored.slice(slash + 1),
    }
  }

  let path: string
  try {
    path = new URL(stored).pathname
  } catch {
    return null
  }

  const match = OBJECT_PATH.exec(path)
  if (!match) return null

  // The path is percent-encoded; createSignedUrl wants the raw key.
  let key: string
  try {
    key = decodeURIComponent(match[2])
  } catch {
    key = match[2]
  }

  return { bucket: decodeURIComponent(match[1]), key }
}

/**
 * The only form of a training archive reference that may reach a log line.
 * Never returns a query string: for a Supabase signed URL the token lives
 * there, and for an S3 presign so does `X-Amz-Signature`.
 */
export function redactTrainingZipUrl(
  stored: string | undefined | null
): string {
  if (!stored) return '<none>'

  const location = parseTrainingZipLocation(stored)
  if (location) return `${location.bucket}/${location.key}`

  // Foreign URL: keep the origin and path, drop the query, cap the length.
  const withoutQuery = stored.split('?')[0]
  return withoutQuery.length > 120
    ? `${withoutQuery.slice(0, 120)}…`
    : withoutQuery
}

/**
 * Mint the link the training provider will actually fetch.
 *
 * Fails CLOSED: if the value addresses our storage and cannot be signed, this
 * throws rather than falling back to the public URL. A training that does not
 * start is recoverable; a face set published to the internet is not.
 */
export async function signTrainingZipUrl(
  stored: string,
  storage: TrainingZipStorage,
  ttlSeconds: number = TRAINING_ZIP_SIGNED_URL_TTL_SECONDS
): Promise<string> {
  if (!stored) {
    throw new Error('Training ZIP reference is empty — refusing to start')
  }

  const location = parseTrainingZipLocation(stored)

  if (!location) {
    if (stored.includes(OUR_STORAGE_MARKER)) {
      // It IS ours but we could not read bucket/key out of it. Guessing here
      // would mean handing over the stored (possibly public) URL.
      throw new Error(
        `Cannot locate training ZIP in storage: ${redactTrainingZipUrl(stored)}`
      )
    }
    // Not ours to sign (provider-hosted archive from another flow).
    return stored
  }

  const { data, error } = await storage
    .from(location.bucket)
    .createSignedUrl(location.key, ttlSeconds)

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to sign training ZIP ${redactTrainingZipUrl(stored)}: ${
        error?.message || 'no signed URL returned'
      }`
    )
  }

  return data.signedUrl
}
