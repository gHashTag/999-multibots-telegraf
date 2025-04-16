import express from 'express'
import robokassaTestRouter from './robokassa/test'
import { logger } from '@/utils/logger'

// Определяем пользовательские типы запроса и ответа
export interface CustomRequest extends express.Request {
  originalUrl: string
  method: string
}

export interface CustomResponse extends express.Response {
  json: (body: any) => CustomResponse
  status: (code: number) => CustomResponse
}

const app = express()

// Middleware для парсинга JSON
app.use(express.json())

// Логирование всех запросов
app.use(
  (req: CustomRequest, res: CustomResponse, next: express.NextFunction) => {
    logger.info('📝 API Request:', {
      method: req.method,
      url: req.originalUrl,
    })
    next()
  }
)

// Регистрируем тестовый роутер для Robokassa
app.use('/api/robokassa', robokassaTestRouter)

// Корневой маршрут
app.get('/', (req: CustomRequest, res: CustomResponse) => {
  logger.info('✅ Root endpoint accessed')
  res.json({ status: 'ok', message: 'API is running' })
})

// Обработка ошибок
app.use((err: Error, req: CustomRequest, res: CustomResponse) => {
  logger.error('❌ API Error:', {
    description: 'API request error',
    error: err.message,
    method: req.method,
    url: req.originalUrl,
  })

  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  })
})

export default app
