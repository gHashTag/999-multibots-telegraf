/**
 * Конфигурация для тестирования различных компонентов системы
 */

import { logger } from '@/utils/logger'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'

// Импорт из локального файла, а не из пакета
import { InngestTestEngine } from './inngest-test-engine'
import { paymentProcessor } from '@/inngest-functions/paymentProcessor'

// Создаем моки для тестов без использования jest
// Мок телеграм бота для тестов
const mockTelegram = {
  sendMessage: async () => ({}),
  editMessageText: async () => ({}),
  sendPhoto: async () => ({}),
  sendVideo: async () => ({}),
  sendAnimation: async () => ({}),
}

// Мок бота для тестирования
const mockBot = {
  telegram: mockTelegram,
  use: () => Promise.resolve(mockBot),
  command: () => Promise.resolve(mockBot),
  action: () => Promise.resolve(mockBot),
  on: () => Promise.resolve(mockBot),
  options: {},
  context: {},
  webhookFilter: () => true,
  handleError: () => Promise.resolve(),
  // Дополнительные необходимые поля для Telegraf
  telegram_response: {},
  botInfo: {
    id: 123456789,
    is_bot: true,
    first_name: 'Test Bot',
    username: 'test_bot',
    can_join_groups: true,
    can_read_all_group_messages: true,
    supports_inline_queries: true,
  },
  secretPathComponent: () => '',
  launch: () => Promise.resolve({ stopPolling: () => Promise.resolve() }),
  stop: () => Promise.resolve({}),
  catch: () => mockBot,
  startPolling: () => Promise.resolve({}),
  startWebhook: () => Promise.resolve({}),
  handleUpdate: () => Promise.resolve({}),
  login: () => '',
} as unknown as Telegraf<MyContext>

// Создаем тестовый движок Inngest с правильными параметрами
export const inngestTestEngine = new InngestTestEngine({
  maxWaitTime: 10000,
  eventBufferSize: 200,
})

export interface TestResult {
  success: boolean
  name: string
  message?: string
  error?: string
  details?: Record<string, any>
}

export const TEST_CONFIG = {
  // Моки для тестирования
  mockBot: { telegram: mockTelegram },
  mocks: { bot: mockBot },

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
      id: 123456789,
      username: 'test_user',
      is_bot: false,
      first_name: 'Test',
      last_name: 'User',
      telegramId: '123456789',
      botName: 'test_bot',
      isRussian: true,
    },
    default: {
      id: 987654321,
      username: 'default_user',
      is_bot: false,
      first_name: 'Default',
      last_name: 'User',
    },
  },

  // Тестовые боты
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

  // Тестовые данные для обучения моделей
  modelTraining: {
    samples: [
      {
        prompt: 'Test prompt 1',
        negative_prompt: 'Test negative prompt 1',
        image_url: 'https://example.com/test1.jpg',
      },
      {
        prompt: 'Test prompt 2',
        negative_prompt: 'Test negative prompt 2',
        image_url: 'https://example.com/test2.jpg',
      },
    ],
  },

  // Тестовые данные для BFL обучения
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

  // Тестовые данные для neurophoto
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

  // Тестовые данные для платежей
  payments: {
    success: {
      amount: 100,
      inv_id: 'test_payment_123',
      sign: 'test_sign_123',
    },
    error: {
      amount: -1,
      inv_id: 'error_payment_123',
      sign: 'error_sign_123',
    },
  },

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
  },

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

  // Тестовые константы
  CHECK_INTERVAL: 1000,
}

// Экспорт для использования в тестах
export default TEST_CONFIG
