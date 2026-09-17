import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  rememberCard,
  takeCardDraft,
  peekCardLead,
} from '@/services/telegramProposals'

/**
 * THE MEMO WAS SHORTER THAN THE CARD IT DESCRIBES.
 *
 * A card stays pressable for twelve hours, and the owner presses it whenever
 * he next picks up the phone -- that IS the design. The memo that remembers
 * who the card was for expired in fifteen minutes, so for every realistic
 * press it was already gone: the follow-up lost the person's buttons, and
 * "write it shorter" had nothing to be shorter than.
 *
 * Found by putting every deadline in the project into one sorted column
 * (`tri deadlines`) and looking for a guard shorter than the thing it guards.
 */
describe('the card memo lives as long as the card', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const card = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    lead: '900000042',
    target: '900000042',
    what: 'привет, вот подарок',
    ...over,
  })

  it('a press hours later still knows the person and the words', () => {
    vi.useFakeTimers()
    const t0 = new Date('2026-09-16T10:00:00Z').getTime()
    vi.setSystemTime(new Date(t0))
    rememberCard(card({ expiresAt: t0 + 12 * 60 * 60_000 }))

    // Long past the old fifteen-minute window, and long before the card dies.
    vi.setSystemTime(new Date(t0 + 8 * 60 * 60_000))
    expect(
      peekCardLead('c1'),
      'карточку ещё можно нажать, а память о ней уже стёрта'
    ).toBe('900000042')
    const kept = takeCardDraft('c1')
    expect(kept?.lead).toBe('900000042')
    expect(kept?.what).toContain('подарок')
  })

  it('past the instant the card named, the memo is gone too', () => {
    vi.useFakeTimers()
    const t0 = new Date('2026-09-16T10:00:00Z').getTime()
    vi.setSystemTime(new Date(t0))
    const dies = t0 + 12 * 60 * 60_000
    rememberCard(card({ id: 'c2', expiresAt: dies }))

    vi.setSystemTime(new Date(dies + 1))
    expect(
      takeCardDraft('c2'),
      'память пережила карточку — это ответ про кнопку, которой уже нет'
    ).toBeNull()
  })

  /*
   * A CARD THAT NAMES NO INSTANT KEEPS THE OLD WINDOW.
   *
   * The instant arrives over the wire from the render. An older render sends
   * none, and stretching the memo to twelve hours on a number nobody reported
   * would be a guess -- the same guess this whole cycle exists to remove.
   */
  it('without the instant, the fifteen minutes still apply', () => {
    vi.useFakeTimers()
    const t0 = new Date('2026-09-16T10:00:00Z').getTime()
    vi.setSystemTime(new Date(t0))
    rememberCard(card({ id: 'c3' }))

    vi.setSystemTime(new Date(t0 + 14 * 60_000))
    expect(peekCardLead('c3'), 'старое окно закрылось раньше времени').toBe(
      '900000042'
    )
    vi.setSystemTime(new Date(t0 + 16 * 60_000))
    expect(takeCardDraft('c3'), 'старое окно не закрылось вовсе').toBeNull()
  })

  it('an instant already in the past is not trusted over the window', () => {
    vi.useFakeTimers()
    const t0 = new Date('2026-09-16T10:00:00Z').getTime()
    vi.setSystemTime(new Date(t0))
    // A clock skew, or a card restored from a table. Shortening the memo to
    // zero on it would lose the person for a card that is still on screen.
    rememberCard(card({ id: 'c4', expiresAt: t0 - 60_000 }))
    vi.setSystemTime(new Date(t0 + 60_000))
    expect(peekCardLead('c4')).toBe('900000042')
  })
})
