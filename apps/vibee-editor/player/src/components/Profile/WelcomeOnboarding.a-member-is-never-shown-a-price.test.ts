/*
 * AN INVITED PERSON WAS SHOWN THE PRICE, AND PAID FOR A MONTH HE ALREADY HAD.
 *
 * Owner, 2026-09-22, kept in his own words: "504608015 почему юзер не может // cyrillic-ok: the owner's report, verbatim
 * зайти в бот? мы ему дали доступ!! почему так сложно!!??!" // cyrillic-ok: the owner's report, verbatim
 *
 * Measured the same day, in this order:
 *   - CLUB_GUESTS on vibee-render carries his id, and the live server answers
 *     `{active: true, paid: false, granted: "guest"}` for it;
 *   - 14:22:41 UTC he signed in through the Telegram login widget (hive_events
 *     #863), which is what the club card offers while the server does not know
 *     who is asking;
 *   - the widget reloaded the status, the card re-drew as the PRICE, and at
 *     14:23:28 a 10 000 star subscription invoice was minted in his name
 *     (hive_events #864). Telegram's own sheet then failed on it, and his
 *     screen said "Telegram не смог провести платёж".
 *
 * So he was a member throughout, and every screen he saw told him he was not.
 * `welcomeStart` decided where the road began before the sign-in and cannot
 * decide anything after it; nothing else watched the fact that changed.
 *
 * What is pinned here: the club step ends the moment the club is open, EXCEPT
 * when the admin badge opened it on purpose to reach the till.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clubStepIsOver } from './welcomeSteps'

const src = readFileSync(join(__dirname, 'WelcomeOnboarding.tsx'), 'utf8')

/**
 * The club card's own source. A missing anchor throws here rather than
 * handing the assertions below an empty (or whole-file) region to pass over.
 */
function clubCardSource(): string {
  const from = src.indexOf('function ClubStep')
  const to = src.indexOf('function SoulStep')
  if (from < 0 || to < 0 || to <= from) {
    throw new Error('ClubStep is no longer where this test looks for it')
  }
  return src.slice(from, to)
}

describe('clubStepIsOver', () => {
  it('ends the step for a guest the server has just recognised', () => {
    expect(clubStepIsOver({ active: true })).toBe(true)
  })

  it('ends it for a paying member too -- active is active', () => {
    expect(clubStepIsOver({ active: true }, false)).toBe(true)
  })

  it('keeps the step for somebody the club is closed to', () => {
    expect(clubStepIsOver({ active: false })).toBe(false)
  })

  it('keeps it while the answer has not arrived, and while it cannot be had', () => {
    // Null is "not asked yet", undefined is "asked, no answer". Neither is a
    // membership, and neither may close a step the person still has to take.
    expect(clubStepIsOver(null)).toBe(false)
    expect(clubStepIsOver(undefined)).toBe(false)
    expect(clubStepIsOver({})).toBe(false)
  })

  it('does not skip a step that was opened on purpose', () => {
    // The admin badge opens the till precisely because a free pass otherwise
    // hides it (owner, 2026-09-22). Skipping that is skipping the test itself.
    expect(clubStepIsOver({ active: true }, true)).toBe(false)
  })
})

describe('the club card obeys it', () => {
  it('leaves the step and draws nothing instead of the price', () => {
    const card = clubCardSource()
    expect(card).toMatch(/clubStepIsOver\(status, props\.deliberate\)/)
    expect(card).toMatch(/if \(over\) onJoined\(\)/)
    // The guard must sit ABOVE every return that draws a price, or the card
    // shows the paywall for the frame before the effect runs.
    const guard = card.indexOf('if (over) return null')
    const price = card.indexOf('data-testid="welcome-price"')
    expect(guard).toBeGreaterThan(-1)
    expect(price).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(price)
  })

  it('tells the card when the step was opened on purpose', () => {
    expect(src).toMatch(/deliberate=\{startAt === 'club'\}/)
  })
})
