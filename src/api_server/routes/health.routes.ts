import { Router } from 'express'
import { get100Command } from '../../commands/get100Command'
import { MyContext } from '../../interfaces'
import { defaultSession } from '../../store'

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

// Новый обработчик для /get100
router.get('/get100', async (req: any, res: any) => {
  try {
    // Создаём минимальный mock контекст для get100Command
    const ctx: Partial<MyContext> = {
      from: { id: 1 }, // Можно заменить на req.query.id или req.body.id
      chat: { id: 1 },
      session: { ...defaultSession },
      reply: async (msg: string) => { res.write(msg + '\n'); return { message_id: 1 }; },
      telegram: { deleteMessage: async () => true as true } as any,
      botInfo: { username: 'api_bot' },
    };
    await get100Command(ctx as MyContext)
    res.end('get100Command выполнен')
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

// Регистрация маршрутов
router.get('/', handleRoot)
router.get('/api/health', handleApiHealth)

export default router
