import { TransactionType } from './payments.interface'
import { ModeEnum } from '@/price/helpers/modelsCost'

/**
 * Конфигурация платной модели
 */
export interface PaidModelConfig {
  /** Название модели */
  name: string

  /** Стоимость использования модели в звездах */
  price: number

  /** Флаг премиальной модели */
  isPremium: boolean
}

/**
 * Ответ на попытку выбора платной модели
 */
export interface ModelSelectionPaymentResult {
  /** Успешно ли прошел процесс выбора модели */
  success: boolean

  /** Сообщение об ошибке, если процесс не успешен */
  error?: string

  /** Идентификатор транзакции при успешной оплате */
  transactionId?: string

  /** Метаданные операции */
  metadata?: {
    /** Имя выбранной модели */
    model_name: string

    /** Уникальный идентификатор операции */
    operation_id: string

    /** Цена модели в звездах */
    model_price: number
  }
}

/**
 * Параметры для платежа при выборе модели
 */
export interface SelectModelPaymentParams {
  /** Telegram ID пользователя */
  telegram_id: string

  /** Название модели */
  modelName: string

  /** Стоимость модели в звездах */
  modelPrice: number

  /** Тип транзакции */
  transactionType: TransactionType

  /** Описание транзакции */
  description: string

  /** Название бота */
  botName: string

  /** Тип сервиса */
  serviceType: ModeEnum

  /** Метаданные транзакции */
  metadata?: Record<string, any>
}

/**
 * Сессия SelectModelWizard
 */
export interface SelectModelWizardSession {
  /** Выбранная пользователем модель */
  selectedModel?: string

  /** Цена выбранной модели */
  modelPrice?: number
}
