import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import { sendTransactionNotificationTest } from '@/helpers/sendTransactionNotification'
import {
  getUserBalance,
  invalidateBalanceCache,
} from '@/core/supabase/getUserBalance'
import { v4 as uuidv4 } from 'uuid'
import { TransactionType } from '@/interfaces/payments.interface'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'
import { notifyAmbassadorAboutPayment } from '@/services/ambassadorPaymentNotifier'
import { SubscriptionType } from '@/interfaces/subscription.interface'

/**
 * Параметры для обработки платежа
 */
export interface PaymentProcessParams {
  /** ID пользователя в Telegram (обязательно) */
  telegram_id: string

  /** Сумма операции (ВСЕГДА положительное число) */
  amount: number

  /** Тип транзакции из TransactionType */
  type: TransactionType | string

  /** Описание транзакции */
  description: string

  /** Название бота, который инициировал транзакцию */
  bot_name: string

  /** Тип сервиса из ModeEnum */
  service_type: ModeEnum

  /** Количество звезд (опционально) */
  stars?: number

  /** ID инвойса (опционально) */
  inv_id?: string

  /** Код ошибки от платежной системы (опционально) */
  error_code?: string

  /** Дополнительные метаданные платежа (опционально) */
  metadata?: Record<string, any>

  /** Тип подписки из SubscriptionType */
  subscription?: SubscriptionType
}

/**
 * Нормализует тип транзакции в нижний регистр
 */
function normalizeTransactionType(type: TransactionType | string): string {
  return type.toLowerCase()
}

/**
 * Интерфейс события обработки платежа
 */
export interface PaymentProcessEvent {
  name: 'payment/process'
  data: PaymentProcessParams
}

/**
 * Результат обработки платежа
 */
export interface PaymentProcessResult {
  success: boolean
  payment?: {
    payment_id: number
    telegram_id: string
    amount: number
    stars: number
    type: string
    status: string
  }
  balanceChange?: {
    before: number
    after: number
    difference: number
  }
  operation_id?: string
  error?: string
  telegram_id?: string
  amount?: number
  type?: string
}

/**
 * Отправляет уведомление пользователю о платеже
 *
 * @param payment Данные платежа
 * @param currentBalance Текущий баланс до операции
 * @param newBalance Новый баланс после операции
 */
async function sendPaymentNotification(
  payment: any,
  currentBalance: number,
  newBalance: number
): Promise<void> {
  logger.info('📨 Отправка уведомления пользователю', {
    description: 'Sending notification to user',
    telegram_id: normalizeTelegramId(payment.telegram_id),
    amount: payment.amount,
    paymentId: payment.id,
  })

  await sendTransactionNotificationTest({
    telegram_id: Number(normalizeTelegramId(payment.telegram_id)),
    operationId: payment.operation_id || uuidv4(),
    amount: payment.amount,
    currentBalance,
    newBalance,
    description: payment.description,
    isRu: true,
    bot_name: payment.bot_name,
  })
}

/**
 * Обработка ошибок Robokassa
 * @param errorCode Код ошибки
 * @returns Описание ошибки
 */
function handleRobokassaError(errorCode: string): string {
  const errorMessages: Record<string, string> = {
    '31': 'Неверная сумма платежа',
    '33': 'Время отведённое на оплату счёта истекло',
    '40': 'Повторная оплата счета с тем же номером невозможна',
    '41': 'Ошибка на старте операции',
    '51': 'Срок оплаты счета истек',
    '52': 'Попытка повторной оплаты счета',
    '53': 'Счет не найден',
  }

  return errorMessages[errorCode] || 'Неизвестная ошибка'
}

/**
 * Централизованный процессор платежей через Inngest
 * Выполняет все операции с балансом пользователя
 */
