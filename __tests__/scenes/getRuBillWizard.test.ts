import { jest, describe, beforeEach, it, expect } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import { generateInvoiceStep } from '../../src/scenes/getRuBillWizard'

// Mock external dependencies
jest.mock('@/helpers', () => ({
  isRussian: jest.fn(),
}))
jest.mock('../../src/scenes/getRuBillWizard/helper', () => ({
  getInvoiceId: jest.fn(),
  merchantLogin: 'ML',
  password1: 'P1',
  description: 'DESC',
  subscriptionTitles: isRu => ({ neurophoto: isRu ? 'Фото' : 'Photo' }),
}))
jest.mock('../../src/core/supabase', () => ({
  setPayments: jest.fn(),
}))
jest.mock('@/core', () => ({
  getBotNameByToken: jest.fn(() => ({ bot_name: 'bot1' })),
}))

import { isRussian } from '@/helpers'
import { getInvoiceId } from '../../src/scenes/getRuBillWizard/helper'
import { setPayments } from '../../src/core/supabase'
import { getBotNameByToken } from '@/core'

describe('generateInvoiceStep', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should process selectedPayment, create invoice and leave scene (RU)', async () => {
    (isRussian as jest.Mock).mockReturnValue(true)
    ;(getInvoiceId as jest.Mock).mockResolvedValueOnce('https://pay.url')
    const ctx = makeMockContext({}, { session: { selectedPayment: { subscription: 'neurophoto' }, email: 'e@e' } })
    await generateInvoiceStep(ctx)
    // setPayments called
    expect(setPayments).toHaveBeenCalledWith(expect.objectContaining({
      telegram_id: ctx.from.id.toString(),
      OutSum: '1110',
      InvId: expect.any(String),
      currency: 'RUB',
      stars: 476,
      status: 'PENDING',
      payment_method: 'Telegram',
      subscription: 'neurophoto',
      bot_name: 'bot1',
      language: ctx.from.language_code,
    }))
    // reply with HTML invoice message
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('<b>💵 Чек создан для подписки Фото'),
      expect.objectContaining({
        reply_markup: { inline_keyboard: expect.any(Array) },
        parse_mode: 'HTML',
      })
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('should reply error when no selectedPayment', async () => {
    (isRussian as jest.Mock).mockReturnValue(false)
    const ctx = makeMockContext({}, { session: { selectedPayment: null } })
    await generateInvoiceStep(ctx)
    expect(setPayments).not.toHaveBeenCalled()
    expect(ctx.reply).not.toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })
})