import { PaymentType } from '@/interfaces/payments.interface';

/**
 * Данные для запроса на тренировку модели цифрового аватара.
 */
export interface ModelTrainingRequest {
  telegram_id: number | string;
  bot_name: string;
  model_name: string;
  trigger_word: string;
  file_path: string; // Уже snake_case, путь к локальному ZIP-файлу
  steps?: number;
  is_ru: boolean;
  // ctx?: MyContext; // Убрали ctx отсюда, он будет передаваться отдельно в сервисе
}

/**
 * Ответ от сервиса тренировки модели.
 */
export interface ModelTrainingResponse {
  success: boolean;
  message: string;
  replicateTrainingId?: string; // Для ID тренировки от Replicate (План Б)
  replicateStatus?: string;    // Для статуса от Replicate (План Б)
  eventId?: string;            // Для ID события Inngest (План А)
  error?: string;            // Код ошибки (например, 'cost_configuration_error')
  cost?: number; 
  details?: string;          // Описание ошибки или доп. инфо об успехе
}

/**
 * Определение для данных события Inngest, используемых в modelTraining.worker.ts
 * На основе event.data в modelTraining.worker.ts
 */
export interface ModelTrainingInngestEventData {
  telegram_id: number | string;
  bot_name: string;
  model_name: string;
  trigger_word: string;
  zipUrl: string; // Это должен быть URL файла, загруженного на внешний сервер
  steps?: number;
  is_ru: boolean;
  cost_for_refund?: number;
  operation_type_for_refund?: PaymentType;
  original_message_id?: number;
  chat_id?: number;
}

// Можно добавить и другие типы, специфичные для этого модуля, по мере необходимости 