/**
 * Примеры использования асинхронных функций assert
 */
import assert from '../core/assert';
import { logger } from '@/utils/logger';

// Функция, которая возвращает промис
async function fetchData(shouldSucceed: boolean): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    setTimeout(() => {
      if (shouldSucceed) {
        resolve('Данные получены');
      } else {
        reject(new Error('Ошибка получения данных'));
      }
    }, 100);
  });
}

// Пример 1: проверка успешного промиса
export async function testResolves(): Promise<void> {
  logger.info('Пример 1: проверка успешного промиса');
  
  try {
    // Проверяем, что промис успешно выполняется
    const result = await assert.resolves(fetchData(true));
    logger.info(`Промис успешно выполнен с результатом: ${result}`);
    
    // Дополнительная проверка результата
    assert.equal(result, 'Данные получены');
    logger.info('Тест пройден');
  } catch (error) {
    logger.error(`Тест не пройден: ${(error as Error).message}`);
  }
}

// Пример 2: проверка промиса с ошибкой
export async function testRejects(): Promise<void> {
  logger.info('Пример 2: проверка промиса с ошибкой');
  
  try {
    // Проверяем, что промис завершается с ошибкой
    const error = await assert.rejects(fetchData(false));
    logger.info(`Промис завершился с ошибкой: ${error.message}`);
    
    // Проверка с ожидаемым сообщением ошибки
    await assert.rejects(fetchData(false), /Ошибка получения данных/);
    logger.info('Тест с проверкой сообщения ошибки пройден');
    
    // Проверка с ожидаемым типом ошибки
    await assert.rejects(fetchData(false), Error);
    logger.info('Тест с проверкой типа ошибки пройден');
  } catch (error) {
    logger.error(`Тест не пройден: ${(error as Error).message}`);
  }
}

// Пример 3: проверка, что условие выполняется в течение времени
export async function testEventually(): Promise<void> {
  logger.info('Пример 3: проверка, что условие выполняется в течение времени');
  
  try {
    let counter = 0;
    
    // Каждые 50мс увеличиваем счетчик
    const interval = setInterval(() => {
      counter++;
    }, 50);
    
    // Проверяем, что счетчик достигнет 5 в течение 1 секунды
    await assert.eventually(() => counter >= 5, 1000, 10);
    logger.info(`Счетчик достиг 5 и равен ${counter}`);
    
    clearInterval(interval);
    logger.info('Тест пройден');
  } catch (error) {
    logger.error(`Тест не пройден: ${(error as Error).message}`);
  }
}

// Пример 4: проверка времени выполнения
export async function testCompletesWithin(): Promise<void> {
  logger.info('Пример 4: проверка времени выполнения');
  
  try {
    // Функция, которая выполняется быстро
    const fastFunction = async (): Promise<string> => {
      return 'Быстрый результат';
    };
    
    // Функция, которая выполняется медленно
    const slowFunction = async (): Promise<string> => {
      await new Promise(resolve => setTimeout(resolve, 300));
      return 'Медленный результат';
    };
    
    // Проверяем, что быстрая функция выполняется менее чем за 100мс
    const fastResult = await assert.completesWithin(fastFunction, 100);
    logger.info(`Быстрая функция выполнилась с результатом: ${fastResult}`);
    
    try {
      // Проверяем, что медленная функция выполняется менее чем за 100мс
      await assert.completesWithin(slowFunction, 100);
    } catch (error) {
      logger.info(`Ожидаемая ошибка для медленной функции: ${(error as Error).message}`);
    }
    
    // Проверяем с адекватным таймаутом
    const slowResult = await assert.completesWithin(slowFunction, 500);
    logger.info(`Медленная функция выполнилась с результатом: ${slowResult}`);
    
    logger.info('Тест пройден');
  } catch (error) {
    logger.error(`Тест не пройден: ${(error as Error).message}`);
  }
}

// Запуск всех примеров
export async function runAllAsyncAssertExamples(): Promise<void> {
  logger.info('=== Запуск примеров асинхронных функций assert ===');
  
  await testResolves();
  logger.info('-----------------');
  
  await testRejects();
  logger.info('-----------------');
  
  await testEventually();
  logger.info('-----------------');
  
  await testCompletesWithin();
  logger.info('-----------------');
  
  logger.info('=== Завершение примеров асинхронных функций assert ===');
}

// Если файл запущен напрямую, выполняем все примеры
if (require.main === module) {
  runAllAsyncAssertExamples().catch(error => {
    logger.error(`Произошла непредвиденная ошибка: ${error.message}`);
    process.exit(1);
  });
} 