import type { Inngest } from 'inngest'
import type { Logger as PinoLogger } from 'pino'
import type { replicate as ReplicateClientInstance } from '@/core/replicate'
import type winston from 'winston'
import type { Message } from 'telegraf/types'
// import { MyContext } from '@/interfaces'; // MyContext не нужен в зависимостях модуля напрямую

// Типы для API модуля
import type { ModelTrainingRequest, ModelTrainingResponse } from './types'

// Нужен импорт PaymentType, если он используется в updateUserBalance
import { PaymentType } from '@/interfaces/payments.interface'

// API, которое будет предоставлять модуль
export interface DigitalAvatarBodyAPI {
  startModelTraining: (
    request: ModelTrainingRequest /*, ctx?: MyContext */
  ) => Promise<ModelTrainingResponse>
  // Другие методы API модуля, если будут
}

// Теперь воркер Inngest также нужно будет инициализировать зависимостями,
// но это сложнее, т.к. Inngest функции обычно регистрируются глобально.
// Возможно, воркеру придется импортировать инициализированный модуль
// или мы передадим зависимости ему при регистрации в главном файле Inngest.

// Удаляем ненужные импорты
/*
import {
  createGenerateModelTrainingHandler, // <-- ЭТОТ ИМПОРТ ПОКА ОСТАВЛЯЕМ, УДАЛИМ НА СЛЕД. ШАГАХ
  // type GenerateModelTrainingDependencies, // <-- Удаляем старый тип зависимостей
} from './inngest/generateModelTraining'
import {
  startModelTraining, // <-- ЭТОТ ИМПОРТ ПОКА ОСТАВЛЯЕМ, УДАЛИМ НА СЛЕД. ШАГАХ
  StartModelTrainingArgs,
} from './services/startModelTraining.service'
import { replicateWebhookHandler } from './webhooks/replicate.webhook.controller' // <-- ЭТОТ ИМПОРТ ПОКА ОСТАВЛЯЕМ, УДАЛИМ НА СЛЕД. ШАГАХ
*/
// 👇 Определяем НОВЫЙ, упрощенный интерфейс зависимостей
export interface DigitalAvatarBodyDependencies {
  // Было: DigitalAvatarBodyMinimalDependencies
  // Было: DigitalAvatarBodyMinimalDependencies
  inngest: Inngest
  sendTelegramMessage: (
    chatId: string | number,
    text: string,
    extra?: any
  ) => Promise<any> // Уточнить тип возвращаемого значения, если нужно
}

/**
 * Инициализирует модуль Digital Avatar Body.
 * Регистрирует Inngest функции и возвращает API модуля.
 */
// 👇 Переименовываем функцию
export function initDigitalAvatarBodyModule(
  // 👇 Используем переименованный интерфейс
  deps: DigitalAvatarBodyDependencies
) {
  // Было: initDigitalAvatarBodyModuleMinimal
  console.log(
    '[Module Init] Инициализация модуля digitalAvatarBody... (Minimal Deps)'
  )

  // Создаем обработчик Inngest, передавая ему только необходимые внешние зависимости
  // Внутренние зависимости (supabase, replicate, logger, config) будут импортированы внутри
  // 👇 !! Важно: Здесь мы должны использовать импортированную функцию generateModelTraining,
  //    а не вызывать createGenerateModelTrainingHandler, который мы планируем удалить.
  //    Предполагается, что generateModelTraining сама является конфигурацией или функцией Inngest.
  const generateModelTrainingFnConfig = generateModelTraining // Заменяем вызов

  console.log(
    '[Module Init] Конфигурация Inngest функции modelTrainingWorker создана.'
  )

  return {
    // Возвращаем конфигурацию для регистрации в bot.ts
    inngestFunctions: [generateModelTrainingFnConfig],
    // Убираем лишние возвращаемые значения
    // startModelTraining: startModelTraining,
    // replicateWebhookHandler: replicateWebhookHandler,
  }
}

// Импортируем напрямую отрефакторенную функцию
import { generateModelTraining } from './inngest/generateModelTraining'

// Удаляем неиспользуемый интерфейс
// interface LocalDependencies extends DigitalAvatarBodyMinimalDependencies {}

// API, которое будет предоставлять модуль
// Упрощаем API, чтобы оно возвращало только то, что действительно нужно
export interface DigitalAvatarBodyModuleAPI {
  inngestFunctions: any[] // Массив конфигураций Inngest функций
}

// Экспортируем только необходимые типы вовне
export type {
  // DigitalAvatarBodyDependencies, // УДАЛЯЕМ ЭТУ СТРОКУ, так как тип уже экспортирован выше
  // DigitalAvatarBodyModuleAPI, // Экспортируем, если он действительно нужен внешнему коду
  ModelTrainingRequest, // Если используется внешним кодом
  ModelTrainingResponse, // Если используется внешним кодом
}
