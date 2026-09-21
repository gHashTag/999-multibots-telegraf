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
 * So a content filter declining a stranger's profile picture paged the owner,
 * verbatim, in production:
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
 *
 * 2026-09-21: the generator underneath changed from SeeDream-4.5 to
 * GPT-Image-2.5, which does not throw -- it returns null and reports the reason
 * through its `onError` hook. The classification had to survive that change, so
 * it is re-pinned here against the new shape, together with the shape of the
 * gift itself (see below).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { generate, reserveSlot, sendMessage, sendPhoto, deleteMessage } =
  vi.hoisted(() => ({
    generate: vi.fn(),
    reserveSlot: vi.fn(),
    sendMessage: vi.fn(),
    sendPhoto: vi.fn(),
    deleteMessage: vi.fn(),
  }))

vi.mock('@/services/generateGptImage25', () => ({
  generateGptImage25: generate,
}))
vi.mock('@/inngest_app/functions/welcomeGiftBudget', () => ({
  reserveWelcomeGiftSlot: reserveSlot,
}))
vi.mock('@/inngest_app/services/bot-adapter', () => ({
  getBotByNameAdapter: () => ({
    bot: { telegram: { sendMessage, sendPhoto, deleteMessage } },
  }),
}))

import { logger } from '@/utils/logger'
import { welcomeAvatarGeneration } from '@/inngest_app/functions/welcomeAvatarGeneration'
import { getHandler } from '@/inngest_app/test/utils/test-helpers'

/** The provider's refusal, worded exactly as the production alert carried it. */
const REFUSED =
  'Prediction failed: Prediction failed: Async prediction failed: ' +
  'ModelError: The input or output was flagged as sensitive. ' +
  'Please try again with different inputs. (E005)'

/**
 * The new generator swallows its own failures: it returns null and hands the
 * reason to `onError`. That hook is the only way the caller learns WHY, so the
 * mock has to honour it or every classification below is vacuous.
 */
const fails = (why: string) =>
  generate.mockImplementation(async (params: any) => {
    params.onError?.(why)
    return null
  })

const succeeds = (url = 'https://kie.example/gift.png') =>
  generate.mockResolvedValue(url)

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
const said = () =>
  [
    ...sendMessage.mock.calls.map(c => String(c[1])),
    ...sendPhoto.mock.calls.map(c => String(c[2]?.caption ?? '')),
  ].join(' ')

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
  deleteMessage.mockReset().mockResolvedValue(true)
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
    succeeds()

    const result = await run()

    expect(
      generate,
      'the gift never asked for a picture'
    ).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(true)
    expect(pages()).toEqual([])
  })

  it('writes the refusal down instead of sending it to the phone', async () => {
    fails(REFUSED)

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
    fails(REFUSED)

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
    fails(REFUSED)

    await run(false)

    expect(said()).toMatch(/did not pass the AI filter/i)
  })

  it('STILL pages when the provider behind the gift is down', async () => {
    // The trade this must not make: an outage hiding behind a refused photo.
    fails('kie.ai returned 503')

    await run()

    expect(pages().join('\n')).toContain('[Welcome Avatar] Generation failed')
    expect(pages().join('\n')).not.toContain('refused')
    // ...and the generic apology is the right one here: the photo was fine.
    expect(said()).toContain('Не удалось создать нейро-портрет автоматически')
  })

  it('STILL pages when the failure only LOOKS like a refusal in passing', async () => {
    // The predicate is narrow on purpose. A provider that dies while the word
    // "sensitive" happens to sit in a field name is still our outage.
    fails('ECONNRESET reading sensitive_config')

    await run()

    expect(pages().join('\n')).toContain('[Welcome Avatar] Generation failed')
  })

  it('a generator that returns nothing and says nothing still pages', async () => {
    // null with no onError call: no reason to classify, so it is machinery.
    generate.mockResolvedValue(null)

    await run()

    expect(pages().join('\n')).toContain('[Welcome Avatar] Generation failed')
  })
})

/**
 * WHAT THE GIFT IS MADE OF.
 *
 * Owner's instruction, 2026-09-21: the gift is GPT-Image-2.5 image-to-image
 * FROM the newcomer's own avatar, and every asset is 9:16 by default because
 * that is the frame Reels, Stories and TikTok give it. Before this, the gift
 * ran on SeeDream-4.5 at 2K with no aspect ratio passed at all.
 *
 * And it is a GIFT: the newcomer is not charged, and is not shown a price.
 * The generator's own caption quotes a cost of five stars, which is why the
 * gift runs `silent` and writes its own.
 */
describe('the welcome gift: what it is made of', () => {
  const askedWith = () => generate.mock.calls[0][0]

  beforeEach(() => succeeds())

  it("is image-to-image from the newcomer's own avatar", async () => {
    await run()
    expect(askedWith().inputImageUrl).toBe(
      'https://example.com/profile-photo.jpg'
    )
  })

  it('is portrait, 9:16, the shape a phone will look at it in', async () => {
    await run()
    expect(askedWith().aspect_ratio).toBe('9:16')
  })

  it('costs the newcomer nothing and never quotes a price', async () => {
    await run()
    // skipBalanceCheck skips the charge as well as the check, which is what
    // keeps the service's refund path correctly dormant.
    expect(askedWith().skipBalanceCheck).toBe(true)
    // ...and silent keeps the five-star price caption off a free portrait.
    expect(askedWith().silent).toBe(true)
    expect(said()).not.toContain('5⭐')
    // Written as literals rather than one regex: the no-cyrillic gate reads
    // a regex body as code, and only a string literal may carry Cyrillic.
    expect(said()).not.toContain('Стоимость')
    expect(said()).not.toContain('Cost:')
  })

  it('arrives as one gift: the picture carries the welcome', async () => {
    await run()
    expect(sendPhoto).toHaveBeenCalledTimes(1)
    expect(sendPhoto.mock.calls[0][1]).toBe('https://kie.example/gift.png')
    expect(String(sendPhoto.mock.calls[0][2].caption)).toContain(
      'Добро пожаловать'
    )
  })

  it('a picture that cannot be delivered still leaves a welcome behind', async () => {
    sendPhoto.mockRejectedValue(new Error('Bad Request: wrong file identifier'))

    await run()

    expect(said()).toContain('Добро пожаловать')
    expect(pages().join('\n')).toContain('Failed to send the gift photo')
  })
})
