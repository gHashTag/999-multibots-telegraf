import { Inngest } from 'inngest'
import { INNGEST_EVENT_KEY } from '@/config'

// Добавляем лог для проверки инициализации
console.log('🔄 Initializing Inngest client...')
console.log('🔑 INNGEST_EVENT_KEY available:', !!INNGEST_EVENT_KEY)
console.log('🛠️ INNGEST_DEV mode:', !!process.env.INNGEST_DEV)
console.log('🔌 USE_SERVE mode:', !!process.env.USE_SERVE)

// Определяем режим работы
const isDev =
  process.env.NODE_ENV === 'development' || !!process.env.INNGEST_DEV

// В режиме разработки используем dev-key
const eventKey = isDev ? 'dev' : INNGEST_EVENT_KEY

if (eventKey) {
  console.log(
    '🔑 Using Inngest key:',
    isDev ? 'dev (development)' : eventKey.substring(0, 10) + '...'
  )
}

// Создаем экземпляр Inngest
export const inngest = new Inngest({
  id: 'neuro-blogger-2.0',
  name: 'Neuro Blogger 2.0',
  eventKey,
  baseUrl: isDev ? 'http://localhost:8288' : undefined,
})

// Проверка экспорта
console.log('✅ Inngest client created:', !!inngest)
