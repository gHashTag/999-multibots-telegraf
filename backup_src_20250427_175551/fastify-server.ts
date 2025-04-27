import fastify from 'fastify';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyExpress from '@fastify/express';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyCompress from '@fastify/compress';
import fastifyRateLimit from '@fastify/rate-limit';
import { logger } from '@/utils/logger';
import { SECRET_API_KEY } from '@/config';

const server: FastifyInstance = fastify({
  logger: true,
  trustProxy: true
});

/**
 * Настройка Fastify сервера
 */
async function setupServer() {
  try {
    // Регистрируем Express совместимость для плавной миграции
    await server.register(fastifyExpress);
    
    // Регистрируем CORS
    await server.register(fastifyCors, {
      origin: ['*'],
      methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
    });
    
    // Регистрируем Helmet для защиты
    await server.register(fastifyHelmet, {
      contentSecurityPolicy: false,
    });
    
    // Регистрируем сжатие ответов
    await server.register(fastifyCompress);
    
    // Настраиваем ограничение запросов (rate limiting)
    await server.register(fastifyRateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });

    // Регистрируем декораторы
    server.decorateRequest('user', null);

    // Базовый middleware для проверки API ключа
    server.addHook('preHandler', async (request: FastifyRequest, reply) => {
      const apiKey = request.headers['x-api-key'];
      const path = request.url;

      // Пропускаем проверку для определенных путей
      if (path === '/health' || path.startsWith('/api/webhook')) {
        return;
      }

      // Проверяем API ключ
      if (!apiKey || apiKey !== SECRET_API_KEY) {
        reply.code(401).send({ error: 'Unauthorized' });
        return reply;
      }
    });

    // Регистрируем роуты
    registerRoutes();

    // Обработка ошибок
    server.setErrorHandler((error, request, reply) => {
      logger.error('Server error:', error);
      reply.status(500).send({ error: 'Internal Server Error' });
    });

    return server;
  } catch (error) {
    logger.error('Failed to setup Fastify server:', error);
    throw error;
  }
}

/**
 * Регистрация маршрутов API
 */
function registerRoutes() {
  // Маршрут проверки работоспособности
  server.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Обработчик для вебхука Replicate
  server.post('/api/replicate-webhook', async (request, reply) => {
    const payload = request.body;
    logger.info('Received webhook from Replicate:', payload);
    // TODO: Обработка вебхуков от Replicate
    return { status: 'received' };
  });

  // Генерация изображения из видео
  server.post('/api/generate/image-to-video', async (request, reply) => {
    const { modelIdentifier, imageUrl } = request.body as { modelIdentifier: string, imageUrl: string };
    
    if (!modelIdentifier || !imageUrl) {
      return reply.code(400).send({ error: 'Missing required parameters' });
    }

    try {
      // TODO: Имплементация логики преобразования изображения в видео через Replicate
      logger.info('Image to video generation request:', { modelIdentifier, imageUrl });
      
      return { 
        status: 'processing',
        message: 'Your request is being processed',
        requestId: Date.now().toString()
      };
    } catch (error) {
      logger.error('Error generating video from image:', error);
      return reply.code(500).send({ error: 'Failed to process image to video request' });
    }
  });

  // Обработчик для интеграции с Robokassa
  server.post('/api/robokassa/result', async (request, reply) => {
    // TODO: Имплементация логики обработки результатов оплаты
    logger.info('Received payment result from Robokassa');
    return { status: 'ok' };
  });

  // Заглушка для получения баланса пользователя
  server.get('/api/user/:telegramId/balance', async (request, reply) => {
    const { telegramId } = request.params as { telegramId: string };
    // TODO: Имплементация получения баланса
    return { telegramId, balance: 100 };
  });

  // Заглушка для обновления баланса пользователя
  server.post('/api/user/:telegramId/balance', async (request, reply) => {
    const { telegramId } = request.params as { telegramId: string };
    const { amount } = request.body as { amount: number };
    // TODO: Имплементация обновления баланса
    return { telegramId, updated: true, amount };
  });

  // Заглушка для обновления подписки пользователя
  server.post('/api/user/:telegramId/subscription', async (request, reply) => {
    const { telegramId } = request.params as { telegramId: string };
    const { subscriptionType } = request.body as { subscriptionType: string };
    // TODO: Имплементация обновления подписки
    return { telegramId, updated: true, subscriptionType };
  });
}

/**
 * Запуск сервера Fastify
 */
export async function startFastifyServer(port: number = 3000) {
  try {
    await setupServer();
    await server.listen({ port, host: '0.0.0.0' });
    logger.info(`🚀 Fastify server running on port ${port}`);
  } catch (error) {
    logger.error('Error starting Fastify server:', error);
    process.exit(1);
  }
}

export default server; 