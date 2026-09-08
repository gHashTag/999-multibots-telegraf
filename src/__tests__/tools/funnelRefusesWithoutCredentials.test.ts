import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * A ZERO FROM A QUERY THAT NEVER RAN.
 *
 * `scripts/funnel.cjs` answers the only question no other instrument here asks:
 * is anybody using this. It reached that question by way of two failures worth
 * guarding against, both of which produce a confident number that is false.
 *
 * The first: a log window six minutes wide reported "0 messages went
 * unanswered" while the denominator -- incoming updates in that same window --
 * was also zero. Nothing was measured, and it read like a clean result.
 *
 * The second: Supabase caps a read at 1000 rows. Counting distinct people by
 * reading rows turned 354 into 15, wrong by a factor of twenty-four, and the
 * number looked entirely plausible.
 *
 * So the script refuses rather than prints, in both directions.
 */
const SCRIPT = path.join(__dirname, '..', '..', '..', 'scripts', 'funnel.cjs')
const ROOT = path.join(__dirname, '..', '..', '..')

const run = (env: NodeJS.ProcessEnv) => {
  try {
    const out = execFileSync('node', [SCRIPT], {
      cwd: ROOT,
      encoding: 'utf8',
      env,
    })
    return { code: 0, out }
  } catch (e: any) {
    return {
      code: e.status ?? -1,
      out: String(e.stdout || '') + String(e.stderr || ''),
    }
  }
}

describe('the funnel refuses to print a number it did not measure', () => {
  it('exits 2 with no credentials, instead of printing zeros', () => {
    const bare = { ...process.env }
    delete bare.SUPABASE_URL
    delete bare.SUPABASE_SERVICE_ROLE_KEY
    delete bare.SUPABASE_SERVICE_KEY
    delete bare.SUPABASE_ANON_KEY
    const { code, out } = run(bare)
    expect(code, `output:\n${out}`).toBe(2)
    expect(out).toContain('NO CREDENTIALS')
    expect(out).not.toMatch(/registered people\s+0/)
  })

  /**
   * The row ceiling is the subtler one, so the guard is asserted to exist and
   * to name the number it watches for. A count that comes back at exactly the
   * ceiling is not a count.
   */
  /**
   * Guards the property, not the spelling. The first version asserted the
   * literal `=== 1000`; the guard was later given a name and a negative
   * direction, and the test went red for the improvement rather than for a
   * defect. What matters is that the ceiling is recognised AND that a
   * legitimate count is not -- a guard that only ever refuses cannot be told
   * from a script that never reports.
   */
  it('recognises the row ceiling and still accepts a legitimate count', () => {
    const source = fs.readFileSync(SCRIPT, 'utf8')
    expect(source).toMatch(/ROW_CEILING\s*=\s*1000/)
    expect(source).toMatch(/if \(!looksLikeCeiling\(ROW_CEILING\)\)/)
    expect(source).toMatch(/if \(looksLikeCeiling\(ROW_CEILING - 1\)\)/)
    expect(source).toMatch(/Refusing to print a funnel/)
  })

  /**
   * PAGING BY A NON-UNIQUE KEY IS A SAMPLE, NOT A READ.
   *
   * `.range()` asks for rows N..M of an order the server never promised. Order
   * by a column many rows share and the boundaries move: a cohort read of
   * `users` ordered by created_at -- where 1559 rows carry one second --
   * reported 1787 distinct people and 593 duplicate rows. The real figures are
   * 2345 and 35. Both wrong numbers were the reader, and both were nearly
   * published as findings about the data.
   *
   * So every table the script pages must declare a unique key, and the reader
   * must prove uniqueness on each run rather than trust the declaration.
   */
  it('pages every table by a declared key, and checks that key is unique', () => {
    const source = fs.readFileSync(SCRIPT, 'utf8')

    const block = /const PAGE_KEY = \{([\s\S]*?)\}/.exec(source)
    expect(block, 'the script must declare a paging key per table').toBeTruthy()
    const declared = new Map(
      [...(block as RegExpExecArray)[1].matchAll(/(\w+):\s*'([^']+)'/g)].map(
        m => [m[1], m[2]]
      )
    )
    expect(declared.size, 'no paging keys declared').toBeGreaterThan(0)

    // Every table read through the pager must be in that map, or the pager
    // refuses -- which is the branch this asserts exists.
    expect(source).toContain('no unique paging key known for')

    // Keys must look like identities, not timestamps. created_at is exactly the
    // choice that produced the wrong numbers above.
    for (const [table, key] of declared)
      expect(
        /_at$|date|time/i.test(key),
        `${table} is paged by ${key}, which is not an identity`
      ).toBe(false)

    // And the run-time proof: a repeated key means the pages overlapped.
    expect(source).toContain('distinct')
    expect(source).toContain('unstable order')
  })

  it('counts with head:true rather than by reading rows', () => {
    const source = fs.readFileSync(SCRIPT, 'utf8')
    expect(source).toContain("count: 'exact', head: true")
    // Where a distinct count genuinely needs rows, it must page.
    expect(source).toContain('distinctPaged')
    expect(source).toContain('LOWER BOUND')
  })
})
