/**
 * The welcome gift spends the OWNER's money on every new registration
 * (is_welcome_gift skips the user's balance). This breaker bounds a burst so a
 * wasCreated-misfire loop or a flood cannot run unbounded within one uptime
 * window. These tests pin the two properties that make it a breaker at all:
 * it denies once the ceiling is reached, and it resets when the day rolls over.
 *
 * Scope note (kept honest on purpose): this is a PER-PROCESS breaker, not a
 * shared daily budget — a precise budget needs a durable DB counter, which is
 * owner-blocked. See welcomeGiftBudget.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  reserveWelcomeGiftSlot,
  __resetWelcomeGiftBudgetForTest,
} from '@/inngest_app/functions/welcomeGiftBudget'

describe('welcome-gift burst breaker', () => {
  beforeEach(() => {
    __resetWelcomeGiftBudgetForTest()
  })

  it('grants exactly LIMIT slots in a day, then denies', () => {
    const day = new Date('2026-08-29T10:00:00.000Z')

    const first = reserveWelcomeGiftSlot(day)
    expect(first.granted).toBe(true)
    const limit = first.limit
    expect(limit).toBeGreaterThan(0)

    // We already consumed slot #1 above; consume the rest of the ceiling.
    let lastGranted = first
    for (let i = 1; i < limit; i++) {
      lastGranted = reserveWelcomeGiftSlot(day)
      expect(lastGranted.granted).toBe(true)
    }
    expect(lastGranted.used).toBe(limit)

    // The next reservation on the same day is over the ceiling → denied.
    const overflow = reserveWelcomeGiftSlot(day)
    expect(overflow.granted).toBe(false)
    expect(overflow.used).toBe(limit)
  })

  it('resets the counter when the calendar day changes', () => {
    const day1 = new Date('2026-08-29T23:59:00.000Z')
    const day2 = new Date('2026-08-30T00:01:00.000Z')

    const first = reserveWelcomeGiftSlot(day1)
    const limit = first.limit

    // Exhaust day 1.
    for (let i = 1; i < limit; i++) reserveWelcomeGiftSlot(day1)
    expect(reserveWelcomeGiftSlot(day1).granted).toBe(false)

    // A new day resets the tally: the first reservation is granted again.
    const nextDay = reserveWelcomeGiftSlot(day2)
    expect(nextDay.granted).toBe(true)
    expect(nextDay.used).toBe(1)
  })

  it('does not deny an organic new user (a single reservation is always granted)', () => {
    const now = new Date('2026-08-29T12:00:00.000Z')
    const slot = reserveWelcomeGiftSlot(now)
    expect(slot.granted).toBe(true)
    expect(slot.used).toBe(1)
  })
})
