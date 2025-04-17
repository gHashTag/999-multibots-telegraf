import * as dotenv from 'dotenv'
import logger from './utils/logger'
import { launchBots, stopBots } from './utils/launch'

// Загружаем переменные окружения
dotenv.config()

/**
 * Главная функция запуска приложения
 */
async function main() {
  try {
    logger.info('Запуск приложения...')

    // Запускаем ботов из настроек
    const bots = await launchBots()

    if (bots.length === 0) {
      logger.error(
        'Не удалось запустить ни одного бота. Проверьте конфигурацию.'
      )
      process.exit(1)
    }

    // Обработка сигналов остановки
    const shutdown = async (signal: string) => {
      logger.info(`Получен сигнал ${signal}, начинаем завершение работы...`)

      try {
        await stopBots(bots)
        logger.info('Приложение корректно завершило работу')
        process.exit(0)
      } catch (error) {
        logger.error(`Ошибка при остановке ботов: ${error}`)
        process.exit(1)
      }
    }

    // Регистрируем обработчики сигналов
    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))

    logger.info('Приложение успешно запущено!')
  } catch (error) {
    logger.error(`Критическая ошибка: ${error}`)
    process.exit(1)
  }
}

// Запускаем приложение
main().catch(error => {
  logger.error(`Непредвиденная ошибка: ${error}`)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Необработанное отклонение промиса: ${reason}`, {
    promise,
    reason,
  })
})

process.on('uncaughtException', error => {
  logger.error(`Неперехваченное исключение: ${error}`, {
    error,
    stack: error.stack,
  })

  // В случае неперехваченного исключения завершаем процесс
  // после логирования через 1 секунду (чтобы успели записаться логи)
  setTimeout(() => {
    process.exit(1)
  }, 1000)
})
