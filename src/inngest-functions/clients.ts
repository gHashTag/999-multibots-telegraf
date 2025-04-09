import { Inngest } from 'inngest'
import { INNGEST_EVENT_KEY } from '@/config'
// Добавляем лог для проверки инициализации
console.log('🔄 Initializing Inngest client...')
console.log('🔑 INNGEST_EVENT_KEY available:', !!INNGEST_EVENT_KEY)
console.log('🔧 NODE_ENV:', process.env.NODE_ENV)

if (INNGEST_EVENT_KEY) {
  console.log(
    '🔑 INNGEST_EVENT_KEY first 10 chars:',
    INNGEST_EVENT_KEY.substring(0, 10) + '...'
  )
}

// Создаем экземпляр Inngest с разными конфигурациями для тестового и продакшн окружений
const createInngestClient = () => {
  const config = {
    id: process.env.NODE_ENV === 'test' ? 'test-client' : 'neuro-blogger',
    eventKey:
      process.env.NODE_ENV === 'test'
        ? 'test-key'
        : INNGEST_EVENT_KEY || 'development-key',
  }
  return new Inngest(config)
}

// Экспортируем клиент с явным указанием типа
export const inngest: Inngest = createInngestClient()

// Проверка экспорта
console.log('✅ Inngest client created:', !!inngest)

// Экспорт всех функций Inngest
// Когда функции импортируются в файле serve.ts, они будут автоматически зарегистрированы
export const functions = []

// ВАЖНО: Не импортируем функции здесь напрямую, чтобы избежать циклических зависимостей
// Функции будут импортированы в serve.ts
