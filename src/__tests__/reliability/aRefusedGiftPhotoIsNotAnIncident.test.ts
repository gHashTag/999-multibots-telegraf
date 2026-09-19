/**
 * THE WELCOME GIFT WAS THE ONE DOOR LEFT UNGUARDED.
 *
 * `utils/logger.ts` binds TelegramLogTransport at level 'error' (:304) and
 * routes only that level to the owner (:263), so `logger.error` is a push
 * notification on a phone. aRefusedPhotoIsNotAnIncident.test.ts already pins
 * that decision for the avatar scene's two doors and for the morphing ladder.
 * It does not cover this one, and this one is the door EVERY new customer walks
 * through: the gift portrait is made automatically, from whatever photo sits on
 * their Telegram profile, without anybody asking for it.
 *
 * So SeeDream's content filter declining a stranger's profile picture paged the
 * owner, verbatim, in production:
 *
 *   🚨 ERROR ❌ [Welcome Avatar] Generation failed
 *   Prediction failed: ... The input or output was flagged as sensitive ... (E005)
 *   👤 ID: 419031714
 *
 * Nothing there is actionable at 3am: no key to rotate, no service to restart,
 * no quota to raise. The right audience is the newcomer, and what they were
 * told was wrong too -- "do it yourself in the main menu" sends them back to
 * upload the identical photo and be refused again.
 *
 * Both halves are driven here through the real handler, so what is asserted is
 * which logger method the shipping branch calls and which sentence the customer
 * receives. Each "goes quiet" case is paired with a failure of OURS on the same
 * path that must still page, because a demotion is only a fix if the machinery
 * still shouts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { generate, reserveSlot, sendMessage, sendPhoto } = vi.hoisted(() => ({
  generate: vi.fn(),
  reserveSlot: vi.fn(),
  sendMessage: vi.fn(),
  sendPhoto: vi.fn(),
}))

vi.mock('@/services/generateSeeDream45', () => ({
  generateSeeDream45: generate,
}))
vi.mock('@/inngest_app/functions/welcomeGiftBudget', () => ({
  reserveWelcomeGiftSlot: reserveSlot,
}))
vi.mock('@/inngest_app/services/bot-adapter', () => ({
  getBotByNameAdapter: () => ({
    bot: { telegram: { sendMessage, sendPhoto, deleteMessage: vi.fn() } },
  }),
}))

import { logger } from '@/utils/logger'
import { welcomeAvatarGeneration } from '@/inngest_app/functions/welcomeAvatarGeneration'
import { getHandler } from '@/inngest_app/test/utils/test-helpers'

/** The provider's refusal, worded exactly as the production alert carried it. */
const REFUSED = () =>
  new Error(
    'Prediction failed: Prediction failed: Async prediction failed: ' +
      'ModelError: The input or output was flagged as sensitive. ' +
      'Please try again with different inputs. (E005)'
  )

const handler = getHandler(welcomeAvatarGeneration)

/** Inngest's step, flattened: every step body runs inline, in order. */
const step = { run: vi.fn(async (_name: string, fn: () => any) => fn()) }

const run = (is_ru = true) =>
  handler({
    event: {
      name: 'welcome/avatar.generate',
      data: {
        telegram_id: '419031714',
        avatarUrl: 'https://example.com/profile-photo.jpg',
        gender: 'male',
        bot_name: 'neuro_blogger_bot',
        username: 'newcomer',
        is_ru,
      },
    },
    step,
  })

let error: { mock: { calls: any[][] } }
let warn: { mock: { calls: any[][] } }

/** Every message the owner's phone would have rung about. */
const pages = () => error.mock.calls.map(c => String(c[0]))
const warnings = () => warn.mock.calls.map(c => String(c[0]))
/** Everything the newcomer was told, in one string. */
const said = () => sendMessage.mock.calls.map(c => String(c[1])).join(' ')

beforeEach(() => {
  // Spied on the real logger object -- the same instance the Telegram
  // transport is attached to, so "which method" is the whole question.
  error = vi.spyOn(logger, 'error').mockImplementation(() => logger as any)
  warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger as any)
  vi.spyOn(logger, 'info').mockImplementation(() => logger as any)

  step.run.mockClear()
  generate.mockReset()
  sendMessage.mockReset().mockResolvedValue({ message_id: 1 })
  sendPhoto.mockReset().mockResolvedValue({ message_id: 2 })
  reserveSlot.mockReset().mockReturnValue({ granted: true, used: 1, limit: 30 })
  // The hero is drawn at random; pinning the draw keeps the run identical.
  vi.spyOn(Math, 'random').mockReturnValue(0)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the welcome gift: a refused profile photo', () => {
  it('reaches the generator at all', async () => {
    // Without this, every "does not page" below could pass by never running
    // the code under test -- the bot lookup and the budget both return early.
    generate.mockResolvedValue({ image: 'ok' })

    const result = await run()

    expect(
      generate,
      'the gift never asked for a picture'
    ).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(true)
    expect(pages()).toEqual([])
  })

  it('writes the refusal down instead of sending it to the phone', async () => {
    generate.mockRejectedValue(REFUSED())

    await run()

    expect(
      pages(),
      "a stranger's profile picture woke the owner at 01:22"
    ).toEqual([])
    expect(warnings().join('\n')).toContain(
      '[Welcome Avatar] Photo refused on a content rule'
    )
  })

  it('tells the newcomer about the filter, not to retry the same photo', async () => {
    generate.mockRejectedValue(REFUSED())

    await run()

    expect(
      said(),
      'the customer was told the gift simply did not happen'
    ).toContain('не прошло фильтр')
    expect(
      said(),
      'sent back to the main menu with the same photo, to be refused again'
    ).not.toContain('Не удалось создать нейро-портрет автоматически')
  })

  it('says the same thing in English when the newcomer reads English', async () => {
    generate.mockRejectedValue(REFUSED())

    await run(false)

    expect(said()).toMatch(/did not pass the AI filter/i)
  })

  it('STILL pages when the provider behind the gift is down', async () => {
    // The trade this must not make: an outage hiding behind a refused photo.
    generate.mockRejectedValue(new Error('Replicate returned 503'))

    await run()

    expect(pages().join('\n')).toContain('[Welcome Avatar] Generation failed')
    expect(pages().join('\n')).not.toContain('refused')
    // ...and the generic apology is the right one here: the photo was fine.
    expect(said()).toContain('Не удалось создать нейро-портрет автоматически')
  })

  it('STILL pages when the failure only LOOKS like a refusal in passing', async () => {
    // The predicate is narrow on purpose. A provider that dies while the word
    // "sensitive" happens to sit in a field name is still our outage.
    generate.mockRejectedValue(new Error('ECONNRESET reading sensitive_config'))

    await run()

    expect(pages().join('\n')).toContain('[Welcome Avatar] Generation failed')
  })
})