export const paymentProcessor = inngest.createFunction(
  {
    id: 'payment-processor',
    name: 'Payment Processor',
    retries: 3,
  },
  { event: 'payment/process' },
  async ({ event, step }) => {
    const {
      telegram_id,
      amount,
      type,
      description,
      bot_name,
      service_type,
      stars,
      inv_id,
      error_code,
      metadata,
      subscription,
    } = event.data as PaymentProcessParams

    if (amount <= 0) {
      throw new Error(`Invalid payment amount: ${amount}`)
    }

    const normalizedType = normalizeTransactionType(type)

    logger.info('🚀 Начало обработки платежа', {
      description: 'Starting payment processing',
      telegram_id: normalizeTelegramId(telegram_id),
      amount,
      type: normalizedType,
      bot_name,
      service_type,
    })

    try {
      // Получаем текущий баланс
      const currentBalance = await step.run('get-balance', async () => {
        logger.info('💰 Получение текущего баланса', {
          description: 'Getting current balance',
          telegram_id: normalizeTelegramId(telegram_id),
        })
        return getUserBalance(normalizeTelegramId(telegram_id))
      })

      // Проверяем баланс для списания
      if (normalizedType === TransactionType.MONEY_EXPENSE) {
        logger.info('💰 Проверка баланса для списания', {
          description: 'Checking balance for expense',
          telegram_id: normalizeTelegramId(telegram_id),
          currentBalance,
          amount,
        })

        if (currentBalance < amount) {
          throw new Error(
            `Недостаточно средств. Баланс: ${currentBalance}, требуется: ${amount}`
          )
        }
      }

      // Проверяем ошибку от Robokassa
      if (error_code) {
        const errorMessage = handleRobokassaError(error_code)
        logger.error('❌ Ошибка Robokassa:', {
          description: 'Robokassa error',
          error_code: error_code,
          error_message: errorMessage,
          inv_id: inv_id,
        })

        // Обновляем статус платежа в случае ошибки
        if (inv_id) {
          await supabase
            .from('payments_v2')
            .update({
              status: 'FAILED',
              metadata: {
                ...metadata,
                error_code: error_code,
                error_message: errorMessage,
              },
            })
            .eq('inv_id', inv_id)
        }

        throw new Error(errorMessage)
      }

      // Создаем запись о платеже
      const payment = await step.run('Create successful payment', async () => {
        logger.info('💳 Создание записи о платеже', {
          description: 'Creating payment record',
          telegram_id: normalizeTelegramId(telegram_id),
          amount,
          type: normalizedType,
        })

        try {
          return await createSuccessfulPayment({
            telegram_id,
            amount,
            type: normalizedType,
            description,
            bot_name,
            service_type,
            stars,
            inv_id: inv_id || '',
            metadata,
            subscription,
          })
        } catch (error) {
          // Проверяем, является ли ошибка дубликатом платежа
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === '23505'
          ) {
            logger.info(
              '🔄 Обнаружен дубликат платежа, получаем существующий платеж',
              {
                description:
                  'Duplicate payment detected, retrieving existing payment',
                telegram_id: normalizeTelegramId(telegram_id),
                inv_id: inv_id,
              }
            )

            // Получаем существующий платеж
            const { data: existingPayment } = await supabase
              .from('payments_v2')
              .select('*')
              .eq('inv_id', inv_id)
              .single()

            if (!existingPayment) {
              throw new Error('Не удалось найти существующий платеж')
            }

            logger.info('✅ Возвращаем существующий платеж', {
              description: 'Returning existing payment',
              payment_id: existingPayment.id,
              telegram_id: normalizeTelegramId(telegram_id),
              inv_id: inv_id,
            })

            return existingPayment
          }
          throw error
        }
      })

      // Инвалидируем кэш баланса и получаем новый баланс
      const newBalance = await step.run('get-new-balance', async () => {
        // Сначала инвалидируем кэш баланса, чтобы получить свежие данные
        logger.info('🔄 Инвалидация кэша баланса:', {
          description: 'Invalidating balance cache',
          telegram_id: normalizeTelegramId(telegram_id),
        })
        invalidateBalanceCache(normalizeTelegramId(telegram_id))

        // Теперь получаем обновленный баланс
        return getUserBalance(normalizeTelegramId(telegram_id))
      })

      // Отправляем уведомление пользователю (только если не локальное окружение)
      await step.run('send-notification', async () => {
        await sendPaymentNotification(payment, currentBalance, newBalance)
      })

      // Отправляем уведомление амбассадору, если платеж совершен в его боте
      await step.run('send-ambassador-notification', async () => {
        try {
          if (payment.bot_name) {
            const hasAmbassador = await notifyAmbassadorAboutPayment(payment)

            if (hasAmbassador) {
              logger.info('✅ Уведомление для амбассадора отправлено', {
                description: 'Ambassador notification sent successfully',
                paymentId: payment.id,
                botName: payment.bot_name,
              })
            }
          }
        } catch (error: any) {
          // Логируем ошибку, но не прерываем обработку платежа
          logger.error('❌ Ошибка при отправке уведомления амбассадору', {
            description: 'Error sending notification to ambassador',
            error: error.message,
            stack: error.stack,
            paymentId: payment.id,
            botName: payment.bot_name || 'unknown',
          })
        }
      })

      return {
        success: true,
        payment: {
          payment_id: payment.id,
          telegram_id: normalizeTelegramId(telegram_id),
          amount,
          stars: stars || amount,
          type: normalizedType,
          status: 'COMPLETED',
        },
        balanceChange: {
          before: currentBalance,
          after: newBalance,
          difference: newBalance - currentBalance,
        },
        operation_id: inv_id,
      }
    } catch (error) {
      logger.error('❌ Ошибка обработки платежа:', {
        description: 'Error processing payment',
        error: error instanceof Error ? error.message : String(error),
        telegram_id: normalizeTelegramId(telegram_id),
        amount,
        type: normalizedType,
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        telegram_id: normalizeTelegramId(telegram_id),
        amount,
        type: normalizedType,
      }
    }
  }
)

