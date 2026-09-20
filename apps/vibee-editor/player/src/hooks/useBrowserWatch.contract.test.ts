import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A SOURCE CONTRACT, AND IT IS CALLED THAT ON PURPOSE.
 *
 * Every rule about when to follow an agent lives in `lib/browserWatch.ts`
 * and is tested there properly. What no test could see is the three lines of
 * wiring in the hook, because this app has no React render library in its
 * dependencies (`src/test/setup.ts` says so deliberately) -- and a mutation
 * that simply deleted the `navigate` call survived every other test in the
 * file.
 *
 * So this reads the hook's source. It is weaker than a behavioural test and
 * it is written down as such; it exists because the alternative measured here
 * was no test at all.
 */
const hook = readFileSync(join(__dirname, 'useBrowserWatch.ts'), 'utf8')

describe('the wiring actually moves the screen', () => {
  it('navigates to the browser route', () => {
    expect(hook).toMatch(/navigate\(BROWSER_ROUTE\)/)
  })

  it('asks the tested rule instead of deciding for itself', () => {
    expect(hook).toContain('shouldFollow({')
    /* The call is multi-line after formatting; check its parts. */
    expect(hook).toContain('shouldPoll({')
    expect(hook).toContain('hidden: document.hidden')
    expect(hook).toContain('embedded: IS_EMBED')
    expect(hook).toContain('unavailable: unavailable.current')
    expect(hook).toContain('signedOut: signedOut.current')
    /* No second copy of the rules hiding in the effect. */
    expect(hook).not.toMatch(/state === 'live'/)
    expect(hook).not.toMatch(/startsWith\('\/browser'\)/)
  })

  it('remembers the session BEFORE navigating, or it would loop', () => {
    const follow = hook.indexOf('followed.current = view.sessionId')
    const jump = hook.indexOf('navigate(BROWSER_ROUTE)')
    expect(follow).toBeGreaterThan(-1)
    expect(jump).toBeGreaterThan(follow)
  })

  it('stays quiet when the person is signed out or offline', () => {
    expect(hook).toMatch(/catch\s*{/)
  })

  it('stops its timer when the screen goes away', () => {
    expect(hook).toContain('clearInterval(timer)')
    expect(hook).toContain('stopped = true')
  })
})

describe('it gives up where pods cannot run', () => {
  it('latches "unavailable" instead of asking forever', () => {
    /*
     * Railway answers 503 by design. Without the latch this is one request
     * per person every ten seconds, forever, for a feature that cannot work
     * there -- found before shipping, not after.
     */
    expect(hook).toContain("view.state === 'unavailable'")
    expect(hook).toContain('unavailable.current = true')
  })
})
