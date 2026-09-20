/**
 * ROUBLES ARE OFFERED ONLY TO SOMEBODY WHO CAN PAY IN THEM.
 *
 * Owner, 2026-09-20: show the rouble cashier only to people whose language is
 * Russian. Robokassa's page is in Russian and wants a Russian card, so the
 * button was a door onto a wall for everybody else -- and a paywall's every
 * extra button is somewhere to hesitate.
 *
 * What is pinned here is the AND: the person's language and the bot's ability,
 * with the bot's refusal winning. A single condition would look right in the
 * common case and be wrong in exactly the two that matter -- an English
 * speaker on a rouble-selling bot, and a Russian speaker on the bot that
 * sells no roubles at all.
 */
import { describe, it, expect, vi } from 'vitest'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'

vi.mock('@/utils/logger', () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    error: () => undefined,
  },
}))

/**
 * A context shaped like the real one: the language lives in `ctx.state`, put
 * there by the middleware, and `language_code` is only the fallback.
 */
function person(
  over: {
    language?: 'ru' | 'en'
    telegramLanguage?: string
    bot?: string
  } = {}
) {
  return {
    from: { id: 900000141, language_code: over.telegramLanguage ?? 'en' },
    state: over.language ? { userLanguage: over.language } : {},
    botInfo:
      over.bot === undefined
        ? { username: 'neuro_blogger_bot' }
        : over.bot
          ? { username: over.bot }
          : undefined,
    scene: { current: undefined },
  } as never
}

describe('who is offered roubles', () => {
  it('offers them to a Russian-speaking person on a rouble bot', () => {
    expect(shouldShowRubles(person({ language: 'ru' }))).toBe(true)
  })

  /*
   * THE CASE THIS WAS ASKED FOR. The button existed for everybody and could be
   * used by almost nobody outside the Russian-speaking world.
   */
  it('does not offer them to an English-speaking person', () => {
    expect(shouldShowRubles(person({ language: 'en' }))).toBe(false)
  })

  /*
   * The stored choice wins over Telegram's guess: somebody who switched the
   * bot to Russian is offered roubles even if their phone says otherwise, and
   * somebody who switched to English stops being offered them.
   */
  it('believes the language the person chose, not the phone', () => {
    expect(
      shouldShowRubles(person({ language: 'ru', telegramLanguage: 'de' }))
    ).toBe(true)
    expect(
      shouldShowRubles(person({ language: 'en', telegramLanguage: 'ru' }))
    ).toBe(false)
  })

  it('falls back to the phone when nothing was chosen yet', () => {
    expect(shouldShowRubles(person({ telegramLanguage: 'ru' }))).toBe(true)
    expect(shouldShowRubles(person({ telegramLanguage: 'fr' }))).toBe(false)
  })

  /*
   * THE BOT'S REFUSAL WINS. One bot of the farm sells no roubles at all; a
   * Russian speaker there must still not see a cashier that cannot take money.
   */
  it('never offers them on the bot that sells none', () => {
    expect(
      shouldShowRubles(
        person({ language: 'ru', bot: 'NeurostylistShtogrina_bot' })
      )
    ).toBe(false)
  })

  /*
   * A CONTEXT WITHOUT A BOT IS A BROKEN CONTEXT, NOT A SALE. It used to
   * default to showing roubles "so as not to break other bots"; with the
   * language rule that default would show a rouble cashier to an English
   * speaker exactly when we know least about them.
   */
  it('judges by the person when the bot is unknown', () => {
    expect(shouldShowRubles(person({ language: 'ru', bot: '' }))).toBe(true)
    expect(shouldShowRubles(person({ language: 'en', bot: '' }))).toBe(false)
  })
})
