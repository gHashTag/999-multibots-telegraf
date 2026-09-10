/**
 * The star top-up must show the packages, not "invalid star amount".
 *
 * Live, 08.09.2026 18:46Z, three times: the owner pressed "⭐ Пополнить баланс"
 * (act:topup) and the bot answered "Некорректное количество звезд для оплаты".
 * The default session ships selectedPayment as { stars: 0, subscription:
 * 'STARS' }; starPaymentScene.enter tested the subscription field alone and
 * sent every fresh session (right after /start) into handleBuySubscription
 * with 0 stars. The package branch (handleSelectStars) was unreachable.
 *
 * The existing starPaymentScene.test.ts re-implements the condition inside the
 * test, so it could not fail. This one runs the scene's own enter middleware.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))
vi.mock('@/handlers', () => ({
  handleSelectStars: vi.fn(),
  handleBuySubscription: vi.fn(),
}))
vi.mock('@/handlers/paymentHandlers/handleTopUp', () => ({
  handleTopUp: vi.fn(),
}))
vi.mock('@/price/helpers/starAmounts', () => ({ starAmounts: [10, 50, 100] }))
vi.mock('@/core/supabase', () => ({ setPayments: vi.fn() }))
vi.mock('@/core', () => ({
  getBotNameByToken: vi.fn(() => ({ bot_name: 'test_bot' })),
}))
vi.mock('@/navigation', () => ({
  getMainMenuText: vi.fn(() => '🏠 Главное меню'),
  showMainMenu: vi.fn(),
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { Context, Telegram } from 'telegraf'
import { handleSelectStars, handleBuySubscription } from '@/handlers'
import { starPaymentScene } from '@/scenes/starPaymentScene'
import { defaultSession } from '@/store'

// Composer requires a real Context (instanceof check); the update carries the
// person so ctx.from resolves as in production.
const enter = async (selectedPayment: unknown) => {
  const update = {
    update_id: 1,
    callback_query: {
      id: 'q',
      from: { id: 144022504, is_bot: false, first_name: 'Owner' },
      chat_instance: 'c',
      data: 'act:topup',
      message: {
        message_id: 1,
        date: 1,
        chat: { id: 144022504, type: 'private' },
      },
    },
  }
  const ctx = new Context(
    update as any,
    new Telegram('111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
    { id: 111, is_bot: true, first_name: 'B', username: 'test_bot' } as any
  ) as any
  ctx.session = { ...defaultSession, selectedPayment }
  ctx.scene = { leave: vi.fn(), enter: vi.fn() }
  ctx.reply = vi.fn()
  await (starPaymentScene.enterMiddleware() as any)(ctx, async () => undefined)
  return ctx
}

beforeEach(() => {
  vi.mocked(handleSelectStars).mockClear()
  vi.mocked(handleBuySubscription).mockClear()
})

describe('starPaymentScene.enter', () => {
  it('the DEFAULT session (stars 0, subscription STARS) gets the star packages, not a purchase', async () => {
    await enter(defaultSession.selectedPayment)
    expect(handleSelectStars).toHaveBeenCalledTimes(1)
    expect(handleBuySubscription).not.toHaveBeenCalled()
  })

  it('no selectedPayment at all also gets the packages', async () => {
    await enter(undefined)
    expect(handleSelectStars).toHaveBeenCalledTimes(1)
    expect(handleBuySubscription).not.toHaveBeenCalled()
  })

  it('a plan with a positive star amount is bought', async () => {
    await enter({
      subscription: 'PRO',
      stars: 304,
      amount: 699,
      type: 'MONEY_OUTCOME',
    })
    expect(handleBuySubscription).toHaveBeenCalledTimes(1)
    expect(handleSelectStars).not.toHaveBeenCalled()
  })

  it('a plan with zero stars is never bought', async () => {
    await enter({
      subscription: 'PRO',
      stars: 0,
      amount: 0,
      type: 'MONEY_OUTCOME',
    })
    expect(handleBuySubscription).not.toHaveBeenCalled()
    expect(handleSelectStars).toHaveBeenCalledTimes(1)
  })

  it('the top-up button clears a stale selectedPayment before entering the scene', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/navigation/registerCommands.ts'),
      'utf8'
    )
    const start = src.indexOf('bot.action(`${ACTION_PREFIX}topup`')
    const body = src.slice(
      start,
      src.indexOf('bot.action(`${ACTION_PREFIX}balance`', start)
    )
    const clear = body.indexOf('ctx.session.selectedPayment = undefined')
    // Since 2026-09-09 the button opens the payment chooser (PaymentScene),
    // not Stars alone; the invariant under test is the ORDER: the stale
    // selection is cleared before any scene is entered.
    const enterScene = body.indexOf('ctx.scene.enter(ModeEnum.PaymentScene')
    expect(clear).toBeGreaterThan(-1)
    expect(enterScene).toBeGreaterThan(clear)
  })
})
