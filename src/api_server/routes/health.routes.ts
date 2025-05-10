import { Router } from 'express'

// Явно указываем тип для router
const router: any = Router()

// Функциональный обработчик для корневого маршрута
const handleRoot = (req: any, res: any): void => {
  res.status(200).send('API Server is alive and running! (from health.routes)')
}

// Функциональный обработчик для /api/health
const handleApiHealth = (req: any, res: any): void => {
  res.status(200).json({
    status: 'UP',
    source: 'health.routes',
    timestamp: new Date().toISOString(),
  })
}

// Регистрация маршрутов
router.get('/', handleRoot)
router.get('/api/health', handleApiHealth)

export default router
