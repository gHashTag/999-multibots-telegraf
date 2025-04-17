import dotenv from 'dotenv'
import logger from './utils/logger'
import { startBotsFromEnv, stopBots } from './utils/launch'

// Загружаем переменные окружения
dotenv.config()

// Устанавливаем режим работы
const MODE = process.env.MODE || 'longpolling'

// Храним запущенные боты
let runningBots = []

async function startBots() {
  try {
    logger.info(`Запуск ботов в режиме ${MODE}`)

    // Запускаем ботов из переменных окружения
    runningBots = await startBotsFromEnv()

    logger.info(`Успешно запущено ботов: ${runningBots.length}`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Ошибка при запуске ботов: ${errorMessage}`)
    process.exit(1)
  }
}

// Функция для корректного завершения работы
async function shutdown() {
  logger.info('Получен сигнал завершения, останавливаем ботов...')

  try {
    // Останавливаем все боты
    await stopBots(runningBots)
    logger.info('Все боты успешно остановлены')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Ошибка при остановке ботов: ${errorMessage}`)
  }

  logger.info('Завершение работы приложения')
  process.exit(0)
}

// Обработка выхода из приложения
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Запускаем ботов
startBots()
