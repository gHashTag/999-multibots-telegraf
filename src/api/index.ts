import express from 'express'
import robokassaTestRouter from './robokassa/test'
import { logger } from '@/utils/logger'

const app = express()

// Middleware для парсинга JSON
app.use(express.json())

// Регистрируем тестовый роутер для Robokassa
app.use('/api/robokassa', robokassaTestRouter)

// Обработка ошибок
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error('❌ API Error:', {
      description: 'API request error',
      error: err.message,
    })

    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    })
  }
)

export default app
