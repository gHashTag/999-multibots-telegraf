/**
 * Дополнительные тесты для платежных handler’ов
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'

import { handlePreCheckoutQuery } from '../../src/handlers/paymentHandlers/handlePreCheckoutQuery'
import { handlePaymentPolicyInfo } from '../../src/handlers/paymentHandlers/handlePaymentPolicyInfo'
import { handleTopUp } from '../../src/handlers/paymentHandlers/handleTopUp'
import * as handleBuyModule from '../../src/handlers/handleBuy'
import { handleSuccessfulPayment } from '../../src/handlers/paymentHandlers/index'

import { incrementBalance, setPayments } from '@/core/supabase'

// Мокаем зависимости
jest.mock('../../src/handlers/handleBuy')
jest.mock('@/core/supabase', () => ({
  incrementBalance: jest.fn(),
  setPayments: jest.fn(),
}))

describe('handlePreCheckoutQuery', () => {
  it('always answers OK', async () => {
    const ctx = makeMockContext()
    ctx.answerPreCheckoutQuery = jest.fn(() => Promise.resolve())
    await handlePreCheckoutQuery(ctx)
    expect(ctx.answerPreCheckoutQuery).toHaveBeenCalledWith(true)
  })
})

describe('handlePaymentPolicyInfo', () => {
  let ctx
  beforeEach(() => {
    ctx = makeMockContext()
    ctx.answerCbQuery = jest.fn(() => Promise.resolve())
    ctx.reply = jest.fn(() => Promise.resolve())
  })

  it('sends policy info in RU', async () => {
    ctx.from.language_code = 'ru'
    await handlePaymentPolicyInfo(ctx)
    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('💳 Оплата производится через систему Robokassa')
    )
  })

  it('sends policy info in EN', async () => {
    ctx.from.language_code = 'en'
    await handlePaymentPolicyInfo(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('💳 Payment is processed through the Robokassa system')
    )
  })
})

describe('handleTopUp', () => {
  it('forwards to handleBuy', async () => {
    const ctx = makeMockContext()
    // @ts-ignore
    ctx.match = ['top_up_50']
    ctx.from.language_code = 'ru'
    const spy = jest.spyOn(handleBuyModule, 'handleBuy').mockResolvedValueOnce(undefined)
    await handleTopUp(ctx)
    expect(spy).toHaveBeenCalledWith({ ctx, data: 'top_up_50', isRu: true })
  })
})

describe('handleSuccessfulPayment', () => {
  let ctx
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    // prepare basic props
    ctx.from = { id: 11, username: 'user', language_code: 'en' }
    ctx.botInfo = { username: 'bot' }
    ctx.session = { subscription: '', telegram_id: 11 }
    ctx.message = {
      successful_payment: { total_amount: 123, invoice_payload: 'payload' }
    }
    ctx.telegram.sendMessage = jest.fn(() => Promise.resolve())
  })

  it('processes known subscription (neurophoto)', async () => {
    ctx.session.subscription = 'neurophoto'
    await handleSuccessfulPayment(ctx)
    // incrementBalance called
    expect(incrementBalance).toHaveBeenCalled()
    // send notifications twice
    expect(ctx.telegram.sendMessage).toHaveBeenCalledTimes(2)
    // setPayments called
    expect(setPayments).toHaveBeenCalled()
  })

  it('processes other subscription as stars top-up', async () => {
    ctx.session.subscription = 'other'
    ctx.session.telegram_id = 11
    await handleSuccessfulPayment(ctx)
    // incrementBalance for stars
    expect(incrementBalance).toHaveBeenCalledWith({
      telegram_id: '11',
      amount: 123,
    })
    // reply to user
    expect(ctx.reply).toHaveBeenCalledWith(
      '💫 Your balance has been replenished by 123⭐️ stars!'
    )
    // notification and setPayments called
    expect(ctx.telegram.sendMessage).toHaveBeenCalled()
    expect(setPayments).toHaveBeenCalled()
  })
})