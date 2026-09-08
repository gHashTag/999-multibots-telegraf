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
  resolveAlertDestination,
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

  it('with nothing configured, alerts go to the OWNER, not to a group nobody checked', () => {
    // LOG_GROUP_ID is unset in production, so the old default sent every alert
    // to a hard-coded group the bot may not even belong to. The owner's id is
    // already in the deploy.
    expect(
      resolveAlertDestination({ ADMIN_TELEGRAM_ID: '144022504,1047716284' })
    ).toEqual({ chatId: '144022504', via: 'ADMIN_TELEGRAM_ID' })
  })

  it('an explicit LOG_GROUP_ID still wins: setting it is a decision', () => {
    expect(
      resolveAlertDestination({
        LOG_GROUP_ID: '-100777',
        ADMIN_TELEGRAM_ID: '144022504',
      })
    ).toEqual({ chatId: '-100777', via: 'LOG_GROUP_ID' })
  })

  it('the legacy group is the LAST resort and says so', () => {
    const d = resolveAlertDestination({})
    expect(d.via).toBe('legacy-group')
    expect(d.chatId).toBe('-1002737186844')
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
