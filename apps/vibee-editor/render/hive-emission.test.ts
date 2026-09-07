import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE JOURNAL IS ONLY WORTH ANYTHING IF SOMETHING WRITES TO IT.
 *
 * A journal with no writers is the same failure as a journal with no readers,
 * and this repository already has both kinds next door: trios has
 * `gardener_decisions` and `railway_audit_events`, append-only, zero readers,
 * and `railway_audit_events` also has zero writers.
 *
 * These checks are about WIRING, not logic. The behaviour of the journal is
 * covered in hive-journal.test.ts with a fake pool and mutations. What can
 * silently disappear is the CALL: a `void record(...)` line is easy to delete
 * during a refactor, nothing breaks, no test goes red, and the feed simply gets
 * quieter. Quiet then means both "all is well" and "we stopped looking".
 *
 * WHY CHOKEPOINTS AND NOT SITES
 *
 * Each expectation below names a place through which a whole CLASS of events
 * must pass:
 *
 *   spendTokens / refundTokens -- every paid agent tool, present and future;
 *   creditStarsPayment         -- both crediting routes;
 *   POST /api/feed/publish     -- both the Mini App button and the agent tool.
 *
 * Checking the five generation tools separately would pass while the sixth,
 * added tomorrow, silently stayed out of the feed.
 */

const read = (p: string) =>
  fs
    .readFileSync(path.join(__dirname, p), 'utf8')
    // Comments are stripped: otherwise a sentence ABOUT an emission would
    // satisfy a check for the emission itself. That exact mistake was caught
    // five times in one shift on this project.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/** The body of a named function, bounded by the next top-level declaration. */
function functionBody(src: string, signature: string): string {
  const start = src.indexOf(signature)
  expect(start, `not found: ${signature}`).toBeGreaterThan(-1)
  const after = src.slice(start + signature.length)
  // The end is the next top-level `function`/`export`/`const` at column zero --
  // a fixed-size window would silently reach into a neighbour and find a match
  // that belongs to somebody else.
  const end = after.search(/\n(?:export |async function |function |const )/)
  const body = end === -1 ? after : after.slice(0, end)
  expect(body.length, `empty body: ${signature}`).toBeGreaterThan(50)
  return body
}

describe('the journal has writers at every chokepoint', () => {
  const tools = read('src/agent/tools.ts')
  const stars = read('src/stars-credit.ts')
  const routes = read('session-routes.ts')
  const server = read('render-server.ts')

  it('token spend emits -- this covers every paid agent tool at once', () => {
    const body = functionBody(tools, 'async function spendTokens(')
    expect(body).toMatch(/record\(\s*ctx\.pool/)
    expect(body).toMatch(/'tokens-spent'/)
  })

  it('a refund emits, and a FAILED refund is an alarm', () => {
    const body = functionBody(tools, 'async function refundTokens(')
    expect(body).toMatch(/'tokens-refunded'/)
    // A refund that did not go through leaves the person charged for nothing.
    // It is the one permanent discrepancy in the file, so it is an alarm.
    expect(body).toMatch(/'failure'/)
    expect(body).toMatch(/'alarm'/)
  })

  it('crediting stars emits -- one place for both crediting routes', () => {
    expect(stars).toMatch(/record\(\s*pool/)
    expect(stars).toMatch(/'payment'/)
  })

  it('sign-in, code claimed and code refused all emit', () => {
    expect(routes).toMatch(/'sign-in'/)
    expect(routes).toMatch(/'code-claimed'/)
    expect(routes).toMatch(/'code-refused'/)
  })

  it('publishing emits -- the single door into public', () => {
    expect(server).toMatch(/'published'/)
    expect(server).toMatch(/record\(getPool\(\)/)
  })
})

describe('emission cannot break the thing it observes', () => {
  const tools = read('src/agent/tools.ts')
  const stars = read('src/stars-credit.ts')
  const routes = read('session-routes.ts')
  const server = read('render-server.ts')

  /*
   * EVERY call is `void record(...)`, never `await`.
   *
   * The journal is observation, not part of the deed. An awaited write puts a
   * payment, a publish or a sign-in behind the availability of a table that
   * exists purely to watch them -- so a slow journal would become a slow
   * checkout, and a broken journal a broken sign-in.
   *
   * `record` itself never throws, which makes this a belt-and-braces rule; the
   * point is that it must stay true the day somebody changes `record`.
   */
  it('nothing awaits the journal', () => {
    for (const [name, src] of [
      ['tools.ts', tools],
      ['stars-credit.ts', stars],
      ['session-routes.ts', routes],
      ['render-server.ts', server],
    ] as const) {
      expect(src, `${name} awaits the journal`).not.toMatch(/await record\(/)
    }
  })

  it('the spend is recorded AFTER the balance actually moved', () => {
    /*
     * Order matters and is not cosmetic. Recording before the UPDATE would put
     * a spend in the feed for a person who was refused for insufficient
     * balance -- money in the report that never left a wallet.
     */
    const body = functionBody(tools, 'async function spendTokens(')
    const refusal = body.indexOf('if (r.rows.length === 0)')
    const emission = body.search(/record\(\s*ctx\.pool/)
    expect(refusal).toBeGreaterThan(-1)
    expect(emission).toBeGreaterThan(refusal)
  })
})
