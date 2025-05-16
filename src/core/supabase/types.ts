// Этот файл определяет общие типы для взаимодействия с Supabase, особенно для таблицы model_trainings.

/**
 * Базовый интерфейс для записи о тренировке модели, как она хранится в БД.
 */
export interface CoreModelTraining {
  id: string | number // Обычно UUID (string) или serial (number)
  created_at: string // Timestamp
  user_id?: string // UUID пользователя, если связано
  telegram_id?: number // Telegram ID, если используется как основной идентификатор
  model_name: string
  trigger_word: string
  zip_url: string
  steps: number
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  gender?: string
  api?: string // например, 'replicate'
  bot_name?: string
  model_url?: string // URL обученной модели
  replicate_training_id?: string // ID тренировки на Replicate
  replicate_model_id?: string // ID модели на Replicate (после создания)
  version_id?: string // ID версии модели на Replicate
  error?: string // Сообщение об ошибке, если тренировка не удалась
  // ... другие поля, которые могут быть в таблице model_trainings
}

/**
 * Интерфейс для данных, необходимых для создания новой записи о тренировке модели.
 * Поля здесь обычно являются подмножеством CoreModelTraining и не включают генерируемые БД поля (id, created_at).
 */
export interface CoreModelTrainingInsert {
  user_id?: string
  telegram_id?: number
  model_name: string
  trigger_word: string
  zip_url: string
  steps: number
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  gender?: string
  api?: string
  bot_name?: string
  model_url?: string
  replicate_training_id?: string
  replicate_model_id?: string
  version_id?: string
  error?: string
}
