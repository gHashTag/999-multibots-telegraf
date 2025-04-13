// Импортируем Inngest - используем правильный импорт для версии 3.35.0
import { Inngest } from 'inngest'
import { serve } from 'inngest/express'
import { INNGEST_EVENT_KEY } from '@/config'

// Добавляем лог для проверки инициализации
console.log('🔄 Initializing Inngest client...')
console.log('🔑 INNGEST_EVENT_KEY available:', !!INNGEST_EVENT_KEY)

if (INNGEST_EVENT_KEY) {
  console.log(
    '🔑 INNGEST_EVENT_KEY first 10 chars:',
    INNGEST_EVENT_KEY.substring(0, 10) + '...'
  )
}

// Подготавливаем мок-клиент, который будет использоваться в случае ошибки
const mockInngestClient = {
  createFunction: () => ({
    id: 'mock-function',
    name: 'Mock Function',
    handler: async () => ({ success: false }),
  }),
  send: async (event: any) => {
    console.log('📨 Мок-отправка события:', event)
    return { success: true, event, message: 'Event sent (mock)' }
  },
}

// Пытаемся создать настоящий клиент Inngest
let inngestClient: any
try {
  console.log('🔄 Пробуем создать клиент Inngest...')

  // Используем правильный синтаксис для Inngest 3.35.0
  inngestClient = new Inngest({
    id: 'neuro-blogger-2.0',
  })
  console.log('✅ Клиент Inngest успешно создан')
} catch (error) {
  console.error('❌ Ошибка при создании клиента Inngest:', error)
  console.warn('⚠️ Используем мок-клиент')
  inngestClient = mockInngestClient
}

// Экспортируем клиент Inngest
export const inngest = inngestClient

// Экспортируем serve handler для API эндпоинта
export const serveHandler = serve({
  client: inngest,
  functions: [], // Функции будут добавлены отдельно
})

// Проверка экспорта
console.log('✅ Inngest client created:', !!inngest)

// Экспорт всех функций Inngest
// Когда функции импортируются в файле serve.ts, они будут автоматически зарегистрированы
export const functions = []

// ВАЖНО: Не импортируем функции здесь напрямую, чтобы избежать циклических зависимостей
// Функции будут импортированы в serve.ts
