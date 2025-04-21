// import express from 'express'
// import { serve } from 'inngest/express'
// import { inngest } from './inngest'
// import multer from 'multer'
// import path from 'path'
// import { Request, Response } from 'express'

// // Конфигурация
// const UPLOAD_DIR = path.join(__dirname, '../uploads')
// const SERVER_PORT = process.env.API_PORT || 3000

// // Настройка Express
// const app = express()
// app.use(express.json())
// app.use(express.urlencoded({ extended: true }))

// // Настройка Multer для загрузки файлов
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, UPLOAD_DIR)
//   },
//   filename: (req, file, cb) => {
//     cb(null, `${Date.now()}-${file.originalname}`)
//   },
// })

// const upload = multer({ storage })

// // Тестовый эндпоинт
// app.get('/health', (req: Request, res: Response) => {
//   res.json({ status: 'ok', timestamp: new Date().toISOString() })
// })

// // Эндпоинт для тестирования Inngest
// app.post('/test-inngest', async (req: Request, res: Response) => {
//   try {
//     await inngest.send({
//       name: 'test/hello.world',
//       data: { message: 'Test from API' },
//     })
//     res.json({ status: 'ok', message: 'Event sent to Inngest' })
//   } catch (error) {
//     console.error('Error sending event to Inngest:', error)
//     res.status(500).json({ status: 'error', message: error.message })
//   }
// })

// // Подключаем Inngest к Express
// const inngestMiddleware = serve({
//   client: inngest,
//   functions: [inngest.helloWorld],
// })

// app.use('/api/inngest', inngestMiddleware)

// // Запускаем сервер
// app.listen(SERVER_PORT, () => {
//   console.log(`🚀 API Server running on port ${SERVER_PORT}`)
//   console.log(`📝 Inngest functions registered`)
// })

// export default app
