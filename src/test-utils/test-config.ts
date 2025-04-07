/**
 * Конфигурация для тестирования различных компонентов системы
 */

import { logger } from '@/utils/logger'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'

// Импорт из локального файла, а не из пакета
import { InngestTestEngine } from './inngest-test-engine'
import { paymentProcessor } from '@/inngest-functions/paymentProcessor'

// Интерфейсы для тестовых данных
interface TelegramMock {
  sendMessage: () => Promise<Record<string, unknown>>
  editMessageText: () => Promise<Record<string, unknown>>
  sendPhoto: () => Promise<Record<string, unknown>>
  sendVideo: () => Promise<Record<string, unknown>>
  sendAnimation: () => Promise<Record<string, unknown>>
}

interface BotInfo {
  id: number
  is_bot: boolean
  first_name: string
  username: string
  can_join_groups: boolean
  can_read_all_group_messages: boolean
  supports_inline_queries: boolean
}

interface BotMock {
  telegram: TelegramMock
  use: () => Promise<BotMock>
  command: () => Promise<BotMock>
  action: () => Promise<BotMock>
  on: () => Promise<BotMock>
  options: Record<string, unknown>
  context: Record<string, unknown>
  webhookFilter: () => boolean
  handleError: () => Promise<void>
  telegram_response: Record<string, unknown>
  botInfo: BotInfo
  secretPathComponent: () => string
  launch: () => Promise<{ stopPolling: () => Promise<void> }>
  stop: () => Promise<Record<string, unknown>>
  catch: () => BotMock
  startPolling: () => Promise<Record<string, unknown>>
  startWebhook: () => Promise<Record<string, unknown>>
  handleUpdate: () => Promise<Record<string, unknown>>
  login: () => string
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
  prompt: string
  negative_prompt: string
  image_url: string
}

interface BFLTrainingSample {
  text: string
  image_url: string
}

interface NeuroPhotoSample {
  url: string
  prompt: string
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

// Интерфейс для результатов тестов
export interface TestResult {
  success: boolean
  name: string
  message?: string
  error?: string
  details?: Record<string, unknown>
}

// Создаем моки для тестов без использования jest
// Мок телеграм бота для тестов
const mockTelegram: TelegramMock = {
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
} as unknown as Telegraf<MyContext>

// Создаем тестовый движок Inngest с правильными параметрами
export const inngestTestEngine = new InngestTestEngine({
  maxWaitTime: 10000,
  eventBufferSize: 200,
})

// Регистрируем функцию paymentProcessor
inngestTestEngine.register('payment/process', paymentProcessor)

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
    } as TestUser,
    default: {
      id: 987654321,
      username: 'default_user',
      is_bot: false,
      first_name: 'Default',
      last_name: 'User',
    } as TestUser,
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
        prompt: 'Test prompt 1',
        negative_prompt: 'Test negative prompt 1',
        image_url: 'https://example.com/test1.jpg',
      } as ModelTrainingSample,
      {
        prompt: 'Test prompt 2',
        negative_prompt: 'Test negative prompt 2',
        image_url: 'https://example.com/test2.jpg',
      } as ModelTrainingSample,
    ],
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
    error: {
      amount: -1,
      inv_id: 'error_payment_123',
      sign: 'error_sign_123',
    } as PaymentSample,
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

  // Тестовые константы
  CHECK_INTERVAL: 1000,
}

// Экспорт для использования в тестах
export default TEST_CONFIG
