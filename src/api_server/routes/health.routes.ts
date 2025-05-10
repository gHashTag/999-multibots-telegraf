import {
  Router,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express'

// Явная типизация для переменной router
const router: Router = Router()

// Функциональный обработчик для корневого маршрута
const handleRoot = (req: ExpressRequest, res: ExpressResponse): void => {
  // Временно возвращаем as any для разблокировки
  ;(res as any)
    .status(200)
    .send('API Server is alive and running! (from health.routes)')
  return
}

// Функциональный обработчик для /api/health
const handleApiHealth = (req: ExpressRequest, res: ExpressResponse): void => {
  // Временно возвращаем as any для разблокировки
  ;(res as any).status(200).json({
    status: 'UP',
    source: 'health.routes',
    timestamp: new Date().toISOString(),
  })
  return
}

// Регистрация маршрутов
router.get('/', handleRoot)
router.get('/api/health', handleApiHealth)

export default router
