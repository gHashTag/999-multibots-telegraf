/**
 * THE PRICE IS ASKED BEFORE THE PHONE STEP.
 *
 * Owner's screenshot, 2026-09-10 12:31, a stranger's iPhone: the club step
 * spun on "Asking the server for the price..." with a disabled "Join for 0
 * Stars" button. The request was gated on `connected === true`, but connect
 * is two steps AFTER club on the road (welcomeSteps.ts). No new person could
 * see a price, so no new person could pay -- and nothing reported it.
 */
import { describe, expect, it } from 'vitest'
import { shouldAskClubPrice } from './profileGate'
import { WELCOME_STEPS } from './welcomeSteps'

describe('the club price is asked before the phone step', () => {
  it('club comes before connect on the road', () => {
    expect(WELCOME_STEPS.indexOf('club')).toBeLessThan(
      WELCOME_STEPS.indexOf('connect')
    )
  })

  it('a not-yet-connected own profile still asks the price', () => {
    expect(shouldAskClubPrice({ own: true, club: null, clubError: null })).toBe(
      true
    )
  })

  it('asks once: not again when the status is known', () => {
    expect(
      shouldAskClubPrice({ own: true, club: { active: false }, clubError: null })
    ).toBe(false)
  })

  it('does not loop on a failed request; the screen offers a retry instead', () => {
    expect(
      shouldAskClubPrice({ own: true, club: null, clubError: 'HTTP 500' })
    ).toBe(false)
  })

  it("never asks for somebody else's profile", () => {
    expect(shouldAskClubPrice({ own: false, club: null, clubError: null })).toBe(
      false
    )
  })
})
