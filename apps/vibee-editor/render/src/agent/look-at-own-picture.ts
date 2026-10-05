/**
 * The agent looks at its own picture before it says the facts are on it
 * (#3660).
 *
 * A confirmed date, time or price in the prompt is no promise that the image
 * model printed it: image models misspell digits. The agent got a URL, never
 * the picture, and told people "the date and the price are on the poster".
 * Our own vision reads the text off the picture, and every prompt fact it
 * does not find is named back to the agent.
 *
 * Measured 2026-10-06 on Railway (issue #3660): Qwen3-VL-2B read 4/4 facts
 * off synthetic posters at a 448 px side in ~1.1 s (768 px: ~2.3 s, same
 * hits). It never blocks delivery: vision off, slow, or failing -> seen null,
 * missing [], and the picture goes out exactly as before.
 */
import { DIGIT_JOINERS, factsIn, type Fact } from './printed-facts'
import { askVision, shrinkJpeg, visionConfig } from './media-vision'

export const READ_TEXT_PROMPT = 'Quote all visible text verbatim, nothing else.'

/** Longest side shown to vision: 448 read every fact at half the cost of 768. */
export const LOOK_SIDE = 448
/** The ceiling a person waits for the look; past it the picture goes as is. */
export const LOOK_TIMEOUT_MS = 20_000
/*
 * Room for a text-heavy poster: 100 tokens cut a long Cyrillic poster before
 * the price at the bottom (#3699). Decoding is a small part of the ~1.1 s the
 * bench measured at 448 px, and the 20 s ceiling still bounds the wait.
 */
export const LOOK_MAX_TOKENS = 300

/** Reads the text on a picture; throws or returns null when it cannot. */
export type ReadText = (bytes: Buffer) => Promise<string | null>

export interface LookDeps {
  read?: ReadText | null
  timeoutMs?: number
}

export interface Look {
  /** What vision read off the picture; null when nobody looked. */
  seen: string | null
  /** Prompt facts, as written, that the picture does not show. */
  missing: string[]
}

export interface VisionDeps {
  config?: typeof visionConfig
  shrink?: typeof shrinkJpeg
  ask?: typeof askVision
}

/** The real reader: shrink to LOOK_SIDE, ask vision on the live lane. */
export const liveRead = (deps: VisionDeps = {}): ReadText | null => {
  const v = (deps.config ?? visionConfig)()
  if (!v) return null
  const shrink = deps.shrink ?? shrinkJpeg
  const ask = deps.ask ?? askVision
  return async bytes => {
    const small = await shrink(bytes, LOOK_SIDE)
    return ask(
      v,
      READ_TEXT_PROMPT,
      [`data:image/jpeg;base64,${small.toString('base64')}`],
      LOOK_TIMEOUT_MS,
      LOOK_MAX_TOKENS,
      'live'
    )
  }
}

/*
 * Digits of a number, separators dropped: "1 500" and "1,500" -> "1500".
 * Groups join only across DIGIT_JOINERS (or a comma or a dot), the rule the
 * fact reader uses: a line break glued "11:30\n500" into "30500" and hid the
 * price (#3699).
 */
const DIGIT_RUN = new RegExp(`\\d(?:[${DIGIT_JOINERS}.,]?\\d)*`, 'g')
const digitRuns = (text: string): Set<string> =>
  new Set((text.match(DIGIT_RUN) ?? []).map(n => n.replace(/\D/g, '')))

/* Russian short month on a poster ("8 OKT.") -> the English short word the
 * fact reader knows. Strings, not a regex literal: the Cyrillic guard reads
 * regex literals as code. */