/**
 * Типы подписок, доступные для оплаты
 */
export type PaymentSubscription =
  | 'NEUROPHOTO'
  | 'NEUROBASE'
  | 'NEUROBLOGGER'
  | 'NEUROTESTER'

/**
 * Проверяет, является ли подписка допустимой для оплаты
 */
export function isValidPaymentSubscription(
  subscription: SubscriptionType | undefined
): subscription is SubscriptionType {
  if (!subscription) return false
  return (
    subscription === SubscriptionType.NEUROPHOTO ||
    subscription === SubscriptionType.NEUROBASE ||
    subscription === SubscriptionType.NEUROBLOGGER ||
    subscription === SubscriptionType.NEUROTESTER
  )
}

/**
 * Статусы платежа
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}

/**
 * Результат операции с балансом
 */
export interface BalanceOperationResult {
  newBalance: number
  success: boolean
  modePrice: number
  error?: string
}

/**
 * Платежные системы
 */
export type PaymentMethod =
  | 'Telegram'
  | 'Robokassa'
  | 'System'
  | 'Unknown'
  | 'Manual'

/**
 * Объединенный тип сервиса
 */
export type PaymentService = ModeEnum | PaymentMethod

/**
 * Базовая структура платежа в системе
 */
export interface BasePayment {
  payment_id: number
  telegram_id: string
  payment_date: Date
  amount: number
  description: string
  metadata: Record<string, any>
  stars: number
  currency: string
  subscription: string
  inv_id: string
  email?: string
  invoice_url?: string
  status: PaymentStatus
  type: TransactionType
  service_type: ModeEnum
  operation_id?: string
  bot_name: string
  language?: string
  payment_method: PaymentMethod
}

/**
 * Параметры для создания платежа
 */
export interface CreatePaymentDTO {
  telegram_id: string | number
  amount: number
  stars: number
  currency: string
  description: string
  metadata?: Record<string, any>
  payment_method: PaymentMethod
  bot_name: string
  inv_id?: string
  status: PaymentStatus
  email?: string
  subscription?: PaymentSubscription
  language?: string
  invoice_url?: string
  type: TransactionType
  service_type: ModeEnum
}

/**
 * Полная структура платежа, включая все поля
 */
export type Payment = BasePayment

/**
 * Описания для каждого типа транзакции
 */
export const TRANSACTION_DESCRIPTIONS: Record<TransactionType, string> = {
  [TransactionType.MONEY_INCOME]: '💰 Пополнение баланса',
  [TransactionType.MONEY_EXPENSE]: '💸 Списание средств',
  [TransactionType.SUBSCRIPTION_PAYMENT]: '⭐️ Оплата подписки',
  [TransactionType.SUBSCRIPTION_PURCHASE]: '⭐️ Покупка подписки',
  [TransactionType.SUBSCRIPTION_RENEWAL]: '🔄 Продление подписки',
  [TransactionType.REFUND]: '↩️ Возврат средств',
  [TransactionType.BONUS]: '🎁 Бонусное начисление',
  [TransactionType.REFERRAL]: '👥 Реферальное начисление',
  [TransactionType.TRANSFER]: '💫 Перевод средств',
  [TransactionType.SYSTEM]: '⚙️ Системная операция',
}

/**
 * Детальные описания для каждого типа транзакции
 */
export const DETAILED_TRANSACTION_DESCRIPTIONS: Record<
  string,
  Record<string, string>
