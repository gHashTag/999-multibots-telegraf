/**
 * Конфигурация для тестирования различных компонентов системы
 */

import { logger } from '@/utils/logger'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { InngestTestEngine } from './inngest-test-engine'
import { supabase } from '@/core/supabase'
import { TelegramMock } from './mocks/telegram.mock'
import { TestConfig } from './types'

// Получаем значения из переменных окружения с проверкой
function getEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    logger.error(`❌ Отсутствует переменная окружения ${name}`)
    throw new Error(`Missing environment variable: ${name}`)
  }
  return value
}

// Создаем тестовый движок Inngest с правильными параметрами
export const inngestTestEngine = new InngestTestEngine({
  maxWaitTime: 10000,
  eventBufferSize: 200,
})

// Регистрируем функцию paymentProcessor как обработчик события
inngestTestEngine.register('payment/process', async ({ event }) => {
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

export const TEST_CONFIG: TestConfig = {
  mockBot: {
    telegram: TelegramMock,
  },
  mocks: {
    bot: {} as Telegraf<MyContext>,
  },
  server: {
    apiUrl: 'http://localhost:3000',
    webhookPath: '/webhook',
    bflWebhookPath: '/bfl-webhook',
    neurophotoWebhookPath: '/neurophoto-webhook',
  },
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
  supabase: {
    url: process.env.SUPABASE_URL || 'http://localhost:54321',
    key: process.env.SUPABASE_SERVICE_KEY || 'your-service-key',
  },
  bots: {
    test_bot: {
      name: 'test_bot',
      token: 'test_token',
    },
    neurophoto: {
      name: 'neurophoto_bot',
      token: 'neurophoto_token',
    },
    default: {
      name: 'default_bot',
      token: 'default_token',
    },
  },
  modelTraining: {
    samples: [
      {
        trainingId: 'test-training-1',
        status: 'completed',
        metrics: {
          predict_time: 1000,
        },
      },
    ],
  },
  bflTraining: {
    samples: [
      {
        text: 'Test text 1',
        image_url: 'https://example.com/bfl1.jpg',
      },
      {
        text: 'Test text 2',
        image_url: 'https://example.com/bfl2.jpg',
      },
    ],
  },
  neurophoto: {
    samples: [
      {
        url: 'https://example.com/neurophoto1.jpg',
        prompt: 'Test neurophoto prompt 1',
      },
      {
        url: 'https://example.com/neurophoto2.jpg',
        prompt: 'Test neurophoto prompt 2',
      },
    ],
  },
  payments: {
    success: {
      amount: 100,
      inv_id: 'test_payment_123',
      sign: 'test_sign_123',
    },
    fail: {
      amount: 0,
      inv_id: 'test_payment_456',
      sign: 'test_sign_456',
    },
  },
  CHECK_INTERVAL: 1000,
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
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
    EVENT: '⚡️',
  },
  inngestEngine: inngestTestEngine,
  PAYMENT_PROCESSING_TIMEOUT: 5000,
  cleanupAfterEach: true,
  TEST_USER_ID: '123456789',
  TEST_OWNER_ID: '123456789',
  TEST_BOT_NAME: process.env.TEST_BOT_NAME || 'neuro_blogger_bot',
  TEST_IMAGE_URL: 'https://example.com/test.jpg',
  TEST_TELEGRAM_ID: process.env.TEST_TELEGRAM_ID || '144022504',
  cleanupAfterTests: true,
  maxWaitTime: 10000,
  eventBufferSize: 200,
  api: {
    url: process.env.API_URL || 'http://localhost:2999',
    webhookPath: '/webhooks/replicate',
    bflWebhookPath: '/webhooks/bfl',
  },
  inngest: {
    eventKey: getEnvVar('INNGEST_EVENT_KEY'),
    signingKey: getEnvVar('INNGEST_SIGNING_KEY'),
    baseUrl: getEnvVar('INNGEST_BASE_URL'),
  },
  models: {
    neurophoto: {
      name: 'neurophoto',
      version: '1.0.0',
    },
  },
  bflWebhookPath: '/api/bfl/webhook',
}

// Экспорт для использования в тестах
export default TEST_CONFIG
