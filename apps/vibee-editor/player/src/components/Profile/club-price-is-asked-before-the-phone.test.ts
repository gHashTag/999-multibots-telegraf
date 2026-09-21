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
      shouldAskClubPrice({
        own: true,
        club: { active: false },
        clubError: null,
      })
    ).toBe(false)
  })

  it('does not loop on a failed request; the screen offers a retry instead', () => {
    expect(
      shouldAskClubPrice({ own: true, club: null, clubError: 'HTTP 500' })
    ).toBe(false)
  })

  it("never asks for somebody else's profile", () => {
    expect(
      shouldAskClubPrice({ own: false, club: null, clubError: null })
    ).toBe(false)
  })
})

/**
 * app.t27.ai/t27_dev, 2026-09-13 18:00: with a lapsed web session the step
 * showed the server's identity error and "Join for 0 Stars". The server now
 * answers the price anonymously; the screen, for its part, must never print
 * a zero price on the button. This is a source-level contract because the
 * component has no DOM test harness here.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('the join button never says 0 Stars', () => {
  const src = readFileSync(join(__dirname, 'WelcomeOnboarding.tsx'), 'utf8')
  it('is disabled while the price is unknown', () => {
    // A guest's button signs in (it has no price to be wrong about); for a
    // person the price must be positive before it can be pressed.
    expect(src).toContain(
      'disabled={busy || !status || (!anonymous && stars <= 0)}'
    )
  })
  it('asks a guest to sign in instead of offering a Join the server refuses', () => {
    expect(src).toContain('onClick={anonymous ? signIn : buy}')
    expect(src).toMatch(/anonymous \? \(\s*t\('welcome\.club\.signIn'\)/)
  })
  it('shows the join label only for a positive price', () => {
    expect(src).toMatch(/stars > 0 \? \(\s*t\('welcome\.club\.join'/)
  })
})

/**
 * A PERSON THE SERVER NO LONGER RECOGNISES IS NOT A PERSON WHO NEVER PAID.
 *
 * `/api/club/status` answers a visitor without identity with 200, the public
 * price and zeroes for everything personal. This screen read the zeroes as
 * fact, so `active: false` became the 10 000-star paywall -- the identical
 * screen a stranger sees. Two invited people met it with a lapsed session
 * and, having no way to tell the two apart, signed in again and again
 * (@SamHold, three times in forty minutes, 2026-09-21).
 *
 * So the anonymous answer gets its own card: say the sign-in lapsed, offer
 * the sign-in, and do not render a button that would take 10 000 Stars while
 * we do not know whose Stars they are.
 */
describe('the club step when the server does not know who is asking', () => {
  const src = readFileSync(join(__dirname, 'WelcomeOnboarding.tsx'), 'utf8')

  it('reads the anonymous flag rather than inferring from the zeroes', () => {
    expect(src).toContain('status?.anonymous === true')
  })

  it('offers a sign-in and returns before the paywall is built', () => {
    const guard = src.indexOf('if (unknownPerson)')
    const paywall = src.indexOf('data-testid="welcome-price"')
    expect(guard).toBeGreaterThan(-1)
    expect(paywall).toBeGreaterThan(guard)
    expect(src).toContain('<TelegramLoginButton')
    expect(src).toContain("t('welcome.club.signedOut')")
  })

  it('says it in both languages the app speaks', async () => {
    const { translations } = await import('@/atoms/language')
    for (const lang of ['en', 'ru'] as const) {
      expect(translations[lang]['welcome.club.signedOut']).toBeTruthy()
    }
  })
})
