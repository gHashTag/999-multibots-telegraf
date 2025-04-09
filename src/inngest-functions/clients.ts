import { Inngest } from 'inngest'
import { INNGEST_EVENT_KEY, INNGEST_URL } from '@/config'
import axios from 'axios'
import { logger } from '@/utils/logger'

logger.info('🚀 Инициализация Inngest клиента:', {
  description: 'Initializing Inngest client',
  hasEventKey: !!INNGEST_EVENT_KEY,
  hasUrl: !!INNGEST_URL,
  nodeEnv: process.env.NODE_ENV,
})

const createInngestClient = () => {
  const config = {
    id: process.env.NODE_ENV === 'test' ? 'test-client' : 'neuro-blogger',
    eventKey: INNGEST_EVENT_KEY || 'development-key',
    // В режиме разработки используем локальный URL
    baseUrl:
      process.env.NODE_ENV === 'development'
        ? 'http://localhost:8288'
        : INNGEST_URL || 'https://api.inngest.com',
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url = typeof input === 'string' ? input : input.toString()

        // Разрешаем как локальные URL для разработки, так и production URL
        const allowedUrls = ['http://localhost:8288', 'https://api.inngest.com']
        const isAllowedUrl = allowedUrls.some(allowed =>
          url.startsWith(allowed)
        )

        if (!isAllowedUrl) {
          logger.warn('⚠️ Попытка доступа к неразрешенному URL:', {
            description: 'Attempt to access unauthorized URL',
            url: url.split('?')[0],
          })
          throw new Error('Invalid Inngest API URL')
        }

        // Добавляем логирование запроса
        logger.info('🚀 Отправка запроса в Inngest:', {
          description: 'Sending request to Inngest',
          method: init?.method || 'GET',
          url: url.split('?')[0],
          hasBody: !!init?.body,
        })

        const response = await axios({
          method: init?.method || 'GET',
          url,
          data: init?.body,
          headers: {
            ...(init?.headers as any),
            'x-inngest-event-key': INNGEST_EVENT_KEY,
          },
          timeout: 30000,
        })

        logger.info('✅ Inngest запрос выполнен успешно:', {
          description: 'Inngest request successful',
          status: response.status,
          method: init?.method || 'GET',
          url: url.split('?')[0],
        })

        return {
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          json: async () => response.data,
        } as Response
      } catch (error) {
        logger.error('❌ Ошибка Inngest fetch:', {
          description: 'Inngest fetch error',
          error: error instanceof Error ? error.message : String(error),
          url:
            typeof input === 'string'
              ? input.split('?')[0]
              : input.toString().split('?')[0],
        })
        throw error
      }
    },
  }
  return new Inngest(config)
}

export const inngest: Inngest = createInngestClient()

logger.info('✅ Inngest клиент создан:', {
  description: 'Inngest client created',
  isInitialized: !!inngest,
  baseUrl:
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:8288'
      : INNGEST_URL || 'https://api.inngest.com',
})

export const functions = []

// ВАЖНО: Не импортируем функции здесь напрямую, чтобы избежать циклических зависимостей
// Функции будут импортированы в serve.ts
