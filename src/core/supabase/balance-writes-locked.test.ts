import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Every balance-write chokepoint stays wrapped in the per-user lock.
 *
 * The interim double-spend guard (#999, #1002) works only if the exported
 * spend functions actually go through withUserBalanceLock. A refactor that
 * inlines the *Unlocked implementation back into the export, or drops the
 * wrapper, would silently reopen the race with no type error. This pins both
 * known paths — updateUserBalance and directPaymentProcessor — and the shared
 * key, so a user's two spend paths serialize against each other.
 */

const dir = __dirname
const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8')

const CASES = [
  {
    file: 'updateUserBalance.ts',
    export: 'updateUserBalance',
    impl: 'updateUserBalanceUnlocked',
  },
  {
    file: 'directPayment.ts',
    export: 'directPaymentProcessor',
    impl: 'directPaymentProcessorUnlocked',
  },
]

describe('balance writes stay behind the per-user lock (#999)', () => {
  for (const c of CASES) {
    it(`${c.export} is wrapped in withUserBalanceLock`, () => {
      const src = read(c.file)
      // the real work lives in the *Unlocked implementation
      expect(src, `${c.file}: no ${c.impl}`).toContain(`${c.impl}`)
      // and the public export routes through the lock
      const exportIdx =
        src.indexOf(`export const ${c.export}`) >= 0
          ? src.indexOf(`export const ${c.export}`)
          : src.indexOf(`export function ${c.export}`)
      expect(exportIdx, `${c.file}: no export of ${c.export}`).toBeGreaterThan(
        -1
      )
      const after = src.slice(exportIdx, exportIdx + 400)
      expect(after, `${c.export} does not call withUserBalanceLock`).toContain(
        'withUserBalanceLock'
      )
      expect(after, `${c.export} does not call its Unlocked impl`).toContain(
        c.impl
      )
    })
  }

  it('both paths share one lock module (so they serialize against each other)', () => {
    for (const c of CASES) {
      expect(read(c.file)).toMatch(/from '\.\/balanceLock'/)
    }
  })
})
