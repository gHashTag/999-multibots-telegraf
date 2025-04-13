import { serve } from 'inngest/next'
import { inngest, createInngestConnection } from './clients'
import { logger } from '@/utils/logger'
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

    // Для режима разработки используем serve API, для продакшн - connect API
    if (
      process.env.NODE_ENV === 'development' &&
      process.env.USE_SERVE === 'true'
    ) {
      logger.info('⚙️ Используем режим serve для локальной разработки', {
        description: 'Using serve mode for local development',
        timestamp: new Date().toISOString(),
      })

      // Для разработки указываем явно, что сервер работает на порту 2999
      const serveOptions = {
        baseUrl: 'http://localhost:2999/api/inngest',
      }

      // Возвращаем обработчик serve со всеми зарегистрированными функциями
      const handler = serve({
        client: inngest,
        functions: functions,
        ...serveOptions,
      })

      logger.info('✅ Inngest сервер (serve) успешно инициализирован', {
        description: 'Inngest server (serve) successfully initialized',
        functions_registered: functions.length,
        timestamp: new Date().toISOString(),
      })

      return handler
    } else {
      // Используем connect API
      logger.info('⚙️ Используем режим connect для постоянного соединения', {
        description: 'Using connect mode for persistent connection',
        timestamp: new Date().toISOString(),
      })

      // Создаем соединение с Inngest
      const connection = await createInngestConnection(functions)

      // Создаем простой обработчик для обратной совместимости
      // ВНИМАНИЕ: Этот обработчик не обрабатывает события в режиме connect,
      // он только возвращает статус 200 и информативное сообщение
      const compatHandler = {
        POST: async () => {
          return new Response(
            JSON.stringify({
              message:
                'Inngest is running in connect mode. Events are handled via persistent connection.',
              timestamp: new Date().toISOString(),
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            }
          )
        },
      }

      logger.info('✅ Inngest сервер (connect) успешно инициализирован', {
        description: 'Inngest server (connect) successfully initialized',
        functions_registered: functions.length,
        connection_state: connection.state,
        timestamp: new Date().toISOString(),
      })

      // Возвращаем совместимый обработчик
      return compatHandler
    }
  } catch (error) {
    logger.error('❌ Ошибка при инициализации Inngest сервера', {
      description: 'Error initializing Inngest server',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    })

    // В случае ошибки возвращаем заглушку обработчика
    return {
      POST: async () => {
        return new Response(
          JSON.stringify({
            error: 'Inngest server initialization failed',
            timestamp: new Date().toISOString(),
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      },
    }
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

  // Создаем заглушку в случае ошибки
  serverPromise = Promise.resolve({
    POST: async () => {
      return new Response(
        JSON.stringify({
          error: 'Inngest server promise creation failed',
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    },
  })
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
