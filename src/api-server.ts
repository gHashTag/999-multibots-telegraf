import { startFastifyServer } from './fastify-server';
import { logger } from '@/utils/logger';
import { API_SERVER_URL, PORT } from '@/config';

// Порт из конфигурации или по умолчанию 3000
const port = parseInt(PORT || '3000', 10);

async function startApiServer() {
  try {
    logger.info('Starting API server...');
    // Запускаем Fastify сервер
    await startFastifyServer(port);
    
    logger.info(`📡 API Server URL: ${API_SERVER_URL || `http://localhost:${port}`}`);
    logger.info('✅ API Server started successfully');
  } catch (error) {
    logger.error('❌ Failed to start API server:', error);
    process.exit(1);
  }
}

// Запускаем сервер, если файл запущен напрямую
if (require.main === module) {
  startApiServer().catch((error) => {
    logger.error('Unhandled error starting API server:', error);
    process.exit(1);
  });
}

export default startApiServer; 