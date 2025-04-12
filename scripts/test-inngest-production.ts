// Импортируем библиотеку Inngest
import { Inngest } from 'inngest'
import dotenv from 'dotenv'
import { logger } from '../src/utils/logger'

dotenv.config()

/**
 * Тестирует соединение с Inngest в продакшн окружении.
 * Отправляет тестовое событие и логирует результат.
 */
async function testInngestProduction(): Promise<void> {
  console.log('🚀 Начинаем тест подключения к Inngest в продакшн окружении...')

  // Проверяем наличие необходимых переменных окружения
  const inngestKey = process.env.INNGEST_KEY
  const inngestId = process.env.INNGEST_EVENT_KEY

  if (!inngestKey || !inngestId) {
    console.error(
      '❌ Отсутствуют необходимые переменные окружения: INNGEST_KEY или INNGEST_EVENT_KEY'
    )
    process.exit(1)
  }

  console.log('✅ Переменные окружения проверены')

  // Инициализируем клиент Inngest
  try {
    const inngest = new Inngest({
      name: 'NeuroBlogger',
      id: inngestId,
      eventKey: inngestKey,
    })
    console.log('✅ Inngest клиент инициализирован')

    // Отправляем тестовое событие
    const testId = Date.now()
    console.log(`�� Отправка тестового события с ID: ${testId}...`)

    const result = await inngest.send({
      name: 'test/production',
      data: {
        timestamp: new Date().toISOString(),
        message: 'Тестовое сообщение из продакшн окружения',
        testId: testId,
      },
    })

    console.log('✅ Тестовое событие успешно отправлено в Inngest')
    console.log(`📊 Результат: ${JSON.stringify(result, null, 2)}`)
    console.log('🏁 Тест подключения к Inngest завершен успешно')
  } catch (error) {
    console.error('❌ Ошибка при тестировании подключения к Inngest:')
    console.error(error)
    logger.error('Error testing Inngest connectivity in production', { error })
    process.exit(1)
  }
}

// Запускаем тест
testInngestProduction()
