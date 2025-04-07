import { Context } from 'telegraf'

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
  error?: string
  duration?: number
  name: string
  message?: string
  details?: string
}

export interface BotInfo {
  id: number
  is_bot: boolean
  first_name: string
  username: string
  can_join_groups: boolean
  can_read_all_group_messages: boolean
  supports_inline_queries: boolean
}

export interface TestUser {
  id: number
  username: string
  is_bot: boolean
  first_name: string
  last_name: string
  telegramId?: string
  botName?: string
  isRussian?: boolean
}

export interface TestBot {
  name: string
  token: string
}

export interface ModelTrainingSample {
  trainingId: string
  status: string
  metrics: {
    predict_time: number
  }
}

export interface BFLTrainingSample {
  text: string
  image_url: string
}

export interface NeuroPhotoSample {
  url: string
  prompt: string
  task_id?: string
  status?: string
  result?: any
}

export interface PaymentSample {
  amount: number
  inv_id: string
  sign: string
}

export interface TestEmoji {
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

export interface TestConfig {
  mockBot: {
    telegram: any
  }
  mocks: {
    bot: any
  }
  server: {
    apiUrl: string
    webhookPath: string
    bflWebhookPath: string
    neurophotoWebhookPath: string
  }
  users: {
    main: {
      telegramId: string
      username: string
      firstName: string
      lastName: string
      botName: string
      isRussian: boolean
    }
  }
  supabase: {
    url: string
    key: string
  }
  bots: {
    [key: string]: TestBot
  }
  modelTraining: {
    samples: ModelTrainingSample[]
  }
  bflTraining: {
    samples: BFLTrainingSample[]
  }
  neurophoto: {
    samples: NeuroPhotoSample[]
  }
  payments: {
    success: PaymentSample
    fail: PaymentSample
  }
  CHECK_INTERVAL: number
  TIMEOUT: number
  RETRY_ATTEMPTS: number
  RETRY_DELAY: number
  LOG_LEVEL: string
  EMOJI: TestEmoji
  inngestEngine: any
  PAYMENT_PROCESSING_TIMEOUT: number
  cleanupAfterEach: boolean
  TEST_USER_ID: string
  TEST_OWNER_ID: string
  TEST_BOT_NAME: string
  TEST_IMAGE_URL: string
  TEST_TELEGRAM_ID: string
  cleanupAfterTests: boolean
  maxWaitTime: number
  eventBufferSize: number
  api: {
    url: string
    webhookPath: string
    bflWebhookPath: string
  }
  inngest: {
    eventKey: string
    signingKey: string
    baseUrl: string
  }
  bflWebhookPath: string
  models: {
    neurophoto: {
      name: string
      version: string
    }
  }
}
