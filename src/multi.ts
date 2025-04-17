import dotenv from 'dotenv'
import logger from './utils/logger'
import { startBotsFromEnv } from './utils/launch'

// Загружаем переменные окружения
dotenv.config()

// Устанавливаем режим работы
const MODE = process.env.MODE || 'longpolling'

async function startBots() {
  try {
    logger.info(`Запуск ботов в режиме ${MODE}`)

    // Запускаем ботов из переменных окружения
    const botsResult = await startBotsFromEnv()

    logger.info(`Успешно запущено ботов: ${botsResult.length}`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Ошибка при запуске ботов: ${errorMessage}`)
    process.exit(1)
  }
}

// Обработка выхода из приложения
process.on('SIGINT', () => {
  logger.info('Получен сигнал SIGINT, закрываем соединения')
  process.exit(0)
})

process.on('SIGTERM', () => {
  logger.info('Получен сигнал SIGTERM, закрываем соединения')
  process.exit(0)
})

// Запускаем ботов
startBots()
