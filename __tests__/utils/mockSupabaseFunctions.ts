/**
 * Моки для функций Supabase, используемых в сценах
 */

import { Subscription } from '../../src/interfaces'

// Типы для мок-функций
type TranslationResult = { translation: string; url: string }
type ReferralsResult = {
  count: number
  level: number
  subscription: Subscription
  userData: any
  isExist: boolean
}
type PaymentStatusResult = {
  status: string
  amount: number
  currency: string
  type: string
  [key: string]: any
}

// Мок для getTranslation
export const mockGetTranslation: jest.Mock<
  TranslationResult,
  [{ key: string }]
> = jest.fn().mockImplementation(
  ({ key }: { key: string }): TranslationResult => ({
    translation: `Мок-перевод для ключа ${key}`,
    url: key === 'start' ? 'https://example.com/mock-photo.jpg' : '',
  })
)

// Мок для getReferalsCountAndUserData
export const mockGetReferalsCountAndUserData: jest.Mock<
  ReferralsResult,
  [string]
> = jest.fn().mockImplementation(
  (telegram_id: string): ReferralsResult => ({
    count: 0,
    level: 1,
    subscription: 'stars' as unknown as Subscription,
    userData: {
      user_id: '123e4567-e89b-12d3-a456-426614174000',
      telegram_id,
      email: 'test@example.com',
      subscription: 'stars',
      level: 1,
    },
    isExist: true,
  })
)

// Мок для checkPaymentStatus
export const mockCheckPaymentStatus: jest.Mock<PaymentStatusResult, [string]> =
  jest.fn().mockImplementation((invId: string): PaymentStatusResult => {
    // Возвращаем объект с информацией о платеже
    return {
      status: 'COMPLETED',
      amount: 100,
      currency: 'RUB',
      type: 'BALANCE_TOPUP',
    }
  })

// Мок для updateUserBalance
export const mockUpdateUserBalance: jest.Mock<
  {
    id: string
    telegram_id: string
    amount: number
    type: string
    description: string
    created_at: string
    success: boolean
  },
  [string, number, string, string?, any?]
> = jest
  .fn()
  .mockImplementation(
    (
      telegram_id: string,
      amount: number,
      type: string,
      description?: string,
      metadata?: any
    ) => {
      // Возвращаем объект с информацией о транзакции
      return {
        id: 'mock-transaction-id',
        telegram_id,
        amount,
        type,
        description: description || 'Mock transaction',
        created_at: new Date().toISOString(),
        success: true,
      }
    }
  )

// Экспортируем все моки с явным типом
export const supabaseMocks = {
  getTranslation: mockGetTranslation,
  getReferalsCountAndUserData: mockGetReferalsCountAndUserData,
  checkPaymentStatus: mockCheckPaymentStatus,
  updateUserBalance: mockUpdateUserBalance,
}
