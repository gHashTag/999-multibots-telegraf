import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { enclosedBy } = require('../../../scripts/lib/enclosing-statement.cjs')

// The async-lipsync fallback poller runs on a 30s setInterval. A provider status
// check can hang longer than that, so without a re-entrancy guard a second tick
// starts while the first is still awaiting, and both can handle the same
// terminal state (double delivery). The interval callback must skip while a tick
// is in flight. Guard source-level (repo style, like mountOrder/protected-routes).
const SRC = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    'core',
    'lipsync',
    'async-lipsync-manager.ts'
  ),
  'utf8'
)

describe('async-lipsync fallback poller is re-entrancy guarded', () => {
  it('the polling setInterval exists (matcher not stale)', () => {
    expect(SRC).toMatch(/pollingInterval = setInterval\(/)
  })

  it('the interval callback skips while a tick is in flight (checkInFlight)', () => {
    // the setInterval callback: bail early on checkInFlight, then set it, then run the tick
    const guarded =
      /pollingInterval = setInterval\(\(\) => \{[\s\S]{0,160}if \(checkInFlight\) return[\s\S]{0,80}checkInFlight = true/.test(
        SRC
      )
    expect(
      guarded,
      'polling interval must guard against overlapping ticks via checkInFlight'
    ).toBe(true)
  })

  it('checkInFlight is reset after the tick settles (finally)', () => {
    expect(
      enclosedBy(SRC, 'checkInFlight = false', /pollTick\(\)\.finally\(/),
      'the flag must be reset in the tick finally, not somewhere after it'
    ).toBe(true)
  })
})
