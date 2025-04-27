import fastify from 'fastify'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fastifyExpress from '@fastify/express'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyCompress from '@fastify/compress'
import fastifyRateLimit from '@fastify/rate-limit'
import { logger } from '@/utils/logger'
import { SECRET_API_KEY } from '@/config'
import { Telegraf } from 'telegraf'
import type { MyContext } from '@/interfaces'
import { botInstances } from './bot'

/**
 * Создает и настраивает экземпляр Fastify, но не запускает его.
 * @returns Готовый к работе экземпляр Fastify.
 */
export async function createFastifyApp(): Promise<FastifyInstance> {
  const server: FastifyInstance = fastify({
    logger: true,
    trustProxy: true, // Важно для получения правильных IP за прокси Vercel
  })

  try {
    // Регистрируем Express совместимость (если еще нужна)
    // await server.register(fastifyExpress)

    // Регистрируем CORS
    await server.register(fastifyCors, {
      origin: ['*'], // В проде лучше ограничить!
      methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
    })

    // Регистрируем Helmet для защиты
    await server.register(fastifyHelmet, {
      contentSecurityPolicy: false, // Отключаем CSP, если он мешает
    })

    // Регистрируем сжатие ответов
    await server.register(fastifyCompress)

    // Настраиваем ограничение запросов (rate limiting)
    // await server.register(fastifyRateLimit, {
    //   max: 100,
    //   timeWindow: '1 minute',
    // })

    // Регистрируем декораторы (если нужны)
    // server.decorateRequest('user', null)

    // Middleware для проверки API ключа (кроме вебхуков)
    server.addHook('preHandler', async (request: FastifyRequest, reply) => {
      const path = request.url
      // Пропускаем проверку для вебхуков и health check
      if (path === '/health' || path.startsWith('/api/webhook')) {
        return
      }
      // Для остальных запросов проверяем ключ
      const apiKey = request.headers['x-api-key']
      if (!apiKey || apiKey !== SECRET_API_KEY) {
        reply.code(401).send({ error: 'Unauthorized' })
        return // Прерываем выполнение
      }
    })

    // Регистрируем роуты
    registerRoutes(server) // Передаем экземпляр в функцию роутов

    // Обработка ошибок
    server.setErrorHandler((error, request, reply) => {
      logger.error('Server error:', error)
      // Не отправляем ответ здесь, Vercel сам обработает ошибку функции
    })

    await server.ready() // Убедимся, что все плагины загружены
    logger.info('Fastify instance created and ready for serverless handler.')
    return server // Возвращаем настроенный экземпляр
  } catch (error) {
    logger.error('Failed to setup Fastify server instance:', error)
    throw error
  }
}

/**
 * Регистрация маршрутов API
 * @param serverInstance Экземпляр Fastify для регистрации роутов
 */
function registerRoutes(serverInstance: FastifyInstance) {
  // Маршрут проверки работоспособности
  serverInstance.get('/health', async (request, reply) => {
    logger.info('Health check requested.')
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  // Вебхук Telegram
  serverInstance.post(
    '/api/webhook/:botId',
    async (
      request: FastifyRequest<{ Params: { botId: string } }>,
      reply: FastifyReply
    ) => {
      const botIdParam = request.params.botId
      logger.info(`Webhook request received for botId param: ${botIdParam}`)

      const botInstance = botInstances.find(
        bot => bot.botInfo?.id.toString() === botIdParam
      )

      if (botInstance) {
        logger.info(
          `Found bot instance for ID: ${botIdParam}, username: ${botInstance.botInfo?.username}`
        )
        try {
          await botInstance.handleUpdate(request.body as any, reply.raw)
          logger.info(
            `Webhook for ${botInstance.botInfo?.username} processed by Telegraf handleUpdate.`
          )
        } catch (error) {
          logger.error(
            `Error processing webhook via Telegraf handleUpdate for bot ${botInstance.botInfo?.username}:`,
            error
          )
          if (!reply.sent) {
            reply.code(500).send({ error: 'Internal webhook processing error' })
          }
        }
      } else {
        logger.warn(`Bot instance not found for ID: ${botIdParam}`)
        reply.code(404).send({ error: 'Bot not found for this webhook' })
      }
    }
  )

  // Вебхук Replicate
  serverInstance.post('/api/replicate-webhook', async (request, reply) => {
    const payload = request.body
    logger.info('Received webhook from Replicate:', payload)
    // TODO: Обработка вебхуков от Replicate
    return { status: 'received' }
  })

  // Генерация image-to-video
  serverInstance.post(
    '/api/generate/image-to-video',
    async (request, reply) => {
      const { modelIdentifier, imageUrl } = request.body as {
        modelIdentifier: string
        imageUrl: string
      }

      if (!modelIdentifier || !imageUrl) {
        return reply.code(400).send({ error: 'Missing required parameters' })
      }

      try {
        // TODO: Имплементация логики преобразования изображения в видео через Replicate
        logger.info('Image to video generation request:', {
          modelIdentifier,
          imageUrl,
        })

        return {
          status: 'processing',
          message: 'Your request is being processed',
          requestId: Date.now().toString(),
        }
      } catch (error) {
        logger.error('Error generating video from image:', error)
        return reply
          .code(500)
          .send({ error: 'Failed to process image to video request' })
      }
    }
  )

  // Robokassa
  serverInstance.post('/api/robokassa/result', async (request, reply) => {
    // TODO: Имплементация логики обработки результатов оплаты
    logger.info('Received payment result from Robokassa')
    return { status: 'ok' }
  })

  // Баланс пользователя GET
  serverInstance.get(
    '/api/user/:telegramId/balance',
    async (request, reply) => {
      const { telegramId } = request.params as { telegramId: string }
      // TODO: Имплементация получения баланса
      return { telegramId, balance: 100 }
    }
  )

  // Баланс пользователя POST
  serverInstance.post(
    '/api/user/:telegramId/balance',
    async (request, reply) => {
      const { telegramId } = request.params as { telegramId: string }
      const { amount } = request.body as { amount: number }
      // TODO: Имплементация обновления баланса
      return { telegramId, updated: true, amount }
    }
  )

  // Заглушка для обновления подписки пользователя
  serverInstance.post(
    '/api/user/:telegramId/subscription',
    async (request, reply) => {
      const { telegramId } = request.params as { telegramId: string }
      const { subscriptionType } = request.body as { subscriptionType: string }
      // TODO: Имплементация обновления подписки
      return { telegramId, updated: true, subscriptionType }
    }
  )
}

// Оставляем экспорт по умолчанию, он понадобится для Vercel
export default server
