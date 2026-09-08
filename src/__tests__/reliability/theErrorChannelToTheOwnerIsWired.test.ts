import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
 * THE OWNER SAW NO ERRORS BECAUSE NOTHING WAS EVER SENT.
 *
 * bot.catch routes every Telegram API failure into telegramLogService, and
 * logger.ts and the payment handlers do the same. The service, however, sends
 * nothing until `initialize()` is called -- and `initialize()` was called from
 * NOWHERE in this repository. `log()` returned early, silently, so the whole
 * chain looked healthy: the call sites exist, nothing throws, and the group is
 * empty.
 *
 * Two properties are pinned here, and the second matters as much as the first:
 * the channel must be wired by the same function that installs the catcher,
 * and a channel that is NOT wired must say so instead of returning quietly.
 */
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { logger } from '@/utils/logger'
import { setupErrorHandler } from '@/helpers/error/errorHandler'
import {
  telegramLogService,
  TelegramLogService,
} from '@/services/telegram-log.service'

const fakeBot = () => {
  const sendMessage = vi.fn().mockResolvedValue({})
  return {
    bot: { catch: vi.fn(), telegram: { sendMessage } } as never,
    sendMessage,
  }
}

describe('the error channel to the owner is wired', () => {
  beforeEach(() => vi.clearAllMocks())

  it('installing the catcher also opens the channel it writes to', async () => {
    // Behavioural, not structural: the proof is that a message reaches the bot.
    const { bot, sendMessage } = fakeBot()
    setupErrorHandler(bot)
    await telegramLogService.logError({
      error: 'probe',
      context: 'wiring test',
    })
    expect(
      sendMessage,
      'setupErrorHandler must call telegramLogService.initializeOnce(bot)'
    ).toHaveBeenCalled()
  })

  it('the sender is chosen once, not re-bound by each of the eleven bots', () => {
    const first = fakeBot()
    const second = fakeBot()
    const svc = new TelegramLogService()
    svc.initializeOnce(first.bot)
    svc.initializeOnce(second.bot)
    void svc.logError({ error: 'probe' })
    expect(second.sendMessage).not.toHaveBeenCalled()
  })

  it('an unwired channel SAYS it is unwired, instead of returning quietly', async () => {
    // The defect itself: the silent `return` sat on the only delivery path to
    // the owner, so "no alerts" was indistinguishable from "no incidents".
    const svc = new TelegramLogService()
    await svc.logError({ error: 'probe' })
    const said = (
      logger.error as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.map(c => String(c[0]))
    expect(said.some(m => m.includes('TelegramLogService'))).toBe(true)
  })

  it('silent:true is still silent -- the complaint is about the channel, not the caller', async () => {
    const svc = new TelegramLogService()
    await svc.log('error', 'probe', { silent: true })
    const said = (
      logger.error as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.map(c => String(c[0]))
    expect(said.some(m => m.includes('TelegramLogService'))).toBe(false)
  })
})
