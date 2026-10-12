/**
 * THE WELCOME GIFT IS OFF BY DEFAULT (owner, 2026-10-12), and this file pins
 * the second door.
 *
 * The scene stopped sending the event, but Inngest keeps whatever was already
 * queued, and legacy senders still publish "user/welcome.avatar.generate".
 * Both land in this function, and before the switch every landing spent the
 * owner's provider money on a gift portrait -- at a moment (kie.ai balance at
 * zero) when each attempt also paged the owner's phone twice: once from
 * generateGptImage25's logger.error, once from the onFailure handler.
 *
 * Driven through the real registered handler (getHandler + pass-through step),
 * the same harness as nonRetriableGuards.test.ts. Everything that spends or
 * messages is mocked; the OFF case asserts they were never reached.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/services/generateGptImage25', () => ({
  generateGptImage25: vi.fn(),
}))
vi.mock('@/inngest_app/functions/welcomeGiftBudget', () => ({
  reserveWelcomeGiftSlot: vi.fn(() => ({ granted: true, used: 1, limit: 500 })),
}))
// bot: null makes the ON path stop at validate-bot, before any spending step.
vi.mock('@/inngest_app/services/bot-adapter', () => ({
  getBotByNameAdapter: vi.fn(() => ({ bot: null, error: 'no bot' })),
}))

import { logger } from '@/utils/logger'
import { generateGptImage25 } from '@/services/generateGptImage25'
import { reserveWelcomeGiftSlot } from '@/inngest_app/functions/welcomeGiftBudget'
import { welcomeAvatarGeneration } from '@/inngest_app/functions/welcomeAvatarGeneration'
import { getHandler } from '@/inngest_app/test/utils/test-helpers'

const step = {
  run: vi.fn(async (_name: string, fn: () => any) => fn()),
  sleep: vi.fn(async () => undefined),
  sendEvent: vi.fn(async () => undefined),
}

const EVENT = {
  name: 'welcome/avatar.generate',
  data: {
    telegram_id: '900000083',
    avatarUrl: 'https://example.com/photo.jpg',
    gender: 'unknown',
    bot_name: 'example_farm_bot',
    username: 'someone',
    is_ru: false,
  },
} as any

const SAVED = process.env.WELCOME_GIFT_ENABLED

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.WELCOME_GIFT_ENABLED
})

afterEach(() => {
  if (SAVED === undefined) delete process.env.WELCOME_GIFT_ENABLED
  else process.env.WELCOME_GIFT_ENABLED = SAVED
})

describe('welcome gift switch (WELCOME_GIFT_ENABLED, default OFF)', () => {
  it('a queued or legacy event stops before any spending step, without paging the owner', async () => {
    const handler = getHandler(welcomeAvatarGeneration)
    const result = await handler({ event: EVENT, step })

    expect(result).toEqual({ success: false, skipped: 'welcome-gift-disabled' })
    expect(step.run).not.toHaveBeenCalled()
    expect(reserveWelcomeGiftSlot).not.toHaveBeenCalled()
    expect(generateGptImage25).not.toHaveBeenCalled()
    // The skip is a decision, not an outage: warn, never the owner's phone.
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Gift disabled'),
      expect.anything()
    )
  })

  it('WELCOME_GIFT_ENABLED=true lets the run proceed past the guard', async () => {
    process.env.WELCOME_GIFT_ENABLED = 'true'
    const handler = getHandler(welcomeAvatarGeneration)
    // bot-adapter is mocked to "no bot", so the run stops at validate-bot --
    // far enough to prove the guard opened, far from anything paid.
    const result = await handler({ event: EVENT, step })

    expect(result).toEqual({ success: false, error: 'no bot' })
    expect(step.run).toHaveBeenCalledWith('validate-bot', expect.any(Function))
  })
})
