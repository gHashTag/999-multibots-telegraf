import { Inngest } from 'inngest'
import 'dotenv/config'

// Добавляем лог для проверки инициализации
console.log('🔄 Initializing Inngest client...', process.env.NODE_ENV)
console.log('🔑 INNGEST_EVENT_KEY доступен:', !!process.env.INNGEST_EVENT_KEY)

// Определяем базовый URL в зависимости от окружения
const baseUrl =
  process.env.NODE_ENV === 'production'
    ? process.env.API_URL || 'https://api.neuro-blogger.ru'
    : process.env.LOCAL_SERVER_URL || 'http://localhost:2999'

// Логируем базовый URL
console.log('📍 Inngest baseUrl:', baseUrl)

// Настраиваем клиент для локальной разработки
const isDev =
  process.env.NODE_ENV !== 'production' || process.env.INNGEST_DEV === '1'
console.log(
  '🔧 Inngest running in:',
  isDev ? 'DEVELOPMENT (local)' : 'PRODUCTION (real API)'
)

// В режиме разработки используем dev-key, в production - переменную окружения
const eventKey = isDev ? 'dev-key' : process.env.INNGEST_EVENT_KEY || 'dev-key'
console.log(
  '🔑 Using Inngest key:',
  eventKey === 'dev-key' ? 'dev-key (development mode)' : 'from env'
)

// Создаем клиент Inngest с соответствующими настройками
export const inngest = new Inngest({
  id: 'neuro-blogger-2.0',
  name: 'Neuro Blogger 2.0',
  eventKey,
  baseUrl: `${baseUrl}/api`,
})

// Проверка экспорта
console.log('✅ Inngest client created:', !!inngest)
