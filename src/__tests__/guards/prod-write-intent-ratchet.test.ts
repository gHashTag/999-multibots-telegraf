import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

/**
 * A test file that writes to the LIVE database must ask for intent, not merely
 * for credentials.
 *
 * Five migrations under src/__tests__ insert into payments_v2 with a
 * service-role key fetched from Infisical at runtime. Until now the only guard
 * was `skipIf(!HAS_INFISICAL)`: whoever had credentials in their shell ran a
 * money migration by running the suite. They now also require
 * ALLOW_PROD_DATA_WRITES=1.
 *
 * This ratchet exists because the fix is invisible to a green suite: these
 * blocks skip either way, so nothing goes red if a sixth file appears with the
 * old guard, or if someone drops the flag from one of the five.
 */
const REPO = path.join(__dirname, '..', '..', '..')

function tracked(): string[] {
  return execFileSync('git', ['ls-files', '*.test.ts'], {
    cwd: REPO,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
}

/** Files that reach the real client AND write through it. */
function liveWriters(): string[] {
  return tracked().filter(f => {
    const p = path.join(REPO, f)
    let src: string
    try {
      src = fs.readFileSync(p, 'utf8')
    } catch {
      return false
    }
    if (!src.includes('core/supabase/client')) return false
    return /\.(insert|update|upsert|delete)\(/.test(src)
  })
}

describe('a test that writes to the live database must require intent', () => {
  /**
   * Without this the ratchet is worthless: a matcher that finds nothing agrees
   * with every possible state of the repository. It has to see the five it was
   * built for before its silence means anything.
   */
  it('the matcher still finds the files it was written for', () => {
    const found = liveWriters()
    expect(found.length).toBeGreaterThan(0)
    expect(found).toContain('src/__tests__/transfer-missing-xtr.test.ts')
  })

  /**
   * Read the GATE, not the file.
   *
   * The first version of this asserted that the file mentions
   * PROD_WRITES_ALLOWED anywhere. Mutation testing killed it: reverting the
   * skipIf condition to credentials-only leaves the now-unused import behind,
   * the mention survives, and the ratchet reported green over an ungated
   * migration. A guard has to look at the thing it guards.
   */
  function gateCondition(src: string): string | null {
    const open = src.indexOf('describe.skipIf(')
    if (open === -1) return null
    const start = open + 'describe.skipIf('.length
    const end = src.indexOf(')(', start)
    return end === -1 ? null : src.slice(start, end)
  }

  it('every live writer is gated on ALLOW_PROD_DATA_WRITES, not just on credentials', () => {
    const ungated = liveWriters().filter(f => {
      const cond = gateCondition(fs.readFileSync(path.join(REPO, f), 'utf8'))
      return cond === null || !cond.includes('PROD_WRITES_ALLOWED')
    })
    expect(ungated).toEqual([])
  })

  it('the flag means the one explicit value, so an idle variable cannot arm it', () => {
    const src = fs.readFileSync(
      path.join(REPO, 'src/__tests__/helpers/prodWriteGate.ts'),
      'utf8'
    )
    expect(src).toContain("=== '1'")
  })
})
