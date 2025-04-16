import { Inngest } from 'inngest'
import { INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY } from '@/config'
import { createHttpClient } from '@/utils/httpClient'
import { logger } from '@/utils/logger'
// Добавляем лог для проверки инициализации
logger.info('🔄 Initializing Inngest client...')
logger.info('🔑 INNGEST_EVENT_KEY available:', !!INNGEST_EVENT_KEY)
logger.info('🔑 INNGEST_SIGNING_KEY available:', !!INNGEST_SIGNING_KEY)
logger.info('🔧 NODE_ENV:', process.env.NODE_ENV)

if (INNGEST_EVENT_KEY) {
  logger.info(
    '🔑 INNGEST_EVENT_KEY first 10 chars:',
    INNGEST_EVENT_KEY.substring(0, 10) + '...'
  )
}
if (INNGEST_SIGNING_KEY) {
  logger.info(
    '🔑 INNGEST_SIGNING_KEY first 10 chars:',
    INNGEST_SIGNING_KEY.substring(0, 10) + '...'
  )
}

// Создаем HTTP клиент для Inngest
const inngestHttpClient = createHttpClient({
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Адаптер для fetch API
const fetchAdapter = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString()
  const response = await inngestHttpClient.request(url, {
    method: init?.method || 'GET',
    headers: init?.headers as Record<string, string>,
    body: init?.body,
  })

  // Преобразуем данные в строку для Blob
  const blobData =
    typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data)

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
    json: async () => response.data,
    text: async () => blobData,
    blob: async () => new Blob([blobData]),
    arrayBuffer: async () => new TextEncoder().encode(blobData).buffer,
  } as Response
}

// Создаем базовую конфигурацию Inngest
const inngestConfig = {
  id: 'neuro-blogger-2.0',
  eventKey: INNGEST_EVENT_KEY || 'development-key',
  signingKey: INNGEST_SIGNING_KEY,
  baseUrl: process.env.INNGEST_BASE_URL,
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    return fetchAdapter(input, init)
  },
}

// Создаем экземпляр с нужной конфигурацией
export const inngest = new Inngest(inngestConfig)

// Проверка экспорта
logger.info('✅ Inngest client created:', !!inngest)
logger.info(
  '⚙️ Inngest config:',
  JSON.stringify({
    id: inngestConfig.id,
    eventKey: inngestConfig.eventKey ? '***' : undefined,
    signingKey: inngestConfig.signingKey ? '***' : undefined,
    baseUrl: inngestConfig.baseUrl,
    customFetch: true,
  })
)

// Экспорт функций напрямую из этого файла
export const functions = []

// ВАЖНО: Не импортируем функции здесь напрямую, чтобы избежать циклических зависимостей
// Функции будут импортированы в serve.ts
