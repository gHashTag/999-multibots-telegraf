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
import { factsIn, type Fact } from './printed-facts'
import { askVision, shrinkJpeg, visionConfig } from './media-vision'

export const READ_TEXT_PROMPT = 'Quote all visible text verbatim, nothing else.'

/** Longest side shown to vision: 448 read every fact at half the cost of 768. */
export const LOOK_SIDE = 448
/** The ceiling a person waits for the look; past it the picture goes as is. */
export const LOOK_TIMEOUT_MS = 20_000

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

const liveRead = (): ReadText | null => {
  const v = visionConfig()
  if (!v) return null
  return async bytes => {
    const small = await shrinkJpeg(bytes, LOOK_SIDE)
    return askVision(
      v,
      READ_TEXT_PROMPT,
      [`data:image/jpeg;base64,${small.toString('base64')}`],
      LOOK_TIMEOUT_MS,
      100,
      'live'
    )
  }
}

/** Digits of a number, separators dropped: "1 500" and "1,500" -> "1500". */
const digitRuns = (text: string): Set<string> =>
  new Set(
    (text.match(/\d[\d\s.,]*\d|\d/g) ?? []).map(n => n.replace(/\D/g, ''))
  )

/** Does the text read off the picture carry this fact? */
export function showsFact(fact: Fact, seen: string): boolean {
  const keys = new Set(factsIn(seen).flatMap(f => f.keys))
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
  return `Зрение прочло картинку: на ней НЕ видно ${look.missing.join(', ')}. Не говори, что это на картинке; скажи человеку честно и предложи перерисовать.` // cyrillic-ok: the tools' answer text
}
