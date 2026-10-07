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
/**
 * The FIRST sentence of an answer is cut at its first clause (a comma, a
 * semicolon or a colon) once the clause is this long. Every voice agent we
 * compared (LiveKit, Pipecat, Vapi) sends the first clause to synthesis, not
 * the first sentence: the person hears the agent start while it is still
 * writing, and a short clause synthesises faster than a long sentence. Only
 * the first piece: after that the queue is ahead of the voice anyway, and
 * whole sentences sound better.
 */
const FIRST_CLAUSE_MIN = 24

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
  if (held === 0) {
    const clause = firstClause(text, end, final)
    if (clause) {
      sentences.push(text.slice(0, clause).trim())
      held = clause
    }
  }
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

/**
 * Where the answer's first clause ends, or 0 to keep the first sentence
 * whole. The clause must be complete (its mark followed by a space), at least
 * FIRST_CLAUSE_MIN long, and before the first sentence's stop. When that stop
 * is already written, the rest of the sentence must be long enough to stand
 * alone -- "..., ладно?" spoken by itself sounds broken.
 */
function firstClause(text: string, end: RegExp, final: boolean): number {
  end.lastIndex = 0
  const stop = end.exec(text)
  const sentenceEnd = stop
    ? stop.index + stop[0].length
    : final
      ? text.length
      : -1
  const mark = /[,;:](?=\s)/g
  mark.lastIndex = FIRST_CLAUSE_MIN - 1
  const m = mark.exec(text)
  if (!m) return 0
  const at = m.index + 1
  if (sentenceEnd < 0) return at
  // A mark past the stop leaves an empty rest, which is "too short" too.
  return text.slice(at, sentenceEnd).trim().length >= MIN_CHARS ? at : 0
}
