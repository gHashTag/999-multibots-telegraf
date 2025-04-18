/**
 * Моки для функций Supabase, используемых в сценах
 */

import { jest } from '@jest/globals'
import { Subscription } from '../../src/interfaces'

// Мок для getTranslation
export const mockGetTranslation = jest.fn().mockImplementation(
  ({ key }) => ({
    translation: `Мок-перевод для ключа ${key}`,
    url: key === 'start' ? 'https://example.com/mock-photo.jpg' : '',
  })
)

// Мок для getReferalsCountAndUserData
export const mockGetReferalsCountAndUserData = jest.fn().mockImplementation(
  (telegram_id: string) => ({
    count: 0,
    level: 1,
    subscription: 'stars' as Subscription,
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
export const mockCheckPaymentStatus = jest.fn().mockImplementation(
  (ctx, subscription) => {
    // Возвращаем true для полной подписки и false для базовой
    return subscription !== 'stars'
  }
)

// Экспортируем все моки
export const supabaseMocks = {
  getTranslation: mockGetTranslation,
  getReferalsCountAndUserData: mockGetReferalsCountAndUserData,
  checkPaymentStatus: mockCheckPaymentStatus,
} 