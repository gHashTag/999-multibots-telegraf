import { serve } from 'inngest/next'
import { inngest } from './clients'
import { Logger as logger } from '@/utils/logger'
import { Response } from 'node-fetch'
// Импортируем реестр функций и используем все функции
import { functions } from './registry'

// Асинхронная функция для инициализации сервера Inngest
export const initializeInngestServer = async () => {
  try {
    // Подробное логирование функций
    const functionIds = functions.map(f => f.id || f.name || 'unknown')

    logger.info('🔄 Инициализация Inngest сервера', {
      description: 'Initializing Inngest server',
      functions_count: functions.length,
      function_ids: functionIds,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    })

    // Для разработки указываем явно, что сервер работает на порту 2999
    const serveOptions =
      process.env.NODE_ENV === 'development'
        ? {
            baseUrl: 'http://localhost:2999/api/inngest',
          }
        : undefined

    logger.info('⚙️ Параметры Inngest сервера', {
      description: 'Inngest server options',
      baseUrl: serveOptions?.baseUrl || 'default',
      is_development: process.env.NODE_ENV === 'development',
      timestamp: new Date().toISOString(),
    })

    // Возвращаем обработчик serve со всеми зарегистрированными функциями
    const handler = serve({
      client: inngest,
      functions: functions,
      ...serveOptions,
    })

    logger.info('✅ Inngest сервер успешно инициализирован', {
      description: 'Inngest server successfully initialized',
      functions_registered: functions.length,
      timestamp: new Date().toISOString(),
    })

    return handler
  } catch (error) {
    logger.error('❌ Ошибка при инициализации Inngest сервера', {
      description: 'Error initializing Inngest server',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    })

    // В случае ошибки возвращаем пустой обработчик
    return serve({
      client: inngest,
      functions: [],
    })
  }
}

// Инициализируем сервер при импорте и обрабатываем возможные ошибки
let serverPromise
try {
  serverPromise = initializeInngestServer()

  logger.info('🚀 Inngest серверный промис создан', {
    description: 'Inngest server promise created',
    timestamp: new Date().toISOString(),
  })
} catch (error) {
  logger.error('💥 Критическая ошибка при создании Inngest сервера', {
    description: 'Critical error while creating Inngest server',
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
  })

  // Создаем пустой обработчик в случае ошибки
  serverPromise = Promise.resolve(
    serve({
      client: inngest,
      functions: [],
    })
  )
}

// Обработчик POST-запросов для Next.js
export const POST = async (req: any, ctx: any) => {
  try {
    logger.info('📨 Получен POST запрос к Inngest', {
      description: 'POST request received for Inngest',
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString(),
    })

    const server = await serverPromise
    return server.POST(req, ctx)
  } catch (error) {
    logger.error('❌ Ошибка при обработке POST запроса', {
      description: 'Error processing POST request',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString(),
    })

    // Возвращаем ошибку 500
    return new Response('Internal Server Error', { status: 500 }) as Response
  }
}

// Экспортируем также функции для прямого использования
export { functions }
