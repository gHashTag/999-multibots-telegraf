/**
 * `tri turn`: what the words of a pause say about the turn (cycle 11).
 *
 *   bun scripts/turn-bench.ts [phrase ...]
 *
 * Each phrase is judged by `hangs` of src/lib/voice/turnEnd.ts -- the code
 * the session runs -- and printed with the silence it would be given:
 * END_OF_TURN_MS when it is over, HANGING_TURN_MS when it stops mid-thought.
 * With no phrases it runs its own battery, each with the verdict it must
 * get; a wrong verdict exits 1. The battery is the place to add a phrase
 * the session got wrong in real use.
 */
import { readFileSync } from 'node:fs'
import { HANGING_TURN_MS, hangs } from '../src/lib/voice/turnEnd'
import { END_OF_TURN_MS } from '../src/lib/voice/vad'

const session = readFileSync(
  new URL('../src/lib/voice/session.ts', import.meta.url),
  'utf8'
)
const eager = Number(/const EAGER_HEAR_MS = (\d+)/.exec(session)?.[1])

/* [phrase, still going] */
const BATTERY: [string, boolean][] = [
  ['Show me my week.', false],
  ['open my calendar', false],
  ['turn it on', false],
  ['I think so', false],
  ['show me my week and', true],
  ['I want to', true],
  ['well, um', true],
  ['let me think...', true],
  // cyrillic-ok-next-line
  ['Покажи мне', false],
  // cyrillic-ok-next-line
  ['Что это?', false],
  // cyrillic-ok-next-line
  ['Сделай рилс.', false],
  // cyrillic-ok-next-line
  ['Покажи мне неделю и', true],
  // cyrillic-ok-next-line
  ['Хочу записаться на', true],
  // cyrillic-ok-next-line
  ['Ну э-э', true],
  // cyrillic-ok-next-line
  ['Напомни, что', true],
]

/*
 * A phrase may be preceded by --want-hang or --want-over: `tri turn --live`
 * says what it spoke, and the ears decide whether the hang survived.
 */
const given: [string, boolean | null][] = []
let want: boolean | null = null
for (const a of process.argv.slice(2)) {
  if (a === '--want-hang' || a === '--want-over') want = a === '--want-hang'
  else {
    given.push([a, want])
    want = null
  }
}
const rows = given.length ? given : BATTERY

console.log(
  `  silence: words asked for at ${eager} ms, turn over at ${END_OF_TURN_MS} ms` +
    ` if they are here and finished, ${HANGING_TURN_MS} ms if they hang` +
    ` (words still on their way hold it up to ${HANGING_TURN_MS} ms)`
)
let wrong = 0
for (const [phrase, want] of rows) {
  const got = hangs(phrase)
  const bad = want !== null && got !== want
  if (bad) wrong++
  const wait = got ? HANGING_TURN_MS : END_OF_TURN_MS
  console.log(
    `  ${bad ? 'WRONG' : got ? 'hangs' : 'over '}  ${String(wait).padStart(4)} ms  ${JSON.stringify(phrase)}` +
      (bad ? `  (should ${want ? 'hang' : 'be over'})` : '')
  )
}
if (!Number.isFinite(eager)) {
  console.log('  EAGER_HEAR_MS not found in session.ts: the bench is stale')
  process.exit(1)
}
process.exit(wrong ? 1 : 0)
