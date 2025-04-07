import { Telegraf } from 'telegraf'
import { Context } from 'telegraf'

/** Расширенный контекст для бота */
export interface MyContext extends Context {
  session: any
}

/**
 * Мок-контекст для тестирования Telegraf
 */
export interface MockContext {
  from?: any
  message?: any
  chat?: any
  reply: (text: string) => Promise<any>
  replyWithHTML: (text: string) => Promise<any>
  replyWithMarkdown: (text: string) => Promise<any>
  deleteMessage: (messageId: number) => Promise<boolean>
  editMessageText: (text: string, extra?: any) => Promise<any>
  editMessageReplyMarkup: (markup: any) => Promise<any>
  answerCallbackQuery: (text?: string) => Promise<boolean>
  session: any
}

/**
 * Интерфейс для результатов тестов
 */
export interface TestResult {
  success: boolean
  message: string
  name: string
  error?: Error
}

export interface BotInfo {
  id: string
  name: string
  token: string
  webhook_url: string
  can_join_groups: boolean
  can_read_all_group_messages: boolean
  supports_inline_queries: boolean
}

export interface TestUser {
  id: number
  telegram_id: string
  username?: string
  first_name?: string
  last_name?: string
  language_code?: string
  isRussian?: boolean
}

export interface TestBot {
  name: string
  token: string
}

export interface ModelTrainingSample {
  id: string
  name: string
  description: string
  status: string
}

export interface BFLTrainingSample {
  id: string
  name: string
  description: string
  status: string
}

export interface NeuroPhotoSample {
  id: string
  name: string
  description: string
  status: string
}

export interface PaymentSample {
  id: string
  amount: number
  status: string
}

export interface TestEmoji {
  success: string
  error: string
  warning: string
  info: string
}

/** Конфигурация бота */
export interface BotConfig {
  name: string
  token: string
}

/** Статусы тренировки */
export type TrainingStatusType =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED'

export const TRAINING_STATUS: Record<TrainingStatusType, TrainingStatusType> = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
} as const

/** Конфигурация тренировки модели */
export interface TrainingConfig {
  id: string
  name: string
  description: string
  status: TrainingStatusType
}

export interface TestConfig {
  /** Конфигурация мок-бота */
  mockBot: {
    telegram: any
  }
  /** Моки для тестирования */
  mocks: {
    bot: Telegraf<MyContext>
  }
  /** Конфигурация сервера */
  server: {
    apiUrl: string
    webhookPath: string
    bflWebhookPath: string
    neurophotoWebhookPath: string
  }
  /** Тестовые пользователи */
  users: {
    main: TestUser
  }
  /** Конфигурация Supabase */
  supabase: {
    url: string
    key: string
  }
  /** Конфигурация ботов */
  bots: {
    test_bot: BotConfig
    neurophoto: BotConfig
    default: BotConfig
  }
  /** Тестовые константы */
  TEST_USER_ID: string
  TEST_BOT_NAME: string
  TEST_TELEGRAM_ID: string
  TEST_IMAGE_URL: string
  PAYMENT_PROCESSING_TIMEOUT: number
  inngestEngine: any
  models: {
    default: string
    stable: string
  }
  cleanupAfterEach: boolean
  /** Тестовые тренировки моделей */
  modelTraining: TrainingConfig[]
  CHECK_INTERVAL: number
  TIMEOUT: number
  endpoints: {
    payment: string
    generate: string
    check: string
  }
}
