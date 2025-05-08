import express, { Request, Response } from 'express'

// Определяем порт. Берем из process.env.PORT, если есть, иначе 2999.
// Это соответствует тому, как start.sh устанавливает PORT=2999 для Docker.
const PORT = process.env.PORT || '2999'

export function startApiServer(): void {
  const app = express()

  // Простой middleware для логгирования запросов (опционально)
  app.use((req, res, next) => {
    console.log(`[API Server] Received request: ${req.method} ${req.url}`)
    next()
  })

  // Корневой маршрут для проверки, что сервер жив
  app.get('/', (req: Request, res: Response) => {
    return (res as any).status(200).send('API Server is alive and running!')
  })

  // Пример API-маршрута
  app.get('/api/health', (req: Request, res: Response) => {
    return (res as any)
      .status(200)
      .json({ status: 'UP', timestamp: new Date().toISOString() })
  })

  // Сюда в будущем можно будет добавлять другие маршруты API,
  // например, из swagger.yaml (/api/users, /api/generate и т.д.)

  app
    .listen(PORT, () => {
      console.log(
        `[API Server] Successfully started and listening on port ${PORT}`
      )
    })
    .on('error', error => {
      console.error(
        `[API Server] Failed to start server on port ${PORT}:`,
        error
      )
    })
}
