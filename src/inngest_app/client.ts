/**
 * Inngest Client Configuration
 * 🕉️ Единый клиент для всех Inngest функций согласно ТЗ
 */

import { Inngest } from 'inngest'

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

// ✅ Импортируем функции (после создания inngest client)
// Отключено: generateAdvancedLoopingVideoFunction - морфинг теперь работает через localMorphingProcessor
// import { generateAdvancedLoopingVideoFunction } from './functions/generateAdvancedLoopingVideoFunction'
// import { generateAIReelsFunction } from './functions/generateAIReelsFunction'
// import { generateModelTrainingFunction } from './functions/existing/generateModelTrainingFunction'

// ✅ Список активных Inngest функций
