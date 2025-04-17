export * from './models.interface'
export * from './payments.interface'
export * from './cost.interface'
export * from './telegram-bot.interface'
export * from './supabase.interface'
export * from './api.interface'

import { Context } from 'telegraf'

// Объявим модуль для расширения типов Telegraf
declare module 'telegraf' {
  interface Context {
    botId: string
    botUsername?: string
    startPayload?: string
  }
}

/**
 * Базовый контекст для мультибота
 */
export interface MultiBotContext extends Context {
  botId: string
  botUsername?: string
  startPayload?: string
  // Здесь можно добавить другие пользовательские свойства
}
