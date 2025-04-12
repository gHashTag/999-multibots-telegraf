import { ModeEnum } from '@/interfaces/modes'

/**
 * Типы подписок, доступные для оплаты
 */
export type PaymentSubscription =
  | 'neurophoto'
  | 'neurobase'
  | 'neuroblogger'
  | 'neurotester'

/**
 * Проверяет, является ли подписка допустимой для оплаты
 */
export function isValidPaymentSubscription(
  subscription: string | undefined
): subscription is PaymentSubscription {
  return (
    subscription === 'neurophoto' ||
    subscription === 'neurobase' ||
    subscription === 'neuroblogger' ||
    subscription === 'neurotester'
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
 * Сервисы для генерации контента
 * Включает все возможные режимы работы бота из ModeEnum
 */
export type ContentService = ModeEnum

/**
 * Объединенный тип сервиса
 */
export type PaymentService = ContentService | PaymentMethod

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
  service_type: ContentService
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
  service_type: ContentService
}

/**
 * Полная структура платежа, включая все поля
 */
export type Payment = BasePayment

/**
 * Типы транзакций в системе
 *
 * ВАЖНО: значения должны быть в нижнем регистре, так как они используются в БД
 */
export enum TransactionType {
  MONEY_INCOME = 'money_income',
  MONEY_EXPENSE = 'money_expense',
  SUBSCRIPTION_PAYMENT = 'subscription_payment',
  SUBSCRIPTION_PURCHASE = 'subscription_purchase',
  SUBSCRIPTION_RENEWAL = 'subscription_renewal',
  REFUND = 'refund',
  BONUS = 'bonus',
  REFERRAL = 'referral',
  TRANSFER = 'transfer',
  SYSTEM = 'system',
}

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
 * Преобразует тип транзакции из enum с заглавными буквами
 * в нижний регистр для совместимости с БД
 *
 * ПРИМЕЧАНИЕ: Эта функция остается для обратной совместимости,
 * теперь значения TransactionType уже в нижнем регистре
 */
export function normalizeTransactionType(
  type: TransactionType | string
): string {
  // Простое приведение к строке и нижнему регистру
  return (type as string).toLowerCase()
}

/**
 * Ключи для сервисов
 */
export const SERVICE_KEYS: Record<string, ContentService> = {
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
export const COMMAND_TO_SERVICE_MAP: Partial<Record<ModeEnum, ContentService>> =
  {
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
 * Получение типа транзакции и сервиса по команде
 */
export function getTransactionInfoByCommand(command: ModeEnum): {
  transactionType: TransactionType
  service: ContentService
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

/**
 * Описания для разных типов сервисов с эмодзи
 */
export const SERVICE_DESCRIPTIONS: Partial<
  Record<
    ModeEnum,
    {
      expense: (amount: number) => string
      income: (amount: number) => string
    }
  >
> = {
  [ModeEnum.NeuroPhoto]: {
    expense: (amount: number) =>
      `🎨 Генерация изображения: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.NeuroPhotoV2]: {
    expense: (amount: number) =>
      `🎨 Генерация изображения V2: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.DigitalAvatarBody]: {
    expense: (amount: number) =>
      `👤 Создание цифрового аватара: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.DigitalAvatarBodyV2]: {
    expense: (amount: number) =>
      `👤 Создание цифрового аватара V2: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.TextToSpeech]: {
    expense: (amount: number) =>
      `🗣️ Преобразование текста в речь: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.TextToVideo]: {
    expense: (amount: number) =>
      `🎬 Создание видео из текста: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.TextToImage]: {
    expense: (amount: number) =>
      `🖼️ Создание изображения из текста: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.ImageToVideo]: {
    expense: (amount: number) =>
      `🎬 Создание видео из изображения: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Voice]: {
    expense: (amount: number) =>
      `🎤 Создание голосового аватара: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.ImageToPrompt]: {
    expense: (amount: number) =>
      `🔍 Анализ изображения: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.ChatWithAvatar]: {
    expense: (amount: number) =>
      `💬 Чат с аватаром: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.LipSync]: {
    expense: (amount: number) =>
      `👄 Синхронизация губ: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Subscribe]: {
    expense: (amount: number) =>
      `📅 Подписка: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Avatar]: {
    expense: (amount: number) =>
      `👤 Создание аватара: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.SelectModel]: {
    expense: (amount: number) =>
      `🎯 Выбор модели: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.SelectAiTextModel]: {
    expense: (amount: number) =>
      `🎯 Мастер выбора модели: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.SelectNeuroPhoto]: {
    expense: (amount: number) =>
      `🎨 Выбор NeuroPhoto: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.ChangeSize]: {
    expense: (amount: number) =>
      `📐 Изменение размера: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Invite]: {
    expense: (amount: number) =>
      `📨 Приглашение: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Help]: {
    expense: (amount: number) => `❓ Помощь: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.MainMenu]: {
    expense: (amount: number) =>
      `📋 Главное меню: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Balance]: {
    expense: (amount: number) => `💰 Баланс: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.ImprovePrompt]: {
    expense: (amount: number) =>
      `✨ Улучшение промпта: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.TopUpBalance]: {
    expense: (amount: number) =>
      `💳 Пополнение баланса: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.VideoInUrl]: {
    expense: (amount: number) =>
      `🎥 Видео по URL: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Tech]: {
    expense: (amount: number) =>
      `🧠 Нейросеть: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Stats]: {
    expense: (amount: number) =>
      `📊 Статистика: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.BroadcastWizard]: {
    expense: (amount: number) =>
      `📢 Мастер рассылки: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.SubscriptionCheckScene]: {
    expense: (amount: number) =>
      `🔄 Проверка подписки: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.ImprovePromptWizard]: {
    expense: (amount: number) =>
      `✨ Мастер улучшения промпта: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.SizeWizard]: {
    expense: (amount: number) =>
      `📐 Мастер размера: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.PaymentScene]: {
    expense: (amount: number) => `💳 Оплата: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.InviteScene]: {
    expense: (amount: number) =>
      `📨 Сцена приглашения: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.BalanceScene]: {
    expense: (amount: number) =>
      `💰 Сцена баланса: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Step0]: {
    expense: (amount: number) =>
      `🔄 Начальный шаг: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.NeuroCoderScene]: {
    expense: (amount: number) =>
      `🤖 Сцена NeuroCoder: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.CheckBalanceScene]: {
    expense: (amount: number) =>
      `💰 Проверка баланса: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.HelpScene]: {
    expense: (amount: number) =>
      `❓ Сцена помощи: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.CancelPredictionsWizard]: {
    expense: (amount: number) =>
      `❌ Отмена предсказаний: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.EmailWizard]: {
    expense: (amount: number) =>
      `📧 Мастер email: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.CreateUserScene]: {
    expense: (amount: number) =>
      `👤 Создание пользователя: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.GetRuBillWizard]: {
    expense: (amount: number) =>
      `📑 Получение счета: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.SubscriptionScene]: {
    expense: (amount: number) =>
      `📲 Управление подписками: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.VoiceToText]: {
    expense: (amount: number) =>
      `🎤 Преобразование голоса в текст: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.StartScene]: {
    expense: (amount: number) =>
      `🚀 Стартовая сцена: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
} as const

/**
 * Получает правильное склонение слова "звезда" в зависимости от количества
 */
function getStarsWord(amount: number): string {
  const lastDigit = Math.abs(amount) % 10
  const lastTwoDigits = Math.abs(amount) % 100

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return 'звезд'
  }

  if (lastDigit === 1) {
    return 'звезду'
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'звезды'
  }

  return 'звезд'
}

/**
 * Параметры для события обработки платежа
 * Используется для строгой типизации входных данных платежного процессора
 */
export interface PaymentProcessParams {
  /** ID пользователя в Telegram (обязательно) */
  telegram_id: string

  /** Сумма операции (ВСЕГДА положительное число) */
  amount: number

  /** Количество звезд (ВСЕГДА положительное число, если указано) */
  stars?: number

  /** Тип транзакции из TransactionType */
  type: TransactionType | string

  /** Описание транзакции */
  description: string

  /** Название бота, который инициировал транзакцию */
  bot_name: string

  /** ID инвойса (используется для предотвращения дублирования платежей) */
  inv_id?: string

  /** Дополнительные метаданные платежа */
  metadata?: Record<string, any>

  /** Тип сервиса из ModeEnum */
  service_type: ModeEnum
}

/**
 * Результат обработки платежа
 * Возвращается платежным процессором после успешной обработки
 */
export interface PaymentProcessResult {
  /** Успешность операции */
  success: boolean

  /** Данные созданного платежа */
  payment: {
    payment_id: number
    telegram_id: string
    amount: number
    stars: number
    type: string
    status: string
    [key: string]: any
  }

  /** Информация об изменении баланса */
  balanceChange: {
    /** Баланс до операции */
    before: number

    /** Баланс после операции */
    after: number

    /** Разница в балансе */
    difference: number
  }

  /** Сообщение об ошибке (если есть) */
  error?: string
}
