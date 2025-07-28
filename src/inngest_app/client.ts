import { Inngest } from 'inngest'
import { generateAdvancedLoopingVideoFunction } from './functions/generateAdvancedLoopingVideoFunction'

// ✅ Экспортируем функцию морфинга для регистрации в Inngest
export const functions = [generateAdvancedLoopingVideoFunction]

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
