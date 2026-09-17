/**
 * THE PAYMENT METHOD A PERSON ALREADY CHOSE IS NOT THROWN AWAY.
 *
 * The mini app's paywall asks for a plan AND a way to pay, and sends both in
 * the start parameter. Yesterday the bot learned to read the plan; the method
 * was still dropped, so somebody who pressed "card" was shown whatever the bot
 * shows by default and had to choose again.
 *
 * The direction of the rule is the whole safety of it, so the direction is what
 * is pinned here.
 */
import { describe, it, expect } from 'vitest'
import { payMethodOf, showRublesTo } from '@/helpers/railsForThisPerson'

describe('reading the method out of a paywall link', () => {
  it('accepts exactly the three the paywall can send', () => {
    expect(payMethodOf('robokassa')).toBe('robokassa')
    expect(payMethodOf('stars')).toBe('stars')
    expect(payMethodOf('ton')).toBe('ton')
  })

  it('is forgiving about case and spacing, because a link can be typed', () => {
    expect(payMethodOf(' Robokassa ')).toBe('robokassa')
    expect(payMethodOf('STARS')).toBe('stars')
  })

  /*
   * A start payload is attacker-typed text. Anything unrecognised must mean
   * "no choice was made", never a half-understood one.
   */
  it('calls anything else no choice at all', () => {
    for (const junk of [
      '',
      '   ',
      null,
      undefined,
      'card',
      'robokassa2',
      'sber',
      'stars;drop table',
    ]) {
      expect(payMethodOf(junk), `accepted ${String(junk)}`).toBeNull()
    }
  })
})

describe('whose decision wins', () => {
  /*
   * THE BOT'S ANSWER IS A CEILING, NOT A DEFAULT.
   *
   * `shouldShowRubles` is false for bots that must not offer roubles at all.
   * If a person's choice could turn that back on, a start parameter anybody can
   * type would re-enable a payment rail somebody deliberately closed.
   */
  it('never shows roubles the bot has closed, whatever was asked for', () => {
    for (const asked of ['robokassa', 'stars', 'ton', 'nonsense', null]) {
      expect(showRublesTo(false, asked), `opened by ${String(asked)}`).toBe(
        false
      )
    }
  })

  it('shows roubles when the bot allows them and nothing was chosen', () => {
    expect(showRublesTo(true, null)).toBe(true)
    expect(showRublesTo(true, undefined)).toBe(true)
    expect(showRublesTo(true, 'nonsense')).toBe(true)
  })

  it('keeps roubles for somebody who asked to pay by card', () => {
    expect(showRublesTo(true, 'robokassa')).toBe(true)
  })

  /*
   * Narrowing is the other half: a person who said "Stars" should not be shown
   * rouble buttons and made to say it twice.
   */
  it('hides roubles from somebody who asked for Stars or TON', () => {
    expect(showRublesTo(true, 'stars')).toBe(false)
    expect(showRublesTo(true, 'ton')).toBe(false)
  })
})
