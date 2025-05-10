import type { Inngest } from 'inngest';
import type { Logger as PinoLogger } from 'pino';
import type { replicate as ReplicateClientInstance } from '@/core/replicate';
import type winston from 'winston';
import type { Message } from 'telegraf/types';
// import { MyContext } from '@/interfaces'; // MyContext не нужен в зависимостях модуля напрямую

// Определяем более точный тип для конфига, передаваемого в модуль
interface ModuleConfig {
  API_URL?: string;
  CONFIG_UPLOAD_DIR?: string; 
  SECRET_API_KEY?: string; // Пример, если нужен
  COSTS?: { 
    [key: string]: number 
  };
  REPLICATE?: {
    TRAINING_MODEL_ID?: string;
    TRAINING_MODEL_VERSION?: string;
    // Другие параметры Replicate, если нужны
  };
  // Другие параметры конфига, если нужны
}

export interface DigitalAvatarBodyDependencies {
  inngest: Inngest;
  logger: winston.Logger;
  replicate: typeof ReplicateClientInstance;
  config: ModuleConfig; // Используем более точный тип ModuleConfig
  // Функции для взаимодействия с Telegram и Supabase
  sendTelegramMessage: (chatId: number | string, text: string, extra?: any) => Promise<Message.TextMessage>;
  // saveErrorToSupabase: (errorData: any) => Promise<any>; // Удаляем, так как пока не используется и не передается
  updateUserBalance: (telegramId: string | number, amount: number, type: PaymentType, description?: string, metadata?: any) => Promise<boolean>; // Стандартизируем на updateUserBalance и уточняем тип type и возвращаемое значение
  getUserBalance: (telegramId: string | number) => Promise<number | null>;
  // Дополнительные функции Supabase, если нужны
}

// Импортируем сервисы и воркеры модуля
import { createModelTrainingService } from './services/modelTraining.service';
import { createModelTrainingWorker } from './inngest/modelTraining.worker';

// Типы для API модуля
import type { ModelTrainingRequest, ModelTrainingResponse } from './types';

// Нужен импорт PaymentType, если он используется в updateUserBalance
import { PaymentType } from '@/interfaces/payments.interface';

// API, которое будет предоставлять модуль
export interface DigitalAvatarBodyAPI {
  startModelTraining: (request: ModelTrainingRequest /*, ctx?: MyContext */) => Promise<ModelTrainingResponse>;
  // Другие методы API модуля, если будут
}

// Функция инициализации модуля
export function initDigitalAvatarBodyModule(dependencies: DigitalAvatarBodyDependencies) {
  const modelTrainingService = createModelTrainingService(dependencies);
  const modelTrainingWorkerConfig = createModelTrainingWorker(dependencies); // Получаем конфигурацию воркера

  // Регистрируем функции Inngest (предполагается, что это делается где-то выше, например в bot.ts или functions.ts)
  // dependencies.inngest.createFunction(...modelTrainingWorkerConfig); // Пример, как это могло бы выглядеть
  // Важно: фактическая регистрация воркера должна происходить там, где доступен инстанс Inngest с .createFunction()

  return {
    startModelTraining: modelTrainingService,
    // Возвращаем конфигурацию воркера, чтобы ее можно было зарегистрировать вовне
    // Это более безопасный подход, чем попытка регистрации функции внутри модуля без полного контроля над Inngest клиентом
    inngestFunctions: [modelTrainingWorkerConfig] 
  };
}

// Теперь воркер Inngest также нужно будет инициализировать зависимостями,
// но это сложнее, т.к. Inngest функции обычно регистрируются глобально.
// Возможно, воркеру придется импортировать инициализированный модуль
// или мы передадим зависимости ему при регистрации в главном файле Inngest. 