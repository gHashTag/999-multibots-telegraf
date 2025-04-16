import { Inngest } from 'inngest'
import { INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY } from '@/config'
import { createHttpClient } from '@/utils/httpClient'
import { logger } from '@/utils/logger'

// Добавляем расширенное логирование для диагностики
logger.info('🔄 Initializing Inngest client...', {
  environment: process.env.NODE_ENV,
  docker: process.env.DOCKER_ENVIRONMENT === 'true',
  timestamp: new Date().toISOString(),
})

// Проверяем наличие ключей
logger.info('🔑 Checking Inngest keys:', {
  event_key_present: !!INNGEST_EVENT_KEY,
  signing_key_present: !!INNGEST_SIGNING_KEY,
})

// Определяем базовый URL в зависимости от окружения
const getBaseUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return process.env.INNGEST_URL || 'https://api.inngest.com'
  }

  // Для Docker используем специальный URL
  if (process.env.DOCKER_ENVIRONMENT === 'true') {
    return (
      process.env.INNGEST_BASE_DOCKER_URL || 'http://host.docker.internal:8288'
    )
  }

  // Для локальной разработки
  return process.env.INNGEST_BASE_URL || 'http://localhost:8288'
}

// Создаем HTTP клиент с retry логикой
const httpClient = createHttpClient({
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Создаем fetch адаптер
const fetchAdapter = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString()
  const response = await httpClient.request(url, {
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

// Базовая конфигурация Inngest
const inngestConfig = {
  id: 'neuro-blogger-2.0',
  eventKey: INNGEST_EVENT_KEY || 'development-key',
  signingKey: INNGEST_SIGNING_KEY,
  baseUrl: getBaseUrl(),
  fetch: fetchAdapter,
}

// Логируем итоговую конфигурацию (без sensitive данных)
logger.info('⚙️ Inngest configuration:', {
  id: inngestConfig.id,
  baseUrl: inngestConfig.baseUrl,
  environment: process.env.NODE_ENV,
  is_docker: process.env.DOCKER_ENVIRONMENT === 'true',
  has_event_key: !!inngestConfig.eventKey,
  has_signing_key: !!inngestConfig.signingKey,
  timestamp: new Date().toISOString(),
})

// Создаем и экспортируем клиент
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
