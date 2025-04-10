/**
 * Запуск всех примеров тестового фреймворка
 */
import { logger } from '@/utils/logger';
import { runAllAsyncAssertExamples } from './assert-async-example';

/**
 * Запускает все примеры
 */
async function runAllExamples() {
  logger.info('🚀 Запуск всех примеров тестового фреймворка');
  
  try {
    // Примеры асинхронных функций assert
    await runAllAsyncAssertExamples();
    
    // Другие примеры будут добавлены позже...
    
    logger.info('✅ Все примеры успешно выполнены');
  } catch (error) {
    logger.error(`❌ Ошибка при выполнении примеров: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Если файл запущен напрямую, запускаем все примеры
if (require.main === module) {
  runAllExamples();
} 