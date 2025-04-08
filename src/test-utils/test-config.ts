import { testLogger } from './logger'
import { InngestTestEngine } from './inngest-test-engine'
import { Telegraf, Context } from 'telegraf'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { logger } from '@/utils/logger'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'
import { getUserBalance } from '@/core/supabase'
import { supabase } from '@/core/supabase'

// Определяем базовые типы
export interface MyContext extends Context {
  session?: any
}

// Определяем необходимые перечисления
export enum PAYMENT_STATUS {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum PAYMENT_METHOD {
  CRYPTO = 'CRYPTO',
  CARD = 'CARD',
  SYSTEM = 'SYSTEM',
  TEST = 'TEST',
}

// Определяем интерфейсы для событий
export interface BaseEventData {
  telegram_id: string
  bot_name: string
  [key: string]: any
}

export interface PaymentEventData extends BaseEventData {
  amount: number
  type: string
  description: string
  cost_per_image?: number
  is_ru?: boolean
  operation_id?: string
  service_type?: string
  metadata?: Record<string, any>
}

export interface ImageProcessEventData extends BaseEventData {
  event_id: string
  event_name: string
  event_data: Record<string, any>
}

export interface ImageToPromptEventData extends BaseEventData {
  image: string
  cost_per_image: number
  is_ru: boolean
}

export interface InngestEvent<T extends BaseEventData> {
  id: string
  name: string
  data: T
}

// Определяем мок для Telegram
export const TelegramMock = {
  sendMessage: jest.fn(),
  sendPhoto: jest.fn(),
  sendVideo: jest.fn(),
}

export const TEST_CONFIG = {
  logger: testLogger,
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
      id: 123456789,
      telegram_id: '123456789',
      username: 'test_user',
      first_name: 'Test',
      last_name: 'User',
      language_code: 'ru',
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
  TEST_USER_ID: '123456789',
  TEST_BOT_NAME: 'test_bot',
  TEST_TELEGRAM_ID: '123456789',
  TEST_IMAGE_URL: 'https://example.com/test-image.jpg',
  TEST_VOICE_ID: 'pNInz6obpgDQGcFmaJgB',
  IMAGE_TO_PROMPT_COST: 30,
  VOICE_GENERATION_COST: 50,
  PAYMENT_PROCESSING_TIMEOUT: 5000,
  inngestEngine: new InngestTestEngine(),
  models: {
    default: 'test-model',
    stable: 'stable-model',
    neurophoto: {
      name: 'neurophoto-model',
    },
  },
  cleanupAfterEach: true,
  CLEANUP_TEST_DATA: true,
  modelTraining: [
    {
      id: 'test-training-1',
      name: 'Test Training 1',
      description: 'Test training description',
      status: 'COMPLETED' as const,
    },
  ],
  CHECK_INTERVAL: 1000,
  TIMEOUT: 30000,
  endpoints: {
    payment: 'http://localhost:3000/api/payment',
    generate: 'http://localhost:3000/api/generate',
    check: 'http://localhost:3000/api/check',
  },
  prompts: {
    test: 'Test prompt for image generation',
  },
  bot_name: 'test_bot',
  test_user_id: '123456789',
  timeouts: {
    short: 1000,
    medium: 5000,
    long: 15000,
  },
  retries: {
    max: 3,
    delay: 1000,
  },
  testUserId: '123456789',
  testBotName: 'test_bot',
} as const

export interface TestResult {
  success: boolean
  message: string
  name: string
  error?: Error
  data?: any
}

export type TestConfig = typeof TEST_CONFIG

/** Интерфейс для конфигурации платежа */
export interface PaymentConfig {
  status: PAYMENT_STATUS
  method: PAYMENT_METHOD
  amount: number
}

/**
 * Тестовый движок Inngest для обработки событий
 * Настроен с таймаутом 10 секунд и буфером на 200 событий
 */
export const inngestTestEngine = new InngestTestEngine({
  maxWaitTime: 10000,
  eventBufferSize: 200,
})

/**
 * Регистрация обработчика платежей для тестового окружения
 * Создает записи в таблице payments_v2 со статусом COMPLETED
 */
inngestTestEngine.register(
  'payment/process',
  async ({ event }: { event: InngestEvent<PaymentEventData> }) => {
    try {
      logger.info('🚀 Обработка платежа в тестовом окружении', {
        description: 'Processing payment in test environment',
        event_id: event.id,
        event_data: event.data,
      })

      // Нормализуем telegram_id
      const normalizedTelegramId = normalizeTelegramId(event.data.telegram_id)

      logger.info('📝 Подготовка данных для создания платежа', {
        description: 'Preparing payment data',
        normalized_telegram_id: normalizedTelegramId,
        amount: event.data.amount,
        type: event.data.type,
        payment_description: event.data.description,
        bot_name: event.data.bot_name,
        inv_id: event.data.inv_id,
        service_type: event.data.service_type || ModeEnum.TopUpBalance,
      })

      // Проверяем баланс для списания
      if (event.data.type === 'money_expense') {
        const currentBalance = await getUserBalance(event.data.telegram_id)

        logger.info('💰 Проверка баланса перед списанием', {
          description: 'Checking balance before withdrawal',
          telegram_id: event.data.telegram_id,
          current_balance: currentBalance,
          required_amount: event.data.amount,
        })

        if (currentBalance < event.data.amount) {
          logger.error('❌ Недостаточно средств для списания', {
            description: 'Insufficient funds for withdrawal',
            telegram_id: event.data.telegram_id,
            current_balance: currentBalance,
            required_amount: event.data.amount,
          })

          // Создаем запись о неудачной попытке списания
          const { error: insertError } = await supabase
            .from('payments_v2')
            .insert({
              telegram_id: normalizedTelegramId,
              payment_date: new Date().toISOString(),
              amount: event.data.amount,
              description: event.data.description,
              stars: event.data.amount,
              currency: 'STARS',
              subscription: 'none',
              inv_id: event.data.inv_id,
              status: 'FAILED',
              type: event.data.type,
              service_type: event.data.service_type,
              bot_name: event.data.bot_name,
              language: 'ru',
              payment_method: 'test',
            })

          if (insertError) {
            logger.error('❌ Ошибка при создании записи о неудачном платеже', {
              description: 'Error creating failed payment record',
              error: insertError.message,
            })
          }

          return {
            success: false,
            error: 'Insufficient funds',
          }
        }
      }

      // Создаем запись об успешном платеже
      const { data, error } = await supabase
        .from('payments_v2')
        .insert({
          telegram_id: normalizedTelegramId,
          amount: event.data.amount,
          stars: event.data.amount,
          type: event.data.type,
          description: event.data.description,
          bot_name: event.data.bot_name,
          status: PAYMENT_STATUS.COMPLETED,
          payment_method: PAYMENT_METHOD.TEST,
          inv_id: event.data.inv_id,
          service_type: event.data.service_type || ModeEnum.TopUpBalance,
        })
        .select()

      if (error) {
        logger.error('❌ Ошибка при создании платежа', {
          description: 'Error creating payment',
          error: error.message,
          details: error.details,
          hint: error.hint,
        })
        throw error
      }

      logger.info('✅ Платеж успешно создан', {
        description: 'Payment created successfully',
        event_id: event.id,
        telegram_id: normalizedTelegramId,
        amount: event.data.amount,
        payment_data: data?.[0],
      })

      return { success: true, payment: data?.[0] }
    } catch (error) {
      logger.error('❌ Ошибка при обработке платежа', {
        description: 'Error processing payment',
        error: error instanceof Error ? error.message : String(error),
        event_id: event.id,
      })
      throw error
    }
  }
)

// Регистрируем обработчик для image/process
inngestTestEngine.register(
  'image/process',
  async ({ event }: { event: InngestEvent<ImageProcessEventData> }) => {
    try {
      logger.info('🖼️ Обработка запроса на анализ изображения', {
        description: 'Processing image analysis request',
        event_id: event.id,
        event_data: event.data,
      })

      // Создаем запись в таблице events
      const { error: eventError } = await supabase.from('events').insert({
        id: event.data.event_id,
        telegram_id: event.data.telegram_id,
        bot_name: event.data.bot_name,
        event_name: event.name,
        event_data: event.data,
        status: 'completed',
        created_at: new Date().toISOString(),
      })

      if (eventError) {
        logger.error('❌ Ошибка при создании записи о событии', {
          description: 'Error creating event record',
          error: eventError.message,
          event_id: event.data.event_id,
        })
        throw eventError
      }

      logger.info('✅ Запись о событии создана', {
        description: 'Event record created',
        event_id: event.data.event_id,
      })

      return { success: true }
    } catch (error) {
      logger.error('❌ Ошибка при обработке запроса на анализ изображения', {
        description: 'Error processing image analysis request',
        error: error instanceof Error ? error.message : String(error),
        event_id: event.id,
      })
      throw error
    }
  }
)

// Регистрируем обработчик для image/to-prompt.generate
inngestTestEngine.register(
  'image/to-prompt.generate',
  async ({ event }: { event: InngestEvent<ImageToPromptEventData> }) => {
    try {
      logger.info('🚀 Начало обработки запроса на генерацию промпта', {
        description: 'Starting prompt generation request',
        event_id: event.id,
        event_data: event.data,
      })

      // Отправляем событие в централизованный процессор платежей
      const payment_operation_id = `image-to-prompt-${
        event.data.telegram_id
      }-${Date.now()}`
      await inngestTestEngine.send({
        name: 'payment/process',
        data: {
          telegram_id: event.data.telegram_id,
          amount: event.data.cost_per_image,
          is_ru: event.data.is_ru,
          bot_name: event.data.bot_name,
          type: 'money_expense',
          description: 'Payment for image to prompt conversion',
          operation_id: payment_operation_id,
          service_type: ModeEnum.ImageToPrompt,
          metadata: {
            service_type: ModeEnum.ImageToPrompt,
            image_url: event.data.image,
          },
        },
      })

      logger.info('✅ Запрос на генерацию промпта обработан', {
        description: 'Prompt generation request processed',
        event_id: event.id,
        telegram_id: event.data.telegram_id,
      })

      return { success: true }
    } catch (error) {
      logger.error('❌ Ошибка при обработке запроса на генерацию промпта', {
        description: 'Error processing prompt generation request',
        error: error instanceof Error ? error.message : String(error),
        event_id: event.id,
      })
      throw error
    }
  }
)
