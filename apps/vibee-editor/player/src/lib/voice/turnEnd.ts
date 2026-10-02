/**
 * THE WORDS SAY WHEN A TURN IS OVER (cycle 11).
 *
 * The level gate (vad.ts) ends a turn after END_OF_TURN_MS of silence, and
 * silence alone cannot tell "Show me my week." from "Show me my week and..."
 * followed by a breath. The second was cut in half: the agent answered the
 * first half, and the rest came as a new question over the answer.
 *
 * The words of the pause are usually known by then -- eager hearing asks for
 * them 300 ms into it (session.ts) -- so they judge. A phrase that stops on a
 * conjunction, a preposition, a hesitation ("uh", "э-э") or a trailing comma
 * or ellipsis is still going: the session waits up to HANGING_TURN_MS of
 * silence before taking it as said. Anything else is over, exactly as
 * before -- a phrase this does not recognise is never held.
 *
 * LiveKit's turn detector does the same with a model: min_delay 0.3 s when
 * it is sure, max_delay 2.5 s when it is not. Pipecat's Smart Turn v3 judges
 * the audio itself (8 MB ONNX) and falls back after 3 s. Words are what we
 * already have, at no download.
 */

/** Silence a phrase that stops mid-thought is given before it counts as said. */
export const HANGING_TURN_MS = 2500

/*
 * Only words a finished phrase almost never ends on. Left out on purpose:
 * "on", "in", "off", "about", "so", "that", "is", "her" ("turn it on",
 * "what is it about", "I think so") and "мне", "это", "ну", "так"
 * ("покажи мне", "что это", a backchannel "ну").
 */
// cyrillic-ok-next-line
const RU =
  'и а но или либо что чтобы потому если когда где который которая которые которое которую чем в во на с со к ко по для из от у о об про за под над при без до через между перед э ээ эээ эм эмм мм ммм хм'
const EN =
  'and or but because if when where which the a an to of at for with from into my your our their uh um er erm'
const HANGING = new Set(`${RU} ${EN}`.split(' '))

/** The phrase stops mid-thought: more words are on their way. */
export function hangs(text: string): boolean {
  const t = text.trim()
  if (/(?:\.\.\.|…|[,:;\-–—])$/u.test(t)) return true
  const words = t
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean)
  const last = words[words.length - 1]
  return last !== undefined && HANGING.has(last)
}
