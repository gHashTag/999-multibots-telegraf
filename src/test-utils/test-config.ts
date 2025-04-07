/**
 * Конфигурация для тестирования различных компонентов системы
 */

import { logger } from '@/utils/logger'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { InngestTestEngine } from '@inngest/test'
<<<<<<< Updated upstream

import { paymentProcessor } from '@/inngest-functions/paymentProcessor'

=======
import { inngest } from '@/inngest-functions/clients'
import { paymentProcessor } from '@/inngest-functions/paymentProcessor'

>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
// Создаем тестовый движок Inngest
export const inngestTestEngine = new InngestTestEngine({
  function: paymentProcessor,
})

=======
<<<<<<< HEAD
>>>>>>> Stashed changes
export interface TestResult {
  success: boolean
  name: string
  error?: string
}

=======
// Создаем тестовый движок Inngest
export const inngestTestEngine = new InngestTestEngine({
  function: paymentProcessor,
})

// Конфигурация для тестов
>>>>>>> b75d880 (tests)
export const TEST_CONFIG = {
  // Базовая конфигурация
  mockBot,
  mocks: {
    bot: mockBot,
  },

<<<<<<< Updated upstream
  // Конфигурация сервера
  server: {
    apiUrl: 'http://localhost:3000',
    webhookPath: '/api/webhook',
    bflWebhookPath: '/api/bfl-webhook',
    neurophotoWebhookPath: '/api/neurophoto-webhook',
  },

  // Тестовые пользователи
  users: {
    main: {
      telegramId: '123456789',
      botName: 'test_bot',
      isRussian: true,
    },
    default: {
      telegramId: '123456789',
      botName: 'test_bot',
      isRussian: true,
    },
  },

  // Тестовые боты
  bots: {
    test_bot: mockBot,
    neurophoto: mockBot,
    default: mockBot,
  },

  // Тестовые данные для тренировки моделей
  modelTraining: {
    samples: [
      {
        trainingId: 'test-training-id-1',
        status: 'completed',
        outputUrl: 'https://example.com/model.safetensors',
        version: '1.0.0',
        metrics: {
          loss: 0.001,
          accuracy: 0.99,
          predict_time: 120,
        },
        error: null,
      },
    ],
  },

  // Конфигурация BFL тренировок
  bflTraining: {
    samples: [
      {
        trainingId: 'test-bfl-id-1',
        status: 'completed',
        outputUrl: 'https://example.com/bfl-model.safetensors',
        version: '1.0.0',
        metrics: {
          loss: 0.001,
          accuracy: 0.99,
          predict_time: 120,
        },
      },
    ],
  },

  // Конфигурация Neurophoto
  neurophoto: {
    samples: [
      {
        generationId: 'test-neurophoto-id-1',
        task_id: 'test-task-id-1',
        status: 'completed',
        outputUrl: 'https://example.com/generated-image.jpg',
        prompt: 'Test prompt',
        result: {
          url: 'https://example.com/generated-image.jpg',
          status: 'completed',
        },
        metrics: {
          predict_time: 10,
        },
      },
    ],
  },

=======
>>>>>>> Stashed changes
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

<<<<<<< HEAD
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  LOG_LEVEL: 'info',
  EMOJI: {
    START: '🚀',
    SUCCESS: '✅',
    ERROR: '❌',
    INFO: 'ℹ️',
    WARNING: '⚠️',
    DEBUG: '🔍',
    RETRY: '🔄',
    TEST: '🎯',
    DATA: '💾',
<<<<<<< Updated upstream
    EVENT: '⚡️',
  },

=======
    EVENT: '⚡️'
  }
=======
  // Тестовый движок Inngest
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
=======
>>>>>>> b75d880 (tests)
>>>>>>> Stashed changes
}
