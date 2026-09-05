import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * Ratchet: a comment that states its own sum must state it correctly.
 *
 * Some comments are calculations rather than prose -- they quote every figure
 * they need and then give the answer, so checking one requires no domain
 * knowledge, no database and no runtime. Executing them found ten wrong
 * claims across two files in the iteration before this, and one of those ten
 * was the number a live charge is computed from.
 *
 * Four are wrong today and none of them is a repair this loop may make, so
 * each is named BY ITS EXPRESSION with the reason. A new one is a failure --
 * including a new one in a file that already has an excused mismatch.
 *
 * The probe itself refuses to report a clean sheet over nothing: it exits 2
 * when the corpus yields zero claims, so a broken matcher cannot pass this as
 * good news.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')

/**
 * Why each surviving mismatch is not something this loop should change.
 *
 * Keyed by the EXPRESSION, not the file. The first version keyed by file and a
 * mutation walked straight through it: adding a new wrong sum to a file that
 * already had one changed nothing, because the file was already excused. An
 * allowlist is only as narrow as the thing it names.
 */
const KNOWN: Record<string, string> = {
  '0x + 40 hex = 42':
    'a format note, not arithmetic: it counts characters, and the checker reads the 0x prefix as the number zero',
  '120 * 30s = 1':
    'a unit conversion -- "120 * 30s = 1 hour" is true in seconds-to-hours, and the checker has no units',
  '35732 + 200 + 29314 + 2999 + 0 + 89990.81 = 157235.81':
    'a real discrepancy of exactly 1000 in a one-off report script: the addends sum to 158235.81 while the comment and the literal both say 157235.81. Which figure is wrong is a data question about numbers pulled from SQL, not something to guess at',
  '6 сек × $0.485 × 1.5 / $0.016 = 182':
    'the Runway Aleph estimate writes the markup into the formula but omits it from the answer (182 rather than 273). The entry is status: deprecated, so nothing charges from it',
}

function run(): { claims: number; mismatches: string[] } {
  const out = execFileSync('node', ['scripts/comment-math.cjs'], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  // Built from a string literal, not written as a regex literal: the repo's
  // no-cyrillic hook allows Cyrillic only inside string literals, and the
  // probe's summary line is Russian.
  const claims = Number(
    out.match(
      new RegExp('арифметических утверждений в комментариях: (\\d+)')
    )?.[1] ?? '0'
  )
  // Each mismatch prints as "  <path>:<line>" then the expression indented
  // under it. The expression is what identifies the claim; the line number
  // moves whenever anything above it is edited.
  const mismatches = [...out.matchAll(/^ {2}\S+?:\d+\n {4}(.+)$/gm)].map(m =>
    m[1].trim()
  )
  return { claims, mismatches }
}

describe('a comment that states its own sum states it correctly', () => {
  it('finds arithmetic claims to judge at all', () => {
    // The probe exits 2 on an empty corpus, so this would throw rather than
    // pass vacuously -- but the count is asserted here too, because "the
    // matcher still sees its subject" is the assumption every line below
    // rests on.
    expect(run().claims).toBeGreaterThan(20)
  })

  it('has no mismatch outside the four with a recorded reason', () => {
    const unexpected = run().mismatches.filter(e => !(e in KNOWN))
    expect(
      unexpected,
      'a comment states a sum it does not add up to. Fix the comment, or -- ' +
        'if the number is a units conversion the checker cannot do -- record ' +
        'why in KNOWN above:\n' +
        unexpected.join('\n')
    ).toEqual([])
  })

  it('still reports every known one, so the list cannot rot unnoticed', () => {
    // The reverse direction. If a known mismatch is fixed or its file moves,
    // the entry here is stale and the next reader inherits a reason for
    // something that is no longer true.
    const seen = new Set(run().mismatches)
    const gone = Object.keys(KNOWN).filter(e => !seen.has(e))
    expect(
      gone,
      'a recorded mismatch no longer appears. If it was fixed, delete its ' +
        'entry from KNOWN; if the file moved, update the path'
    ).toEqual([])
  })
})
