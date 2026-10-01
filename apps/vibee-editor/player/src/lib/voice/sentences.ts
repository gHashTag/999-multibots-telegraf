/**
 * Cutting a growing answer into sentences to speak.
 *
 * The agent writes its answer a few characters at a time. Waiting for the
 * whole of it before speaking would cost the full answer's time PLUS the
 * synthesis of all of it; speaking each finished sentence as soon as it is
 * finished means the first words are heard while the rest is still written.
 * Measured on our engine (render src/voice/voice.ts): ~0.3-1.6 s per Russian
 * sentence, ~2.5-3.5 s per English one.
 */

/** Below this a sentence is glued to the next one: a lone "Yes." sounds clipped. */
const MIN_CHARS = 18
/** Above this a run without a stop is cut at a comma or a space anyway. */
const MAX_CHARS = 240

export interface Cut {
  /** Sentences ready to be spoken, in order. */
  sentences: string[]
  /** How far into the text has now been handed out. */
  next: number
}

/**
 * The finished sentences of `text` after `from`. While the answer is still
 * being written (`final` false) an unfinished or too-short tail is kept back
 * and `next` points at its start; once final, the tail is spoken too.
 */
export function takeSentences(text: string, from: number, final: boolean): Cut {
  const sentences: string[] = []
  // `held` is where the not-yet-spoken text begins; `scan` is how far we looked.
  let held = Math.min(Math.max(0, from), text.length)
  const end = /[.!?…]+["»)\]]*(?=\s)|\n+/g
  end.lastIndex = held
  let m: RegExpExecArray | null
  while ((m = end.exec(text))) {
    const stop = m.index + m[0].length
    const piece = text.slice(held, stop).trim()
    if (!piece) {
      held = stop
      continue
    }
    if (piece.length < MIN_CHARS && !m[0].includes('\n')) continue
    sentences.push(piece)
    held = stop
  }
  // A long run with no stop in it: cut at the last comma, else the last space.
  while (text.length - held > MAX_CHARS) {
    const window = text.slice(held, held + MAX_CHARS)
    const comma = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '))
    const at = comma > MAX_CHARS / 3 ? comma + 1 : window.lastIndexOf(' ')
    if (at <= 0) break
    sentences.push(window.slice(0, at).trim())
    held += at
  }
  if (final) {
    const tail = text.slice(held).trim()
    if (tail) sentences.push(tail)
    return { sentences, next: text.length }
  }
  return { sentences, next: held }
}
