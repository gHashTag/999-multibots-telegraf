import { Inngest } from 'inngest'
// Отключено: generateAdvancedLoopingVideoFunction - морфинг теперь работает через localMorphingProcessor
// import { generateAdvancedLoopingVideoFunction } from './functions/generateAdvancedLoopingVideoFunction'

// ✅ Список Inngest функций (пуст - морфинг переведен на чистый JavaScript)
export const functions = [
  // generateAdvancedLoopingVideoFunction - отключено, используем localMorphingProcessor
]

// Определяем конфигурацию для логирования
const config = {
  name: 'telegram-bot-client',
  id: 'telegram-bot-client',
  // Всегда используем Inngest Cloud API для отправки событий
  baseUrl: process.env.INNGEST_URL || 'https://api.inngest.com',
  isDev: process.env.NODE_ENV === 'development',
  // Event key нужен всегда для отправки событий в Inngest Cloud
  eventKey: process.env.INNGEST_EVENT_KEY,
}

console.log('🔥 [DEBUG] Inngest client configuration:', {
  ...config,
  eventKey: config.eventKey ? '***HIDDEN***' : 'not set',
  environment: process.env.NODE_ENV
})

// Создаем клиент Inngest для подключения к нашему dev server
// @ts-ignore - Игнорируем несоответствие типов для совместимости между разными версиями Inngest
export const inngest = new Inngest(config)
