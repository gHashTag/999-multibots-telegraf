import { PaymentType } from '@/interfaces/payments.interface'

/**
 * Данные для запроса на тренировку модели цифрового аватара.
 */
export interface ModelTrainingRequest {
  telegram_id: number | string // Может быть строкой или числом
  file_path: string
  model_name: string
  trigger_word?: string
  is_ru: boolean
  bot_name: string
  steps?: number // Добавляем опционально, если нужно передавать
}

/**
 * Ответ от сервиса тренировки модели.
 */
export interface ModelTrainingResponse {
  success: boolean
  message: string
  replicateTrainingId?: string
  cost?: number
  error?: string
  model_id?: string
  model_url?: string
}

/**
 * Определение для данных события Inngest, используемых в modelTraining.worker.ts
 * На основе event.data в modelTraining.worker.ts
 */
export interface ModelTrainingInngestEventData {
  telegram_id: string // Inngest часто работает со строками
  bot_name: string
  model_name: string
  trigger_word?: string
  zipUrl: string
  cost_for_refund?: number // Используем cost_for_refund для ясности
  calculatedCost: number // <--- ДОБАВЛЕНО: Рассчитанная стоимость
  operation_type_for_refund: PaymentType // Тип операции для возврата
  is_ru: boolean
  // Опциональные поля, передаваемые из сервиса или сцены
  steps?: number
  user_api?: string | null // Добавляем, т.к. используется в generateModelTraining
  user_replicate_username?: string | null // Добавляем, т.к. используется в generateModelTraining
  // paymentType?: PaymentType // Удаляем, так как есть operation_type_for_refund
}

// --- Типы для проверки активных тренировок (оставляем без изменений) ---
export type ActiveCheckResult =
  | ErrorActiveCheck
  | ActiveCheckFromDB
  | ActiveCheckFromCache
  | NoActiveCheck

export interface ErrorActiveCheck {
  status: 'error'
  message: string
}

export interface ActiveCheckFromDB {
  status: 'active_db'
  replicate_id: string | null
  db_status: string | null // Добавляем статус из БД
  created_at?: string // Делаем опциональным
  model_name?: string // Делаем опциональным
}

export interface ActiveCheckFromCache {
  status: 'active_cache'
  cache_status: 'starting' | 'running'
}

export interface NoActiveCheck {
  status: 'inactive'
}

// Тип для вебхука (если он будет использоваться)
export enum WebhookEventType {
  Completed = 'completed',
  Failed = 'failed',
  // Другие статусы по необходимости
}

export interface DigitalAvatarBodyDependencies {
  // ... existing code ...
}