> = {
  [TransactionType.MONEY_INCOME]: {
    [ModeEnum.NeuroPhoto]: '🖼️ Пополнение баланса для генерации изображений',
    [ModeEnum.TextToSpeech]: '🗣️ Пополнение баланса для озвучки текста',
    [ModeEnum.ImageToVideo]: '🎬 Пополнение баланса для создания видео',
    [ModeEnum.TextToImage]:
      '🖼️ Пополнение баланса для создания изображения из текста',
    [ModeEnum.DigitalAvatarBody]: '🎭 Пополнение баланса для создания аватара',
    [ModeEnum.DigitalAvatarBodyV2]:
      '🎭 Пополнение баланса для создания аватара V2',
    [ModeEnum.ChatWithAvatar]: '💬 Пополнение баланса для чата с аватаром',
    [ModeEnum.LipSync]: '👄 Пополнение баланса для синхронизации губ',
    [ModeEnum.Voice]: '🗣️ Пополнение баланса для голосового аватара',
    [ModeEnum.TextToVideo]:
      '🎬 Пополнение баланса для создания видео из текста',
    [ModeEnum.ImageToPrompt]: '🔍 Пополнение баланса для анализа изображения',
    default: '💰 Пополнение баланса',
  },
  [TransactionType.MONEY_EXPENSE]: {
    [ModeEnum.NeuroPhoto]: '🖼️ Генерация изображений',
    [ModeEnum.TextToSpeech]: '🗣️ Преобразование текста в речь',
    [ModeEnum.ImageToVideo]: '🎬 Создание видео',
    [ModeEnum.TextToImage]: '🖼️ Создание изображения из текста',
    [ModeEnum.DigitalAvatarBody]: '🎭 Создание аватара',
    [ModeEnum.DigitalAvatarBodyV2]: '🎭 Создание аватара V2',
    [ModeEnum.ChatWithAvatar]: '💬 Чат с аватаром',
    [ModeEnum.LipSync]: '👄 Синхронизация губ',
    [ModeEnum.Voice]: '🗣️ Голосовой аватар',
    [ModeEnum.TextToVideo]: '🎬 Создание видео из текста',
    [ModeEnum.ImageToPrompt]: '🔍 Анализ изображения',
    default: '💸 Списание средств',
  },
  subscription_purchase: {
    neurophoto: '⭐️ Покупка подписки NeuroPhoto',
    neurobase: '⭐️ Покупка подписки NeuroBase',
    neuroblogger: '⭐️ Покупка подписки NeuroBlogger',
    neurotester: '🧪 Тестовая подписка',
    default: '⭐️ Покупка подписки',
  },
  subscription_renewal: {
    neurophoto: '🔄 Продление подписки NeuroPhoto',
    neurobase: '🔄 Продление подписки NeuroBase',
    neuroblogger: '🔄 Продление подписки NeuroBlogger',
    neurotester: '🧪 Продление тестовой подписки',
    default: '🔄 Продление подписки',
  },
  [TransactionType.REFUND]: {
    default: '↩️ Возврат средств',
  },
  [TransactionType.BONUS]: {
    default: '🎁 Бонусное начисление',
  },
  [TransactionType.REFERRAL]: {
    default: '👥 Реферальное начисление',
  },
  [TransactionType.SYSTEM]: {
    migration: '🔄 Миграция баланса пользователя',
    default: '⚙️ Системная операция',
  },
} as const

/**
 * Ключи для описаний транзакций
 */
export const TRANSACTION_KEYS = {
  MONEY_INCOME: TransactionType.MONEY_INCOME,
  MONEY_EXPENSE: TransactionType.MONEY_EXPENSE,
  SUBSCRIPTION_PURCHASE: 'subscription_purchase',
  SUBSCRIPTION_RENEWAL: 'subscription_renewal',
  REFUND: TransactionType.REFUND,
  BONUS: TransactionType.BONUS,
  REFERRAL: TransactionType.REFERRAL,
  SYSTEM: TransactionType.SYSTEM,
} as const

/**
 * Ключи для сервисов
 */
export const SERVICE_KEYS: Record<string, ModeEnum> = {
  NEURO_PHOTO: ModeEnum.NeuroPhoto,
  TEXT_TO_SPEECH: ModeEnum.TextToSpeech,
  IMAGE_TO_VIDEO: ModeEnum.ImageToVideo,
  TEXT_TO_IMAGE: ModeEnum.TextToImage,
  DIGITAL_AVATAR_BODY: ModeEnum.DigitalAvatarBody,
  DIGITAL_AVATAR_BODY_V2: ModeEnum.DigitalAvatarBodyV2,
  CHAT_WITH_AVATAR: ModeEnum.ChatWithAvatar,
  LIP_SYNC: ModeEnum.LipSync,
  VOICE: ModeEnum.Voice,
} as const

