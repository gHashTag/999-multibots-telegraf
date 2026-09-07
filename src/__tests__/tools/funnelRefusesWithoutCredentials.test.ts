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
  it('carries a guard against reading the row ceiling as a count', () => {
    const source = fs.readFileSync(SCRIPT, 'utf8')
    expect(source).toContain('=== 1000')
    expect(source).toMatch(/Refusing to print a funnel/)
  })

  it('counts with head:true rather than by reading rows', () => {
    const source = fs.readFileSync(SCRIPT, 'utf8')
    expect(source).toContain("count: 'exact', head: true")
    // Where a distinct count genuinely needs rows, it must page.
    expect(source).toContain('distinctPaged')
    expect(source).toContain('LOWER BOUND')
  })
})
