import { Inngest } from 'inngest'
// Отключено: generateAdvancedLoopingVideoFunction - морфинг теперь работает через localMorphingProcessor
// import { generateAdvancedLoopingVideoFunction } from './functions/generateAdvancedLoopingVideoFunction'

// ✅ Список Inngest функций (пуст - морфинг переведен на чистый JavaScript)
export const functions = [
  // generateAdvancedLoopingVideoFunction - отключено, используем localMorphingProcessor
]

// Создаем клиент Inngest для подключения к нашему dev server
// @ts-ignore - Игнорируем несоответствие типов для совместимости между разными версиями Inngest
export const inngest = new Inngest({
  // @ts-ignore - Совместимость между версиями
  name: 'telegram-bot-client',
  id: 'telegram-bot-client',
  // Подключение к нашему Inngest Dev Server
  baseUrl:
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:8288' // Наш dev server
      : (process.env.ELESTIO_URL ||
          'https://ai-server-production-production-8e2d.up.railway.app') +
        '/api/inngest', // Продакшн сервер
  isDev: process.env.NODE_ENV === 'development',
  // Event key только для production
  eventKey:
    process.env.NODE_ENV === 'production'
      ? process.env.INNGEST_EVENT_KEY
      : undefined,
})
