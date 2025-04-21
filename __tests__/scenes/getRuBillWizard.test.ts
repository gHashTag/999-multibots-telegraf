import makeMockContext from '../utils/mockTelegrafContext'
import { generateInvoiceStep } from '../../src/scenes/getRuBillWizard'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { SubscriptionType, MySession } from '@/interfaces'

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

  // Создаем полный мок MySession
  const createMockSession = (
    overrides: Partial<MySession> = {}
  ): MySession => ({
    activeWizard: false,
    wizards: {},
    scene: { current: '', state: {} },
    selectedPayment: null,
    userProfile: null,
    // Добавляем недостающие поля
    cursor: 0,
    images: [],
    targetUserId: 0,
    userModel: null,
    email: null,
    ...overrides,
  })

  it('should process selectedPayment, create invoice and leave scene (RU)', async () => {
    ;(isRussian as jest.Mock).mockReturnValue(true)
    ;(
      getInvoiceId as jest.Mock<() => Promise<string | null>>
    ).mockResolvedValueOnce('https://pay.url')
    const mockFrom = {
      id: 1,
      language_code: 'ru',
      is_bot: false,
      first_name: 'TestUser',
    }
    // Дополняем selectedPayment
    const selectedPaymentData = {
      subscription: SubscriptionType.NEUROPHOTO,
      amount: 1110, // Пример
      stars: 476, // Пример
      type: 'subscription', // Пример
      email: 'e@e',
    }
    // Создаем полный мок сессии
    const sessionData = createMockSession({
      selectedPayment: selectedPaymentData,
      email: 'e@e',
    })

    const ctx = makeMockContext(
      { message: { from: mockFrom } },
      sessionData // Передаем полную сессию во второй аргумент
    )
    await generateInvoiceStep(ctx)
    // setPayments called
    expect(setPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram_id: '1',
        OutSum: '1110',
        InvId: expect.any(String),
        currency: 'RUB',
        stars: 476,
        status: 'PENDING',
        payment_method: 'Telegram',
        subscription: SubscriptionType.NEUROPHOTO,
        bot_name: 'bot1',
        language: 'ru',
      })
    )
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
    ;(isRussian as jest.Mock).mockReturnValue(false)
    // Создаем полный мок сессии
    const sessionData = createMockSession({ selectedPayment: null })
    const ctx = makeMockContext(
      {},
      sessionData // Передаем полную сессию во второй аргумент
    )
    await generateInvoiceStep(ctx)
    expect(setPayments).not.toHaveBeenCalled()
    expect(ctx.reply).not.toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })
})
