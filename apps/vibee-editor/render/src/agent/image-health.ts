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

/** One provider's last real refusal, remembered for REMEMBER_MS. */
function lastRealOutcome() {
  // owner-scope: per process -- this is the provider's state, not a person's.
  let lastFailure: { at: number; why: string } | null = null
  return {
    failed(why: unknown, now: number): void {
      if (!looksLikeProviderOutage(why)) return
      lastFailure = { at: now, why: String(why).slice(0, 160) }
    },
    worked(): void {
      lastFailure = null
    },
    down(now: number): { why: string; minutesAgo: number } | null {
      if (!lastFailure) return null
      const age = now - lastFailure.at
      if (age > REMEMBER_MS) {
        lastFailure = null
        return null
      }
      return { why: lastFailure.why, minutesAgo: Math.floor(age / 60_000) }
    },
  }
}

const images = lastRealOutcome()

/** A real attempt failed. Remembered only if the reason blames the provider. */
export function noteImagesFailed(why: unknown, now = Date.now()): void {
  images.failed(why, now)
}

/** A real picture came back: whatever we thought, it works. */
export function noteImagesWorked(): void {
  images.worked()
}

/** For tests. */
export function forgetImageHealthForTests(): void {
  images.worked()
  voice.worked()
}

/**
 * The outage, if one was seen recently enough to still believe. Null means
 * "no reason to doubt", which is also what it says before the first attempt:
 * silence is not evidence of trouble.
 */
export function imagesLookDown(
  now = Date.now()
): { why: string; minutesAgo: number } | null {
  return images.down(now)
}

/*
 * A CLIENT'S VOICE, LEARNED THE SAME WAY (2026-09-27).
 *
 * A client's voice -- her clone (crm_voice_clone) and every line spoken with
 * it (audio_generate for_lead, the story reel) -- is MiniMax on Replicate.
 * The health page asks Replicate GET /v1/account, which answers 200 with no
 * credit at all: the 402 comes only from a real prediction. And it words
 * ElevenLabs as "the voice". So the CRM agent, asked for a reel in a client's
 * voice while Replicate was out of credit, read "Replicate works, voice
 * (ElevenLabs) broken", told the owner to fix the ElevenLabs key -- which
 * the client's voice never uses -- and assembled the reel by hand instead of
 * the template. What the last real call said is the only honest answer.
 */
const voice = lastRealOutcome()

/** A real clone or a line in a client's voice failed at the provider. */
export function noteVoiceFailed(why: unknown, now = Date.now()): void {
  voice.failed(why, now)
}

/** A real clone or line came back. */
export function noteVoiceWorked(): void {
  voice.worked()
}

/** Replicate's refusal of a client's voice, if seen recently enough to believe. */
export function voiceLooksDown(
  now = Date.now()
): { why: string; minutesAgo: number } | null {
  return voice.down(now)
}
