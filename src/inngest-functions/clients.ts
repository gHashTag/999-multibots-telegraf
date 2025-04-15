import { Inngest } from 'inngest'
import { INNGEST_EVENT_KEY } from '@/config'
import fetch, { RequestInit } from 'node-fetch'
import { logger } from '@/utils/logger'
// Добавляем лог для проверки инициализации
console.log('🔄 Initializing Inngest client...')
console.log('🔑 INNGEST_EVENT_KEY available:', !!process.env.INNGEST_EVENT_KEY)
console.log('🔧 NODE_ENV:', process.env.NODE_ENV)

if (process.env.INNGEST_EVENT_KEY) {
  console.log(
    '🔑 INNGEST_EVENT_KEY first 10 chars:',
    process.env.INNGEST_EVENT_KEY.substring(0, 10) + '...'
  )
}

// Создаем клиент с правильной типизацией fetch
export const inngest = new Inngest({
  id: 'neuro-blogger-2.0',
  eventKey: process.env.INNGEST_EVENT_KEY || '',
  baseUrl: process.env.NODE_ENV === 'development' ? 'http://localhost:2999/api/inngest' : undefined
})

console.log('✅ Inngest client created:', !!inngest)
console.log('⚙️ Inngest config:', {
  id: 'neuro-blogger-2.0',
  eventKey: '***',
  baseUrl: process.env.NODE_ENV === 'development' ? 'http://localhost:2999/api/inngest' : undefined
})

// Экспорт функций напрямую из этого файла
export const functions = []

// ВАЖНО: Не импортируем функции здесь напрямую, чтобы избежать циклических зависимостей
// Функции будут импортированы в serve.ts