const RU_SHORT_MONTH: ReadonlyArray<[string, string]> = [
  ['янв', 'jan'], // cyrillic-ok: month on a poster
  ['фев', 'feb'], // cyrillic-ok: month on a poster
  ['мар', 'mar'], // cyrillic-ok: month on a poster
  ['апр', 'apr'], // cyrillic-ok: month on a poster
  ['мая|май', 'may'], // cyrillic-ok: month on a poster
  ['июн', 'jun'], // cyrillic-ok: month on a poster
  ['июл', 'jul'], // cyrillic-ok: month on a poster
  ['авг', 'aug'], // cyrillic-ok: month on a poster
  ['сент|сен', 'sep'], // cyrillic-ok: month on a poster
  ['окт', 'oct'], // cyrillic-ok: month on a poster
  ['ноя', 'nov'], // cyrillic-ok: month on a poster
  ['дек', 'dec'], // cyrillic-ok: month on a poster
]
const RU_SHORT_RE = RU_SHORT_MONTH.map(
  ([ru, en]) =>
    [new RegExp(`(\\d{1,2})\\s*(?:${ru})\\.?(?![\\p{L}])`, 'giu'), en] as const
)
const HOUR_LETTER = 'h|ч' // cyrillic-ok: "11.30 ч" on a poster

/**
 * Poster spellings the fact reader does not take, rewritten into ones it
 * does: "8 OKT." -> "8 oct", "11h30" / "11:30h" / "11.30 ch" -> "11:30".
 */
export function asReadable(seen: string): string {
  let t = seen
  for (const [re, en] of RU_SHORT_RE) t = t.replace(re, `$1 ${en}`)
  t = t.replace(
    new RegExp(
      `(?<![\\p{L}\\d])(\\d{1,2})(?:${HOUR_LETTER})([0-5]\\d)(?![\\p{L}\\d])`,
      'giu'
    ),
    '$1:$2'
  )
  t = t.replace(
    new RegExp(
      `(\\d{1,2}[:.][0-5]\\d)\\s?(?:${HOUR_LETTER})\\.?(?![\\p{L}])`,
      'giu'
    ),
    '$1'
  )
  return t
}

/** Does the text read off the picture carry this fact? */
export function showsFact(fact: Fact, seen: string): boolean {
  const keys = new Set(factsIn(asReadable(seen)).flatMap(f => f.keys))
  if (fact.keys.some(k => keys.has(k))) return true
  // A price whose currency vision dropped or rendered oddly ("500 THB" read
  // as "500 B") still shows its amount.
  if (fact.kind === 'price') {
    const runs = digitRuns(seen)
    return fact.keys.some(k => runs.has(k.slice(1)))
  }
  return false
}

const NOBODY_LOOKED: Look = { seen: null, missing: [] }

export async function lookAtOwnPicture(
  prompt: string,
  bytes: Buffer,
  deps: LookDeps = {}
): Promise<Look> {
  const facts = factsIn(prompt)
  if (!facts.length) return NOBODY_LOOKED
  const read = deps.read === undefined ? liveRead() : deps.read
  if (!read) return NOBODY_LOOKED
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const seen = await Promise.race([
      read(bytes),
      new Promise<null>(r => {
        timer = setTimeout(() => r(null), deps.timeoutMs ?? LOOK_TIMEOUT_MS)
      }),
    ])
    if (!seen) return NOBODY_LOOKED
    return {
      seen,
      missing: facts.filter(f => !showsFact(f, seen)).map(f => f.text),
    }
  } catch {
    return NOBODY_LOOKED
  } finally {
    clearTimeout(timer)
  }
}

/** The line added to the tool result; empty when nothing is missing. */
export function missingFactsNote(look: Look): string {
  if (!look.seen || !look.missing.length) return ''
  // Vision can misread a stylised poster, so the note is what it could not
  // find, not a verdict, and a redraw waits for the person's yes (#3699).
  return `Зрение не нашло на картинке: ${look.missing.join(', ')}. Не говори, что это на картинке; скажи человеку, что не смогла это разглядеть, и спроси, перерисовать ли.` // cyrillic-ok: the tools' answer text
}
