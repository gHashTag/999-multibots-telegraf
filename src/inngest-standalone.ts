/**
 * Отдельный файл для запуска Inngest Connect без зависимостей от существующего кода
 */
import { connect } from 'inngest/connect'
import { serve } from 'inngest/node'
import { logger } from './utils/logger'
import 'dotenv/config'
// Дополнительно подключаем пути из tsconfig
require('tsconfig-paths/register')

// Создаем клиент Inngest напрямую
const inngest = serve({
  id: 'neuro-blogger-2.0',
  eventKey: process.env.INNGEST_EVENT_KEY || 'dev-key',
  logger: logger,
})

// Создаем тестовую функцию для проверки работы Inngest
const testFunction = inngest.createFunction(
  { id: 'test-function', name: 'Test Function' },
  { event: 'test/event' },
  async ({ event, step }) => {
    logger.info({
      message: '✅ Тестовая функция вызвана',
      description: 'Test function called',
      event,
      timestamp: new Date().toISOString(),
    })
    return { success: true }
  }
)

// Функция проверки соединения
const testConnection = inngest.createFunction(
  { id: 'test-connection', name: 'Test Connection' },
  { cron: '*/5 * * * *' }, // Каждые 5 минут
  async ({ step }) => {
    logger.info({
      message: '🔄 Проверка соединения с Inngest',
      description: 'Inngest connection check',
      timestamp: new Date().toISOString(),
    })
    return { timestamp: new Date().toISOString() }
  }
)

// Функция для обработки нейрофото
const neuroPhotoFunction = inngest.createFunction(
  { id: 'neurophoto-standalone', name: 'Neurophoto Standalone' },
  { event: 'neuro/photo-v2.generate' },
  async ({ event, step }) => {
    logger.info({
      message: '🎨 Получен запрос на генерацию нейрофото',
      description: 'Neurophoto generation request received',
      event_data: event.data,
      timestamp: new Date().toISOString(),
    })
    return { success: true }
  }
)

/**
 * Запускает Inngest Connect
 */
async function startInngestStandalone() {
  try {
    logger.info({
      message: '🚀 Запуск автономного Inngest Connect',
      description: 'Starting standalone Inngest Connect',
      timestamp: new Date().toISOString(),
    })

    // Регистрируем тестовые функции
    const connection = await connect({
      apps: [
        {
          client: inngest,
          functions: [testFunction, testConnection, neuroPhotoFunction],
        },
      ],
      instanceId: `neuro-blogger-standalone-${process.pid}`,
      handleShutdownSignals: ['SIGTERM', 'SIGINT'],
    })

    logger.info({
      message: `✅ Inngest Connect соединение установлено: ${connection.state}`,
      description: 'Inngest Connect connection established',
      state: connection.state,
      timestamp: new Date().toISOString(),
    })

    // Проверка работы - отправляем тестовое событие
    setTimeout(async () => {
      try {
        await inngest.send({
          name: 'test/event',
          data: {
            message: 'Тестовое событие из автономного клиента',
            timestamp: new Date().toISOString(),
          },
        })

        logger.info({
          message: '📤 Тестовое событие отправлено',
          description: 'Test event sent',
          timestamp: new Date().toISOString(),
        })
      } catch (error) {
        logger.error({
          message: '❌ Ошибка при отправке тестового события',
          description: 'Error sending test event',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        })
      }
    }, 3000)

    // Ожидаем закрытия соединения
    await connection.closed
    logger.info({
      message: '👋 Inngest Connect соединение закрыто',
      description: 'Inngest Connect connection closed',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при запуске Inngest Connect',
      description: 'Error starting Inngest Connect',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    })
  }
}

// Запускаем соединение
if (require.main === module) {
  logger.info({
    message: '🚀 Запуск Inngest Connect в автономном режиме',
    description: 'Starting Inngest Connect in standalone mode',
    timestamp: new Date().toISOString(),
  })

  startInngestStandalone()
}

export { startInngestStandalone }
