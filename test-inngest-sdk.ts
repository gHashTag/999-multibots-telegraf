import 'dotenv/config'
import { Inngest, NonRetriableError } from 'inngest'
import logger from './src/utils/logger'

/**
 * Скрипт для тестирования отправки событий в Inngest с использованием SDK
 *
 * Использование:
 * npx tsx test-inngest-sdk.ts
 */

// Инициализация клиента Inngest
logger.info('🚀 Инициализация клиента Inngest для тестирования SDK')

// Создаем новый экземпляр клиента Inngest
const inngest = new Inngest({ id: 'inngest-test-sdk', logger: console })

// Проверяем наличие необходимых переменных окружения
logger.info(
  `ℹ️ INNGEST_EVENT_KEY: ${process.env.INNGEST_EVENT_KEY ? 'Доступен' : 'Не задан'}`
)
logger.info(
  `ℹ️ INNGEST_SIGNING_KEY: ${process.env.INNGEST_SIGNING_KEY ? 'Доступен' : 'Не задан'}`
)
logger.info(`ℹ️ INNGEST_URL: ${process.env.INNGEST_URL || 'Не задан'}`)

// Определяем тестовую функцию для Inngest
const testFunction = inngest.createFunction(
  { id: 'test-function' },
  { event: 'inngest-test-sdk/test' },
  async ({ event, step }) => {
    logger.info(`⚡ Получено событие: ${JSON.stringify(event)}`)

    // Имитируем выполнение асинхронного шага
    await step.run('test-step', async () => {
      logger.info('🔄 Выполнение тестового шага...')
      await new Promise(resolve => setTimeout(resolve, 500))
      logger.info('✅ Тестовый шаг завершен')
    })

    return {
      status: 'success',
      data: event.data,
    }
  }
)

// Функция для отправки тестового события
async function sendTestEvent() {
  logger.info('🚀 Подготовка к отправке тестового события')

  // Подготавливаем тестовые данные
  const testEventData = {
    message: 'Тестовое сообщение',
    timestamp: Date.now(),
    type: 'test',
  }

  try {
    logger.info(`⚡ Отправка события: ${JSON.stringify(testEventData)}`)

    // Отправляем тестовое событие
    const result = await inngest.send({
      name: 'inngest-test-sdk/test',
      data: testEventData,
    })

    logger.info(`✅ Событие успешно отправлено: ${JSON.stringify(result)}`)
    return true
  } catch (error) {
    if (error instanceof NonRetriableError) {
      logger.error(`❌ Невосстановимая ошибка: ${error.message}`)
    } else {
      logger.error(`❌ Ошибка при отправке события: ${error.message}`)
    }
    return false
  }
}

// Запуск теста
;(async () => {
  logger.info('🚀 Запуск теста Inngest SDK')

  try {
    const success = await sendTestEvent()
    if (success) {
      logger.info('🎉 Тест SDK успешно завершен')
      process.exit(0)
    } else {
      logger.error('❌ Тест SDK завершился с ошибкой')
      process.exit(1)
    }
  } catch (error) {
    logger.error(`❌ Неожиданная ошибка: ${error.message}`)
    process.exit(1)
  }

  // Небольшая задержка для обеспечения обработки логгером всех сообщений
  setTimeout(() => process.exit(0), 1000)
})()
