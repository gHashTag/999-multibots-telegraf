/**
 * Inngest Client Configuration
 * 🕉️ Единый клиент для всех Inngest функций согласно ТЗ
 */

import { Inngest } from 'inngest'

// Создаем клиент Inngest согласно ТЗ
export const inngest = new Inngest({
  id: 'telegraf-inngest-functions',
  name: 'Telegraf Bot Farm - Inngest Functions',
  eventKey: process.env.INNGEST_EVENT_KEY || 'local-dev-key',
})

// Экспортируем пустой массив функций (будет заполняться из functions/index.ts)
export const functions: any[] = []
