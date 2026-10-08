/**
 * A FAILED GENERATION NAMES ITSELF, SO A CLIENT CAN SAY IT IN ITS OWN LANGUAGE.
 *
 * The four generation routes (`/api/generate/image|video|audio|lipsync`) end a
 * failure with `{ success: false, error }`, and `error` is whatever was at
 * hand: a billing reason in Russian, a fixed English line, or a provider's own
 * text ("ElevenLabs TTS error: 401 - {...}"). The clients showed it as it
 * came -- the web showed the whole JSON body, braces included -- so an English
 * phone read Russian and a Russian phone read a provider's stack of English.
 *
 * Tagging each of the seventeen error writes by hand would miss the
 * eighteenth. The HTTP status already says which kind of failure it is, so
 * `stampRefusalCode` wraps `res.end` once per route (the same move as
 * `recordInto`) and adds a `code` to any failure body that lacks one. A route
 * that knows better can still set `code` itself and is left alone.
 *
 * `error` stays: it is the precise detail, and the clients keep it as a
 * second line. `code` is what they translate.
 *
 * The shared auth guard answers 401 BEFORE any route runs, so it names its
 * refusal itself with `refusalCodeFor` -- found by probing production before
 * the deploy (`tri gen-refusal`): every unsigned call came back without a code.
 *
 * The client sentences are checked against this list by
 * `generation-refusal-codes.test.ts`.
 */

export const GENERATION_REFUSAL_CODES = [
  'bad_input',
  'sign_in',
  'not_enough_tokens',
  'forbidden',
  'unavailable',
  'generation_failed',
  // A clip or a voice longer than the model takes. A 400 like any bad input,
  // so the status cannot say it: the two duration ceilings set it themselves.
  // Under `bad_input` it read "something is missing" over "video must be 10
  // seconds or shorter" -- nothing was missing.
  'too_long',
  // The generation failed AFTER the person paid, and the tokens are back on
  // their balance. A 500 like any failure, so the status cannot say it: the
  // route sets it itself, and only when the refund actually went through.
  'generation_failed_refunded',
] as const

export type GenerationRefusalCode = (typeof GENERATION_REFUSAL_CODES)[number]

/** What a status means for the person who pressed "generate". */
export function refusalCodeFor(status: number): GenerationRefusalCode {
  if (status === 401) return 'sign_in'
  // `chargeMiniAppUser` answers 402 for a short balance, nothing else does.
  if (status === 402) return 'not_enough_tokens'
  if (status === 403) return 'forbidden'
  if (status >= 400 && status < 500) return 'bad_input'
  // 503 is "billing unavailable": nothing was charged, nothing was tried.
  if (status === 503) return 'unavailable'
  return 'generation_failed'
}

type Ending = {
  statusCode?: number
  end: (chunk?: any, ...rest: any[]) => any
}

/**
 * Add `code` to a failure body that has none. Never fails the answer: a body
 * that is not JSON, or not a failure, goes out exactly as written.
 *
 * Installed at the top of a route, so `recordInto` (installed later) wraps
 * OUTSIDE it and sees the body before the code is added -- which is why
 * `recordInto` takes a code the route wrote itself, and derives one from the
 * status only when the body has none.
 */
export function stampRefusalCode(res: Ending): void {
  const original = res.end.bind(res)
  res.end = ((chunk?: any, ...rest: any[]) => {
    const status = res.statusCode ?? 200
    if (status >= 400 && chunk != null) {
      try {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
        const parsed = JSON.parse(text)
        if (
          parsed &&
          typeof parsed === 'object' &&
          parsed.success === false &&
          typeof parsed.code !== 'string'
        ) {
          chunk = JSON.stringify({ ...parsed, code: refusalCodeFor(status) })
        }
      } catch {
        // Not JSON: send it as it is.
      }
    }
    return original(chunk, ...rest)
  }) as typeof res.end
}

/**
 * The failure body of a generation that was paid for and then failed.
 *
 * `refunded` is what the refund actually put back -- 0 when nothing was
 * charged (the agent pays at its own layer, the owner pays nothing) or when
 * the refund did not go through. Only a real refund earns the sentence
 * "your tokens are back"; anything else stays a plain `generation_failed`,
 * added by `stampRefusalCode`.
 */
export function failureAfterCharge(
  error: string,
  refunded: number
): {
  success: false
  error: string
  code?: GenerationRefusalCode
  refunded?: number
} {
  return refunded > 0
    ? { success: false, error, code: 'generation_failed_refunded', refunded }
    : { success: false, error }
}