/**
 * Ключи для подписок
 */
export const SUBSCRIPTION_KEYS = {
  NEUROPHOTO: 'neurophoto',
  NEUROBASE: 'neurobase',
  NEUROBLOGGER: 'neuroblogger',
  NEUROTESTER: 'neurotester',
} as const

/**
 * Ключи для платежных систем
 */
export const PAYMENT_METHOD_KEYS: Record<string, PaymentMethod> = {
  TELEGRAM: 'Telegram',
  ROBOKASSA: 'Robokassa',
  SYSTEM: 'System',
  UNKNOWN: 'Unknown',
  MANUAL: 'Manual',
} as const

/**
 * Маппинг команд на типы сервисов
 */
export const COMMAND_TO_SERVICE_MAP: Partial<Record<ModeEnum, ModeEnum>> = {
  [ModeEnum.NeuroPhoto]: ModeEnum.NeuroPhoto,
  [ModeEnum.NeuroPhotoV2]: ModeEnum.NeuroPhotoV2,
  [ModeEnum.TextToSpeech]: ModeEnum.TextToSpeech,
  [ModeEnum.ImageToVideo]: ModeEnum.ImageToVideo,
  [ModeEnum.TextToVideo]: ModeEnum.TextToVideo,
  [ModeEnum.TextToImage]: ModeEnum.TextToImage,
  [ModeEnum.ImageToPrompt]: ModeEnum.ImageToPrompt,
  [ModeEnum.DigitalAvatarBody]: ModeEnum.DigitalAvatarBody,
  [ModeEnum.DigitalAvatarBodyV2]: ModeEnum.DigitalAvatarBodyV2,
  [ModeEnum.ChatWithAvatar]: ModeEnum.ChatWithAvatar,
  [ModeEnum.LipSync]: ModeEnum.LipSync,
  [ModeEnum.Voice]: ModeEnum.Voice,
} as const

/**
 * Маппинг команд на типы транзакций
 */
export const COMMAND_TO_TRANSACTION_TYPE: Partial<
  Record<ModeEnum, TransactionType>
> = {
  [ModeEnum.NeuroPhoto]: TransactionType.MONEY_EXPENSE,
  [ModeEnum.NeuroPhotoV2]: TransactionType.MONEY_EXPENSE,
  [ModeEnum.TextToSpeech]: TransactionType.MONEY_EXPENSE,
  [ModeEnum.ImageToVideo]: TransactionType.MONEY_EXPENSE,
  [ModeEnum.TextToVideo]: TransactionType.MONEY_EXPENSE,
  [ModeEnum.TextToImage]: TransactionType.MONEY_EXPENSE,
  [ModeEnum.ImageToPrompt]: TransactionType.MONEY_EXPENSE,
  [ModeEnum.DigitalAvatarBody]: TransactionType.MONEY_EXPENSE,
  [ModeEnum.DigitalAvatarBodyV2]: TransactionType.MONEY_EXPENSE,
  [ModeEnum.ChatWithAvatar]: TransactionType.MONEY_EXPENSE,
  [ModeEnum.LipSync]: TransactionType.MONEY_EXPENSE,
  [ModeEnum.Voice]: TransactionType.MONEY_EXPENSE,
  [ModeEnum.Subscribe]: TransactionType.SUBSCRIPTION_PURCHASE,
  [ModeEnum.TopUpBalance]: TransactionType.MONEY_INCOME,
} as const

/**
 * Получает тип транзакции и сервис по команде
 */
export function getTransactionInfoByCommand(command: ModeEnum): {
  transactionType: TransactionType
  service: ModeEnum
  description: string
} {
  const transactionType =
    COMMAND_TO_TRANSACTION_TYPE[command] || TransactionType.SYSTEM
  const service = COMMAND_TO_SERVICE_MAP[command]

  if (!service) {
    return {
      transactionType,
      service: ModeEnum.NeuroPhoto, // Дефолтный сервис
      description: DETAILED_TRANSACTION_DESCRIPTIONS[transactionType].default,
    }
  }

  return {
    transactionType,
    service,
    description:
      DETAILED_TRANSACTION_DESCRIPTIONS[transactionType][service] ||
      DETAILED_TRANSACTION_DESCRIPTIONS[transactionType].default,
  }
}
