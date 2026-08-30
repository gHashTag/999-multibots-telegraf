/**
 * generateNeuroPhotoDirect had a module-scope `idemCache = new Map()` on the hot
 * paid neuroPhoto path that was .set() on every generation (key includes the
 * freeform user prompt, so distinct prompts mint distinct keys) and NEVER pruned
 * -- no .delete, no size cap, only a read-time TTL check that left stale entries.
 * Worse, both consumer return paths were commented out, so the map was pure
 * accumulating dead weight -> unbounded RSS growth in the single-process
 * in-memory session deployment (OOM class). The real idempotency guard is the DB
 * `idempotency_keys` table, which is untouched. Fix: remove the dead cache.
 *
 * Ratchet: any module-scope `new Map` in this hot file that is written (.set)
 * must also be evicted (.delete / .clear), else it can grow unbounded. A
 * re-introduced unpruned cache fails this test.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'services',
  'generateNeuroPhotoDirect.ts'
)
const code = () => fs.readFileSync(SRC, 'utf8')

describe('generateNeuroPhotoDirect has no unbounded module-scope Map', () => {
  it('the dead idemCache is gone', () => {
    expect(
      /idemCache/.test(code()),
      'idemCache reintroduced -- an unbounded, never-read module-scope Map'
    ).toBe(false)
  })

  it('any module-scope Map that is set is also evicted', () => {
    const s = code()
    // module-scope declarations: `const NAME = new Map` at column 0
    const decls = [
      ...s.matchAll(/^(?:const|let)\s+(\w+)\s*=\s*new Map[<(]/gm),
    ].map(m => m[1])
    const offenders = decls.filter(name => {
      const set = new RegExp(`\\b${name}\\.set\\(`).test(s)
      const evict = new RegExp(`\\b${name}\\.(delete|clear)\\(`).test(s)
      return set && !evict
    })
    expect(
      offenders,
      `module-scope Map(s) written but never evicted (unbounded): ${offenders.join(', ')}`
    ).toEqual([])
  })
})
