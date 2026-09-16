/**
 * ONE INCIDENT IS ONE MESSAGE, NOT A THOUSAND.
 *
 * The owner's alert channel was switched on this morning, and winston forwards
 * every logger.error to it. A census of the repository then found thirteen
 * confirmed sites that fire on a TIMER for a PERSISTENT condition. The worst:
 *
 *   notificationHandler   a Supabase probe every 60s        1440 messages/day
 *   sessionStore          a Redis error every 60s, twice    up to 2880/day
 *   generateImageToVideo  a poll that keeps polling         120 in four minutes
 *   requireInternalKey    once per request, scanners incl.  unbounded
 *
 * Thirteen call-site fixes would leave the class open: roughly 250 more
 * logger.error sites were never classified, and the next one added is a new
 * flood. So the throttle lives at the CHOKE POINT the transport already is --
 * every alert passes through one function, and a rule there cannot be forgotten
 * by the next person who writes logger.error.
 *
 * NOTHING IS SILENTLY DROPPED, which is the whole difference between this and
 * muting. A repeat inside the window is counted, and the next message that gets
 * through carries the count: "... (+47 за 10 мин)". A reader who sees one alert
 * knows it happened once; a reader who sees the count knows it is a storm. That
 * is what a suppressed duplicate must never take away.
 *
 * The fingerprint is the message text without its digits, so "attempt 3 of 20"
 * and "attempt 4 of 20" are one incident rather than twenty, while two genuinely
 * different failures stay apart.
 */

export const WINDOW_MS = 10 * 60 * 1000
/** Bounded so a process that runs for months cannot grow this without limit. */
export const MAX_TRACKED = 500

export interface ThrottleState {
  firstAt: number
  lastSentAt: number
  suppressed: number
}

/**
 * The identity of an incident.
 *
 * Digits are removed on purpose: a retry counter, a row id or a millisecond
 * duration inside the text would otherwise make every repetition unique, and a
 * throttle that never matches is not a throttle.
 *
 * DIGITS ALONE WERE NOT ENOUGH. That rule collapses the numeric identifiers --
 * telegram ids, timestamps, `test-${Date.now()}` -- and leaves every identifier
 * that contains a letter intact. Seventeen alert titles in the reels render
 * pipeline are built as `Failed to … for job ${job_id}`, and a job id on a
 * Supabase table is a uuid (the schema this repository writes by hand declares
 * `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`); masking its digits leaves
 * `#a#bc#-d#ef-…`, still unique per job. One broken render step across twenty
 * jobs was therefore twenty incidents and twenty pushes, when it is one defect.
 *
 * So opaque identifiers are masked too -- and ONLY those. Deliberately NOT the
 * prose: `Ошибка Supabase: connection refused` and `…: permission denied` are
 * two different failures, and a fingerprint that merged them would hide the
 * second one for ten minutes. Over-normalising is the worse mistake, because
 * the noise it removes is visible and the incident it swallows is not.
 */
export function fingerprint(message: string, context?: string): string {
  const normalised = String(message)
    // uuid v1-v5 in any casing, the shape Supabase row ids take.
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      '#uuid'
    )
    // A long unbroken hex run: a provider task id, a checksum, a request id.
    .replace(/\b[0-9a-f]{16,}\b/gi, '#hex')
    .replace(/\d+/g, '#')
  return `${context || ''}|${normalised.slice(0, 160)}`
}

export interface Decision {
  send: boolean
  /** Repeats swallowed since the last message that got through. */
  suppressed: number
}

/**
 * Should this alert go out now?
 *
 * First of its kind: yes. A repeat inside the window: no, counted. The first
 * one after the window: yes, carrying the count of what was held back.
 */
export function decide(
  seen: Map<string, ThrottleState>,
  key: string,
  now: number,
  windowMs: number = WINDOW_MS
): Decision {
  const state = seen.get(key)
  if (!state) {
    if (seen.size >= MAX_TRACKED) {
      // Evict the coldest entry rather than refusing to track: a full map must
      // not turn into "never throttle again" nor into "never alert again".
      let coldest: string | undefined
      let coldestAt = Infinity
      for (const [k, v] of seen)
        if (v.lastSentAt < coldestAt) {
          coldestAt = v.lastSentAt
          coldest = k
        }
      if (coldest !== undefined) seen.delete(coldest)
    }
    seen.set(key, { firstAt: now, lastSentAt: now, suppressed: 0 })
    return { send: true, suppressed: 0 }
  }
  if (now - state.lastSentAt < windowMs) {
    state.suppressed++
    return { send: false, suppressed: state.suppressed }
  }
  const held = state.suppressed
  state.lastSentAt = now
  state.suppressed = 0
  return { send: true, suppressed: held }
}

/** The count, said in the message itself so it cannot be lost. */
export function withSuppressedCount(
  message: string,
  suppressed: number,
  windowMs: number = WINDOW_MS
): string {
  if (suppressed <= 0) return message
  const minutes = Math.round(windowMs / 60000)
  return `${message}\n\n(+${suppressed} раз за последние ${minutes} мин — то же самое)`
}
