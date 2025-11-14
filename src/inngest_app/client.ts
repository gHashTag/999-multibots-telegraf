/**
 * Inngest Client Configuration
 * 🕉️ Единый клиент для всех Inngest функций согласно ТЗ
 */

import { Inngest } from 'inngest'

<<<<<<< HEAD
// Определяем конфигурацию для логирования
const config = {
  name: 'Vibee',
  id: 'vibee-bot-client',
  // Подключение к нашему Inngest Dev Server
  // ✅ ИСПРАВЛЕНО: Используем только наш домен для Inngest
  baseUrl:
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000' // Локальный dev server
      : 'https://three-head-dragon.shop/api/inngest', // Только наш домен в продакшене
  isDev: process.env.NODE_ENV === 'development',
  // Event key только для production (используем RENDER_INNGEST для отправки событий)
  eventKey:
    process.env.NODE_ENV === 'production'
      ? process.env.RENDER_INNGEST_EVENT_KEY
      : undefined,
}

console.log('🔥 [DEBUG] Inngest client configuration:', {
  ...config,
  eventKey: config.eventKey ? '***HIDDEN***' : 'not set',
  environment: process.env.NODE_ENV
})

// ✅ ВАЖНО: Создаем клиент Inngest ПЕРЕД импортом функций (избегаем circular dependency)
// @ts-ignore - Игнорируем несоответствие типов для совместимости между разными версиями Inngest
export const inngest = new Inngest(config)

// ✅ Импортируем FACTORY функции (не сами функции - избегаем circular dependency)
// Отключено: generateAdvancedLoopingVideoFunction - морфинг теперь работает через localMorphingProcessor
// import { generateAdvancedLoopingVideoFunction } from './functions/generateAdvancedLoopingVideoFunction'
// import { createGenerateAIReelsFunction } from './functions/generateAIReelsFunction'
import { createGenerateModelTrainingFunction } from './functions/existing/generateModelTrainingFunction'

// ✅ Создаем функции через factory после создания inngest client
// const generateAIReelsFunction = createGenerateAIReelsFunction(inngest)
// const generateModelTrainingFunction = createGenerateModelTrainingFunction(inngest)
// 
// // ✅ Список активных Inngest функций
=======
// Создаем клиент Inngest согласно ТЗ
export const inngest = new Inngest({
  id: 'telegraf-inngest-functions',
  name: 'Telegraf Bot Farm - Inngest Functions',
  eventKey: process.env.INNGEST_EVENT_KEY || 'local-dev-key',
})

// Экспортируем пустой массив функций (будет заполняться из functions/index.ts)
export const functions: any[] = []
>>>>>>> cb34edd232229ab0c0abebd665a09c4da15ca7b9
