import { afterEach, describe, expect, it } from 'vitest'
import {
  beginOwnerRun,
  endOwnerRun,
  forgetOwnerRunsForTests,
  stopOwnerRun,
} from '@/services/ownerRuns'

/*
 * THE TURN A CLOCK STARTED IS THE ONE HE MOST WANTS TO END.
 *
 * The Stop shipped reaching only turns the owner started from a button,
 * because the registry lived inside that handler's closure. The unattended
 * sweep runs in the SAME process -- it was unreachable for no reason other
 * than where the map was declared.
 */
const OWNER = '900000091'

afterEach(() => forgetOwnerRunsForTests())

describe('one running turn per owner', () => {
  it('a press can end a turn somebody else started', () => {
    // The cron registers; the button stops. That is the whole point.
    const fromCron = beginOwnerRun(OWNER)
    expect(fromCron.signal.aborted).toBe(false)
    expect(stopOwnerRun(OWNER)).toBe(true)
    expect(fromCron.signal.aborted).toBe(true)
  })

  it('says plainly when there is nothing to stop', () => {
    // A button that sometimes answers and sometimes does not is pressed twice.
    expect(stopOwnerRun(OWNER)).toBe(false)
  })

  it('stops only that owner turn', () => {
    const mine = beginOwnerRun(OWNER)
    const other = beginOwnerRun('900000052')
    stopOwnerRun(OWNER)
    expect(mine.signal.aborted).toBe(true)
    expect(other.signal.aborted, 'stopped somebody else work').toBe(false)
  })

  it('a second turn for one owner ends the abandoned first', () => {
    /*
     * It should not happen -- his button turns are serialised and the sweep
     * keeps its own latch -- and if it does, the older one is the one nobody
     * is waiting for.
     */
    const first = beginOwnerRun(OWNER)
    const second = beginOwnerRun(OWNER)
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
  })

  it('ending a finished turn never drops a newer one', () => {
    const first = beginOwnerRun(OWNER)
    const second = beginOwnerRun(OWNER)
    endOwnerRun(OWNER, first)
    // The newer turn is still registered, so a press still reaches it.
    expect(stopOwnerRun(OWNER)).toBe(true)
    expect(second.signal.aborted).toBe(true)
  })

  it('an empty owner is not a key', () => {
    const c = beginOwnerRun('')
    expect(c.signal.aborted).toBe(false)
    expect(stopOwnerRun('')).toBe(false)
  })
})

describe('a stop is not a failure', () => {
  it('the cron sweep registers its own turn', async () => {
    /*
     * A source read: the tick reaches the agent, the render and Telegram, and
     * the promise worth pinning is narrow -- the unattended sweep puts its
     * controller where the button can find it, and takes it out afterwards.
     */
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '../../services/crmProactive.ts'),
      'utf8'
    )
    expect(src).toContain("await import('./ownerRuns')")
    expect(src).toContain('beginOwnerRun(owner)')
    expect(src).toContain('endOwnerRun(owner, stopper)')
    expect(src).toContain('signal: stopper.signal')
  })

  it('a stopped sweep is its own outcome, not a fault', async () => {
    /*
     * Without its own state a stop arrives as `failed`: it pages the owner
     * about something he just did, and it counts against the failure figure
     * that exists to show when the seller is broken.
     */
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '../../services/crmProactive.ts'),
      'utf8'
    )
    expect(src).toContain("did: 'stopped'")
    const at = src.indexOf('if (wasStoppedByOwner(raw))')
    expect(at, 'the catch no longer tells a stop apart').toBeGreaterThan(-1)
    // Asked BEFORE anything decides this was a transport death.
    expect(at).toBeLessThan(src.indexOf('const dead = isTransportDeath(e)', at))
  })
})
