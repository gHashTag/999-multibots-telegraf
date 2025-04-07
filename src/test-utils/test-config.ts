/**
 * Конфигурация для тестирования различных компонентов системы
 */

import { logger } from '@/utils/logger'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { TestResult } from './interfaces'
import { InngestTestEngine } from './inngest-test-engine'
import { paymentProcessor } from '@/inngest-functions/paymentProcessor'
import { TelegramMock } from './mocks/telegram.mock'

// Интерфейсы для тестовых данных
interface BotInfo {
  id: number
  is_bot: boolean
  first_name: string
  username: string
  can_join_groups: boolean
  can_read_all_group_messages: boolean
  supports_inline_queries: boolean
}

interface TestUser {
  id: number
  username: string
  is_bot: boolean
  first_name: string
  last_name: string
  telegramId?: string
  botName?: string
  isRussian?: boolean
}

interface TestBot {
  name: string
  token: string
}

interface ModelTrainingSample {
  trainingId: string
  status: string
  metrics: {
    predict_time: number
  }
}

interface BFLTrainingSample {
  text: string
  image_url: string
}

interface NeuroPhotoSample {
  url: string
  prompt: string
  task_id?: string
  status?: string
  result?: any
}

interface PaymentSample {
  amount: number
  inv_id: string
  sign: string
}

interface TestEmoji {
  START: string
  SUCCESS: string
  ERROR: string
  INFO: string
  WARNING: string
  DEBUG: string
  RETRY: string
  TEST: string
  DATA: string
  EVENT: string
}

// Создаем тестовый движок Inngest с правильными параметрами
export const inngestTestEngine = new InngestTestEngine({
  maxWaitTime: 10000,
  eventBufferSize: 200,
})

// Регистрируем функцию paymentProcessor как обработчик события
inngestTestEngine.register('payment/process', async ({ event }) => {
  try {
    logger.info({
      message: '🚀 Обработка платежа в тестовом окружении',
      description: 'Processing payment in test environment',
      event_id: event.id,
      event_data: event.data,
    })

    // Возвращаем успешный результат для тестов
    return {
      success: true,
      message: 'Payment processed in test environment',
      event_id: event.id,
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при обработке платежа в тестовом окружении',
      description: 'Error processing payment in test environment',
      error: error instanceof Error ? error.message : String(error),
      event_id: event.id,
    })
    throw error
  }
})

export const TEST_CONFIG = {
  // Моки для тестирования
  mockBot: {
    telegram: TelegramMock,
  },
  mocks: {
    bot: {} as Telegraf<MyContext>,
  },

  // Конфигурация сервера
  server: {
    apiUrl: 'http://localhost:3000',
    webhookPath: '/webhook',
    bflWebhookPath: '/bfl-webhook',
    neurophotoWebhookPath: '/neurophoto-webhook',
  },

  // Тестовые пользователи
  users: {
    main: {
      telegramId: '123456789',
      username: 'test_user',
      firstName: 'Test',
      lastName: 'User',
      botName: 'test_bot',
      isRussian: true,
    },
  },

  // Конфигурация Supabase
  supabase: {
    url: process.env.SUPABASE_URL || 'http://localhost:54321',
    key: process.env.SUPABASE_SERVICE_KEY || 'your-service-key',
  },

  // Тестовые боты
  bots: {
    test_bot: {
      name: 'test_bot',
      token: 'test_token',
    } as TestBot,
    neurophoto: {
      name: 'neurophoto_bot',
      token: 'neurophoto_token',
    } as TestBot,
    default: {
      name: 'default_bot',
      token: 'default_token',
    } as TestBot,
  },

  // Тестовые данные для обучения моделей
  modelTraining: {
    samples: [
      {
        trainingId: 'test-training-1',
        status: 'completed',
        metrics: {
          predict_time: 1000,
        },
      },
    ] as ModelTrainingSample[],
  },

  // Тестовые данные для BFL обучения
  bflTraining: {
    samples: [
      {
        text: 'Test text 1',
        image_url: 'https://example.com/bfl1.jpg',
      } as BFLTrainingSample,
      {
        text: 'Test text 2',
        image_url: 'https://example.com/bfl2.jpg',
      } as BFLTrainingSample,
    ],
  },

  // Тестовые данные для neurophoto
  neurophoto: {
    samples: [
      {
        url: 'https://example.com/neurophoto1.jpg',
        prompt: 'Test neurophoto prompt 1',
      } as NeuroPhotoSample,
      {
        url: 'https://example.com/neurophoto2.jpg',
        prompt: 'Test neurophoto prompt 2',
      } as NeuroPhotoSample,
    ],
  },

  // Тестовые данные для платежей
  payments: {
    success: {
      amount: 100,
      inv_id: 'test_payment_123',
      sign: 'test_sign_123',
    } as PaymentSample,
    fail: {
      amount: 0,
      inv_id: 'test_payment_456',
      sign: 'test_sign_456',
    } as PaymentSample,
  },

  // Интервал проверки для тестов
  CHECK_INTERVAL: 1000,

  // Таймауты и повторы
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  LOG_LEVEL: 'info',

  // Эмодзи для логирования
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
    EVENT: '⚡️',
  } as TestEmoji,

  // Тестовый движок Inngest с правильными параметрами
  inngestEngine: inngestTestEngine,

  // Таймаут для обработки платежей
  PAYMENT_PROCESSING_TIMEOUT: 1000,

  // Флаг для очистки после каждого теста
  cleanupAfterEach: true,

  // Тестовые ID
  TEST_USER_ID: '123456789',
  TEST_OWNER_ID: '123456789',
  TEST_BOT_NAME: 'test_bot',

  // URL тестового изображения для image-to-prompt
  TEST_IMAGE_URL: 'https://example.com/test.jpg',

  // Тестовый ID для Telegram
  TEST_TELEGRAM_ID: '123456789',

  models: {
    neurophoto: 'test-model',
  },
}

// Экспорт для использования в тестах
export default TEST_CONFIG
