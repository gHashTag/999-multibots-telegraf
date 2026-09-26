import { describe, expect, it } from 'vitest'
import { giftBriefFrom, greeting, nextStep } from '@/services/clubOnboarding'

/*
 * THE FIRST MINUTE OF A NEW MEMBER.
 *
 * Owner, 2026-09-24: start the onboarding, through the common group, and show
 * the usefulness rather than describe it.
 *
 * This file exists for a second reason too, and it is the self-critical one:
 * clubOnboarding.ts shipped with tests and NO CALLER -- dead code that a
 * green suite made look alive. The last test here is the one that would have
 * caught that.
 */
describe('what a new member is asked', () => {
  it('asks ONE thing, and promises a result rather than a tour', () => {
    const said = greeting('Пилот')
    expect(said).toContain('Пилот')
    expect(said).toContain('ОДНОЙ фразой')
    // The argument is the portrait, not a list of features.
    expect(said).toContain('портрет')
    // A form at the door is how a club gets members who never finish joining.
    expect(said.split('?').length - 1).toBeLessThanOrEqual(1)
  })

  it('greets somebody whose name Telegram did not give', () => {
    expect(greeting(null)).toContain('Добро пожаловать')
    expect(greeting('  ')).not.toContain('undefined')
  })
})

describe('what happens next, and in what order', () => {
  it('waits for their sentence before anything else', () => {
    expect(nextStep({ id: '900000051' })).toBe('greet')
    expect(nextStep({ id: '900000051', soul: '   ' })).toBe('greet')
  })

  it('gift first, then the plan: the gift buys the attention the plan needs', () => {
    expect(nextStep({ id: '900000051', soul: 'веду канал' })).toBe('gift')
    expect(
      nextStep({ id: '900000051', soul: 'веду канал', gifted: true })
    ).toBe('plan')
    expect(
      nextStep({
        id: '900000051',
        soul: 'веду канал',
        gifted: true,
        planned: true,
      })
    ).toBe('done')
  })

  it('never composes a portrait from what we guessed', () => {
    /*
     * A picture made from an assumption about a person, posted in front of
     * the room, is the one failure this flow cannot afford.
     */
    expect(giftBriefFrom(null)).toBeNull()
    expect(giftBriefFrom('да')).toBeNull()
    const brief = giftBriefFrom('преподаю математику, запускаю канал')
    expect(brief).toContain('математику')
    expect(brief).toContain('9:16')
  })
})

describe('the onboarding is actually wired to something', () => {
  it('a join in the opened room reaches the greeting', async () => {
    /*
     * THE TEST THIS FILE WAS REALLY WRITTEN FOR. The module shipped with a
     * green suite and no caller: nothing in the running bot ever called it.
     * Tests passing on dead code is the purest form of the trap this
     * repository keeps a rule about.
     */
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    expect(src).toContain("bot.on('new_chat_members'")
    expect(src).toContain('registerClubWelcome(bot)')
    const at = src.indexOf('export function registerClubWelcome')
    const body = src.slice(at, at + 1600)
    // Only in a room the owner opened, and never at a bot's arrival.
    expect(body).toContain('isConciergeChat')
    expect(body).toContain('person?.is_bot')
  })
})
