import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { simulateSubscriptionForDev } from '@/scenes/menuScene/helpers/simulateSubscription'
import { SubscriptionType } from '@/interfaces/subscription.interface'

vi.mock('@/utils', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

/**
 * simulateSubscriptionForDev REPLACES a user's subscription tier with whatever
 * DEV_SIMULATE_SUBSCRIPTION names -- NEUROPHOTO, NEUROVIDEO, NEUROTESTER or
 * STARS. A user with no subscription at all can come out of it holding a paid
 * tier. One boolean decides whether that happens: isDev.
 *
 * There are TWO isDev in this repo and they disagree:
 *
 *   src/config/index.ts   NODE_ENV === 'development' || FORCE_DEV_MODE
 *   src/helpers/index.ts  NODE_ENV === 'development'
 *
 * Sixteen modules import the first. menuScene -- the only caller of the
 * simulation -- imports the second, so FORCE_DEV_MODE alone cannot switch the
 * simulation on. That is what keeps this safe today, and it is an ACCIDENT of
 * which barrel the import happened to name, not a decision anyone recorded.
 *
 * The danger is the obvious cleanup. A duplicate-name census lists isDev as a
 * twin and invites someone to unify it; pointing menuScene at @/config would
 * be the natural fix and would mean FORCE_DEV_MODE=true on a live server hands
 * every user the tier named in DEV_SIMULATE_SUBSCRIPTION.
 *
 * So this file pins the property that actually holds the harm back -- the
 * import menuScene uses, and the absence of FORCE_DEV_MODE from the definition
 * it lands on -- rather than the behaviour, which is already correct.
 *
 * NOT established: whether FORCE_DEV_MODE is set in production. The deployment
 * environment was not reachable from here, so this is written as a latent
 * bypass, not a live one.
 */

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

describe('the dev subscription simulation', () => {
  const saved = process.env.DEV_SIMULATE_SUBSCRIPTION

  beforeEach(() => {
    process.env.DEV_SIMULATE_SUBSCRIPTION = 'NEUROVIDEO'
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.DEV_SIMULATE_SUBSCRIPTION
    else process.env.DEV_SIMULATE_SUBSCRIPTION = saved
  })

  it('grants a paid tier to a user who has none, when isDev is true', () => {
    // Not a bug -- the point of the helper. Stated here so the gate below is
    // read as guarding something real: this is what escapes if isDev flips.
    const granted = simulateSubscriptionForDev(null, true)
    expect(granted).toBe('NEUROVIDEO' as SubscriptionType)
  })

  it('returns the real subscription when isDev is false', () => {
    expect(simulateSubscriptionForDev(null, false)).toBeNull()
    expect(simulateSubscriptionForDev('STARS' as SubscriptionType, false)).toBe(
      'STARS'
    )
  })

  it('is reached from exactly one place, so the gate has one owner', () => {
    // Control for the pin below. If a second caller appeared, checking
    // menuScene's import alone would stop covering the population.
    const callers: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), {
        withFileTypes: true,
      })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) {
          if (e.name !== 'node_modules' && e.name !== '__tests__') walk(rel)
        } else if (
          e.name.endsWith('.ts') &&
          !rel.includes('simulateSubscription')
        ) {
          if (matchCode(read(rel), /\bsimulateSubscriptionForDev\s*\(/g).length)
            callers.push(rel)
        }
      }
    }
    walk('src')
    expect(callers).toEqual(['src/scenes/menuScene/index.ts'])
  })

  it('takes its isDev from @/helpers, which ignores FORCE_DEV_MODE', () => {
    // The actual guard. Switching this import to @/config would make
    // FORCE_DEV_MODE sufficient to turn the simulation on.
    const menu = read('src/scenes/menuScene/index.ts')
    const imports = matchCode(
      menu,
      /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
    ) as RegExpMatchArray[]
    const isDevFrom = imports
      .filter(m =>
        m[1]
          .split(',')
          .map(x =>
            x
              .trim()
              .split(/\s+as\s+/)[0]
              .trim()
          )
          .includes('isDev')
      )
      .map(m => m[2])
    expect(isDevFrom, 'menuScene must import isDev exactly once').toEqual([
      '@/helpers',
    ])
  })

  it('keeps the two isDev definitions on the sides they are on', () => {
    // Pinned in BOTH directions. The helpers one must stay narrow, and the
    // config one must keep its FORCE_DEV_MODE clause -- otherwise this file
    // would pass by the definitions merging, which is the outcome it exists
    // to prevent.
    const helpers = matchCode(
      read('src/helpers/index.ts'),
      /export\s+const\s+isDev\s*=\s*([^\n]+)/g
    ) as RegExpMatchArray[]
    expect(helpers.length, 'helpers must define isDev').toBe(1)
    expect(helpers[0][1]).not.toContain('forceDevMode')
    expect(helpers[0][1]).not.toContain('FORCE_DEV_MODE')

    const config = matchCode(
      read('src/config/index.ts'),
      /export\s+const\s+isDev\s*=\s*([^\n]+)/g
    ) as RegExpMatchArray[]
    expect(config.length, 'config must define isDev').toBe(1)
    expect(config[0][1]).toContain('forceDevMode')
  })
})
