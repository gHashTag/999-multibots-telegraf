import { logger } from '@/utils/logger'

/**
 * Health check endpoint для Docker container
 * Возвращает статус приложения и основные метрики
 */
export const healthCheck = async (req: any, res: any) => {
  try {
    // Проверяем основные зависимости
    const checks = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      },
      bots: {
        active: true, // В будущем можно добавить проверку активных ботов
      }
    }

    // Возвращаем статус 200 для Docker health check
    res.status(200).json(checks)
  } catch (error) {
    logger.error('Health check failed', { error })
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    })
  }
}