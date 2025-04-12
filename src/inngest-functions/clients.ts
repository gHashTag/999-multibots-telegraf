import { Inngest } from 'inngest'
import { INNGEST_EVENT_KEY } from '@/config'
import fetch, { Response } from 'node-fetch'
import type { RequestInit } from 'node-fetch'
import { logger } from '@/utils/logger'
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

// Создаем базовую конфигурацию Inngest - используем конфигурацию, которая работала три дня назад
const inngestConfig: any = {
  id: 'neuro-blogger-2.0',
  eventKey: INNGEST_EVENT_KEY || 'development-key',
}

// Для разработки настраиваем оба необходимых URL
if (process.env.NODE_ENV === 'development') {
  // baseUrl - для обработки функций через API сервер (в соответствии с документацией)
  inngestConfig.baseUrl = 'http://localhost:2999/api/inngest'
  //
  // eventKey всегда должен быть доступен
  if (!inngestConfig.eventKey) {
    inngestConfig.eventKey = 'dev-key'
  }

  // Настраиваем дополнительный URL для отправки событий через Inngest CLI Dev Server
  inngestConfig.fetch = async (url: string, init: RequestInit) => {
    try {
      // Более подробное логирование для всех запросов Inngest
      const requestId = new Date().getTime().toString()
      logger.info('🔄 Inngest запрос', {
        description: 'Inngest request',
        request_id: requestId,
        url,
        method: init.method,
        headers: JSON.stringify(init.headers),
        body_size: init.body
          ? typeof init.body === 'string'
            ? init.body.length
            : 'not-string'
          : 0,
        timestamp: new Date().toISOString(),
      })

      // Если это отправка события (событие начинается с /e/),
      // то перенаправляем на Inngest Dev Server
      if (url.includes('/e/')) {
        // По документации Inngest, Dev Server слушает на порту 8288
        // Эндпоинт для отправки событий: /e/[key]
        // https://www.inngest.com/docs/dev-server
        const devKey = inngestConfig.eventKey || 'dev-key'

        // Выбираем правильный URL в зависимости от среды запуска
        // process.env.DOCKER_ENVIRONMENT будет установлен в docker-compose.yml
        const isDockerEnvironment = process.env.DOCKER_ENVIRONMENT === 'true'
        const baseUrl = isDockerEnvironment
          ? process.env.INNGEST_BASE_DOCKER_URL ||
            'http://host.docker.internal:8288'
          : process.env.INNGEST_BASE_URL || 'http://localhost:8288'

        const devServerUrl = `${baseUrl}/e/${devKey}`

        logger.info('📌 Используем URL для Inngest', {
          description: 'Using Inngest URL',
          is_docker: isDockerEnvironment,
          base_url: baseUrl,
          dev_server_url: devServerUrl,
          timestamp: new Date().toISOString(),
        })

        const requestBody = init.body
          ? typeof init.body === 'string'
            ? JSON.parse(init.body)
            : '(не строка)'
          : '(пустое тело)'

        logger.info('🚀 Отправка события в Inngest', {
          description: 'Sending event to Inngest',
          request_id: requestId,
          originalUrl: url,
          redirectUrl: devServerUrl,
          method: init.method,
          eventName: requestBody.name || 'unknown',
          eventId: requestBody.id || 'no-id',
          requestBody: JSON.stringify(requestBody).substring(0, 200),
          timestamp: new Date().toISOString(),
        })

        try {
          logger.info('📤 Выполнение запроса', {
            description: 'Executing request',
            request_id: requestId,
            url: devServerUrl,
            timestamp: new Date().toISOString(),
          })

          const response = await fetch(devServerUrl, init)

          const responseStatus = response.status
          const responseText = await response.text()

          logger.info('✅ Ответ от Inngest Dev Server получен', {
            description: 'Response received from Inngest Dev Server',
            request_id: requestId,
            url: devServerUrl,
            status: responseStatus,
            responseBody:
              responseText.substring(0, 200) +
              (responseText.length > 200 ? '...' : ''),
            timestamp: new Date().toISOString(),
          })

          // Создаем новый Response объект, так как оригинальный уже был "использован" при чтении текста
          return new Response(responseText, {
            status: responseStatus,
            headers: response.headers,
          })
        } catch (err) {
          logger.error('❌ Ошибка при отправке события в Inngest Dev Server', {
            description: 'Error sending event to Inngest Dev Server',
            request_id: requestId,
            url: devServerUrl,
            error: err instanceof Error ? err.message : 'Unknown error',
            stack: err instanceof Error ? err.stack : undefined,
            timestamp: new Date().toISOString(),
          })

          // Пробуем альтернативный URL - вдруг порт другой
          try {
            logger.info('🔄 Попытка использования альтернативного URL', {
              description: 'Trying alternative URL',
              request_id: requestId,
              url: `http://localhost:2999/api/inngest/e`,
              timestamp: new Date().toISOString(),
            })

            const altResponse = await fetch(
              `http://localhost:2999/api/inngest/e`,
              init
            )
            const altResponseText = await altResponse.text()

            logger.info('✅ Ответ от альтернативного URL получен', {
              description: 'Response received from alternative URL',
              request_id: requestId,
              status: altResponse.status,
              responseBody:
                altResponseText.substring(0, 200) +
                (altResponseText.length > 200 ? '...' : ''),
              timestamp: new Date().toISOString(),
            })

            return new Response(altResponseText, {
              status: altResponse.status,
              headers: altResponse.headers,
            })
          } catch (altErr) {
            logger.error('❌ Ошибка при отправке на альтернативный URL', {
              description: 'Error sending to alternative URL',
              request_id: requestId,
              error: altErr instanceof Error ? altErr.message : 'Unknown error',
              timestamp: new Date().toISOString(),
            })
          }

          throw err
        }
      }

      // Для всех остальных запросов используем стандартный URL
      logger.info('🔍 Стандартный запрос Inngest', {
        description: 'Standard Inngest request',
        url,
        method: init.method,
        timestamp: new Date().toISOString(),
      })

      const response = await fetch(url, init)

      logger.info('✓ Стандартный ответ получен', {
        description: 'Standard response received',
        status: response.status,
        timestamp: new Date().toISOString(),
      })

      return response
    } catch (error) {
      logger.error('❌ Ошибка при отправке запроса Inngest', {
        description: 'Error sending Inngest request',
        possibleUrls: [
          'http://localhost:2999/api/inngest/event',
          'http://localhost:2999/api/inngest/e',
        ],
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      })

      // Пробрасываем ошибку дальше
      throw error
    }
  }
}

// Создаем экземпляр с нужной конфигурацией
export const inngest = new Inngest(inngestConfig)

// Проверка экспорта
console.log('✅ Inngest client created:', !!inngest)
console.log(
  '⚙️ Inngest config:',
  JSON.stringify({
    id: inngestConfig.id,
    eventKey: inngestConfig.eventKey ? '***' : undefined,
    baseUrl: inngestConfig.baseUrl,
    customFetch: !!inngestConfig.fetch,
  })
)

// Экспорт функций напрямую из этого файла
export const functions = []

// ВАЖНО: Не импортируем функции здесь напрямую, чтобы избежать циклических зависимостей
// Функции будут импортированы в serve.ts
