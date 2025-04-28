import { createFastifyApp } from './fastify-server'
// import { launchBots } from './bot' // Removed unused import
import { logger } from '@/utils/logger'
import { API_SERVER_URL, PORT } from '@/config'

// Порт из конфигурации или по умолчанию 3000
const port = parseInt(PORT || '3000', 10)

/**
 * Запускает API сервер.
 */
async function startApiServer() {
  try {
    logger.info('Starting API server...')
    // await launchBots() // Removed call to non-existent function

    // Создаем, но НЕ запускаем Fastify приложение здесь
    // Запуск будет через Vercel handler или локально для разработки
    const app = await createFastifyApp()
    logger.info('Fastify app created in api-server, ready for handler.')

    // Локальный запуск для разработки можно оставить здесь (если нужно)
    // if (process.env.NODE_ENV !== 'production') {
    //   await app.listen({ port: 3000 });
    //   logger.info('Fastify server listening on port 3000 for development');
    // }

    logger.info(
      `📡 API Server URL: ${API_SERVER_URL || `http://localhost:${port}`}`
    )
    logger.info('✅ API Server started successfully')
  } catch (error) {
    logger.error('❌ Failed to start API server:', error)
    process.exit(1) // Критическая ошибка
  }
}

// Запускаем сервер, если файл запущен напрямую
if (require.main === module) {
  startApiServer().catch(error => {
    // Вызываем оригинальную функцию
    logger.error('Unhandled error starting API server:', error)
    process.exit(1)
  })
}

// Экспортируем оригинальную функцию
export default startApiServer
