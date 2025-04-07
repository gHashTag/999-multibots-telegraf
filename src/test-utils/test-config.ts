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
import { supabase } from '@/core/supabase'

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
inngestTestEngine.register('payment/process', async ({ event, step }) => {
  try {
    logger.info('🚀 Обработка платежа в тестовом окружении', {
      description: 'Processing payment in test environment',
      event_id: event.id,
      event_data: event.data,
    })

    // Создаем запись о платеже в БД
    const { error } = await supabase.from('payments_v2').insert({
      telegram_id: event.data.telegram_id,
      amount: event.data.amount,
      stars: event.data.amount,
      type: event.data.type,
      description: event.data.description,
      bot_name: event.data.bot_name,
      status: 'COMPLETED',
      payment_method: 'test',
      inv_id: event.data.inv_id,
      service_type: event.data.service_type,
    })

    if (error) {
      throw error
    }

    logger.info('✅ Платеж успешно обработан', {
      description: 'Payment processed successfully',
      event_id: event.id,
      telegram_id: event.data.telegram_id,
      amount: event.data.amount,
    })

    return { success: true }
  } catch (error) {
    logger.error('❌ Ошибка при обработке платежа', {
      description: 'Error processing payment',
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
    RETRY: '��',
    TEST: '🎯',
    DATA: '💾',
    EVENT: '⚡️',
  } as TestEmoji,

  // Тестовый движок Inngest с правильными параметрами
  inngestEngine: inngestTestEngine,

  // Таймаут для обработки платежей
  PAYMENT_PROCESSING_TIMEOUT: 5000,

  // Флаг для очистки после каждого теста
  cleanupAfterEach: true,

  // Тестовые ID
  TEST_USER_ID: '123456789',
  TEST_OWNER_ID: '123456789',
  TEST_BOT_NAME: process.env.TEST_BOT_NAME || 'neuro_blogger_bot',
  TEST_IMAGE_URL: 'https://example.com/test.jpg',
  TEST_TELEGRAM_ID: process.env.TEST_TELEGRAM_ID || '144022504',

  // Очищать ли тестовые данные после выполнения тестов
  cleanupAfterTests: true,

  // Максимальное время ожидания для асинхронных операций (в мс)
  maxWaitTime: 10000,

  // Размер буфера событий
  eventBufferSize: 200,

  // API конфигурация
  api: {
    url: process.env.API_URL || 'http://localhost:2999',
    webhookPath: '/webhooks/replicate',
    bflWebhookPath: '/webhooks/bfl',
  },

  // Inngest конфигурация
  inngest: {
    eventKey: process.env.INNGEST_EVENT_KEY!,
    signingKey: process.env.INNGEST_SIGNING_KEY!,
    baseUrl: process.env.INNGEST_BASE_URL || 'http://localhost:8288',
  },

  models: {
    neurophoto: 'test-model',
  },
}

// Экспорт для использования в тестах
export default TEST_CONFIG
