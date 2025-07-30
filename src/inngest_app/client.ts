import { Inngest } from 'inngest'
// Удалено: generateAdvancedLoopingVideoFunction - морфинг теперь работает синхронно через API сервер
// import { generateAdvancedLoopingVideoFunction } from './functions/generateAdvancedLoopingVideoFunction'

// ✅ Список Inngest функций (временно пуст - морфинг переведен на синхронную обработку)
export const functions = [
  // generateAdvancedLoopingVideoFunction - удалено, морфинг теперь синхронный
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
      : 'https://ai-server-u14194.vm.elestio.app/api/inngest', // Продакшн сервер
  isDev: process.env.NODE_ENV === 'development',
  // Event key только для production
  eventKey:
    process.env.NODE_ENV === 'production'
      ? process.env.INNGEST_EVENT_KEY
      : undefined,
})
