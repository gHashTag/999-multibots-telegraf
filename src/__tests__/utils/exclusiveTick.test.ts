import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { exclusiveTick } from '@/utils/exclusiveTick'

vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

/**
 * setInterval does not wait. A callback slower than its interval is started
 * again alongside itself, and the notification queue is the shape where that
 * costs something real: it selects up to 50 unsent messages, sends them one at
 * a time with a pause between, and marks each sent AFTER the send returns. The
 * overlapping run re-selects whatever is not yet marked, and the user gets the
 * message twice.
 *
 * Skipping is the safe direction: a skipped tick sends nothing extra and the
 * next one picks the work up. Queuing the skipped ticks instead would preserve
 * the very overlap being removed, which is why the helper drops rather than
 * defers.
 */

const ROOT = path.resolve(__dirname, '../../..')

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(r => (resolve = r))
  return { promise, resolve }
}

describe('exclusiveTick', () => {
  it('skips a tick while the previous one is still running', async () => {
    const gate = deferred()
    let started = 0
    const tick = exclusiveTick('t', async () => {
      started++
      await gate.promise
    })

    const first = tick()
    await tick()
    await tick()
    expect(started, 'overlapping ticks must not start a second run').toBe(1)

    gate.resolve()
    await first
  })

  it('runs again once the previous one finished', async () => {
    let started = 0
    const tick = exclusiveTick('t', async () => {
      started++
    })
    await tick()
    await tick()
    expect(started).toBe(2)
  })

  it('releases the flag when the run throws', async () => {
    // Without the finally, one failure would leave inFlight true and the timer
    // would never run again -- a guard that turns a single error into
    // permanent silence.
    let started = 0
    const tick = exclusiveTick('t', async () => {
      started++
      throw new Error('boom')
    })
    await expect(tick()).resolves.toBeUndefined()
    await tick()
    expect(started).toBe(2)
  })

  it('does not let the rejection escape into the timer', async () => {
    // An async timer callback that rejects becomes an unhandled rejection.
    const tick = exclusiveTick('t', async () => {
      throw new Error('boom')
    })
    await expect(tick()).resolves.toBeUndefined()
  })

  it('is wired into every repeating timer in the notification handler', () => {
    // The behavioural tests above pass whether or not anything uses the helper.
    // Population, not line numbers: a third interval added later must also be
    // wrapped.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { matchCode } = require('../../../scripts/lib/blank-code.cjs')
    const src = fs.readFileSync(
      path.join(ROOT, 'src/handlers/notificationHandler.ts'),
      'utf8'
    )
    const intervals = matchCode(src, /setInterval\(([\s\S]{0,120}?),/g)
    expect(intervals.length).toBeGreaterThanOrEqual(2)
    for (const m of intervals) {
      expect(m[1]).toContain('exclusiveTick')
    }
  })
})
