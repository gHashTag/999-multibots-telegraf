/**
 * WHETHER THE PICTURE PROVIDER IS ALIVE, LEARNED FROM WHAT ACTUALLY HAPPENED.
 *
 * MEASURED IN PRODUCTION 2026-09-16: `providers_status` answers that FAL --
 * the pictures -- is HTTP 403, "User is locked. Reason: Exhausted balance",
 * while point 4 of the seller's playbook tells the model, unconditionally, to
 * give every first contact a lead magnet: a portrait drawn from the person's
 * own avatar. The seller promises a present the platform cannot make, to a
 * real client, in the owner's name.
 *
 * NOT A PROBE. The obvious fix -- ask the provider before promising -- costs
 * a generation every time: the FAL check in render-server POSTs a real job to
 * queue.fal.run. Paying to ask whether one can pay is the wrong shape. So
 * this remembers what the last REAL attempt did, which is free and is also
 * better evidence.
 *
 * FORGETS ON PURPOSE. Half an hour after a failure the door opens again: a
 * topped-up balance must not need a deploy to be noticed, and one stuck flag
 * silencing the lead magnet forever is worse than one wasted attempt.
 */
const REMEMBER_MS = 30 * 60_000

// owner-scope: per process -- this is the provider's state, not a person's.
let lastFailure: { at: number; why: string } | null = null

/**
 * Only the refusals that mean THE PROVIDER, not this request.
 *
 * A prompt rejected by a safety filter, or a photo that would not download,
 * says nothing about the balance -- and treating it as an outage would
 * silence the lead magnet for everybody because of one odd picture.
 */
const PROVIDER_IS_DOWN = new RegExp(
  [
    '\\b(401|402|403|429)\\b',
    'exhausted|insufficient|balance|locked|quota|rate limit|unauthor',
    // A key that is missing or wrong makes the provider unusable too: the
    // health check words that one as "FAL_KEY is not set".
    '[A-Z]+_KEY|api[ _-]?key|not set',
    'ключ|баланс|лимит|не задан', // cyrillic-ok: the words our own errors use
  ].join('|'),
  'i'
)

export function looksLikeProviderOutage(why: unknown): boolean {
  return PROVIDER_IS_DOWN.test(String(why ?? ''))
}

/** A real attempt failed. Remembered only if the reason blames the provider. */
export function noteImagesFailed(why: unknown, now = Date.now()): void {
  if (!looksLikeProviderOutage(why)) return
  lastFailure = { at: now, why: String(why).slice(0, 160) }
}

/** A real picture came back: whatever we thought, it works. */
export function noteImagesWorked(): void {
  lastFailure = null
}

/** For tests. */
export function forgetImageHealthForTests(): void {
  lastFailure = null
}

/**
 * The outage, if one was seen recently enough to still believe. Null means
 * "no reason to doubt", which is also what it says before the first attempt:
 * silence is not evidence of trouble.
 */
export function imagesLookDown(
  now = Date.now()
): { why: string; minutesAgo: number } | null {
  if (!lastFailure) return null
  const age = now - lastFailure.at
  if (age > REMEMBER_MS) {
    lastFailure = null
    return null
  }
  return { why: lastFailure.why, minutesAgo: Math.floor(age / 60_000) }
}
