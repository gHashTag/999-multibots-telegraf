/**
 * Конфигурация для тестирования различных компонентов системы
 */

import { PaymentStatus } from '@/core/supabase/updatePaymentStatus'
import { logger } from '@/utils/logger'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { InngestTestEngine } from '@inngest/test'
import { inngest } from '@/inngest-functions/clients'
import { paymentProcessor } from '@/inngest-functions/paymentProcessor'

// Создаем мок бота
const mockBot = {
  telegram: {
    sendMessage: async () => {
      logger.info('🤖 Mock: Отправка сообщения', {
        description: 'Mock: Sending message',
      })
      return true
    },
    sendPhoto: async () => {
      logger.info('📸 Mock: Отправка фото', {
        description: 'Mock: Sending photo',
      })
      return true
    },
    sendVideo: async () => {
      logger.info('🎥 Mock: Отправка видео', {
        description: 'Mock: Sending video',
      })
      return true
    },
    sendDocument: async () => {
      logger.info('📄 Mock: Отправка документа', {
        description: 'Mock: Sending document',
      })
      return true
    },
    sendMediaGroup: async () => {
      logger.info('🖼️ Mock: Отправка медиа группы', {
        description: 'Mock: Sending media group',
      })
      return true
    },
    deleteMessage: async () => {
      logger.info('🗑️ Mock: Удаление сообщения', {
        description: 'Mock: Deleting message',
      })
      return true
    },
  },
} as unknown as Telegraf<MyContext>

// Создаем тестовый движок Inngest
export const inngestTestEngine = new InngestTestEngine({
  function: paymentProcessor,
})

// Конфигурация для тестов
export const TEST_CONFIG = {
  // Базовая конфигурация
  mockBot,
  mocks: {
    bot: mockBot,
  },

  // Тестовые данные для платежей
  payments: {
    success: {
      amount: 100,
      type: 'money_income',
      description: 'Test payment',
    },
    error: {
      amount: -50,
      type: 'money_outcome',
      description: 'Test error payment',
    },
  },

  // Тестовый движок Inngest
  inngestEngine: inngestTestEngine,

  // Таймауты
  PAYMENT_PROCESSING_TIMEOUT: 1000,

  // Очистка после тестов
  cleanupAfterEach: true,

  // Тестовые константы
  TEST_USER_ID: '123456789',
  TEST_OWNER_ID: '123456789',
  TEST_BOT_NAME: 'test_bot',
  TEST_IMAGE_URL: 'https://example.com/test-image.jpg',
}
