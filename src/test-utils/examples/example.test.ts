import { createTest, createSuite, assert, assertEqual } from '../test-utils';
import { TestResult } from '../../types/test';
import { logger } from '../../logger';

// Пример асинхронной функции для тестирования
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Пример функции для тестирования
function sum(a: number, b: number): number {
  return a + b;
}

// Создаем тестовый набор
const mathTestSuite = createSuite('Math Tests', [
  createTest('sum should correctly add two numbers', async () => {
    const result = sum(2, 3);
    assertEqual(result, 5);
    return {
      success: true,
      message: 'Sum test passed',
      name: 'sum test'
    };
  }),
  
  createTest('sum should handle negative numbers', async () => {
    const result = sum(-2, 3);
    assertEqual(result, 1);
    return {
      success: true,
      message: 'Negative numbers test passed',
      name: 'negative numbers test'
    };
  })
], {
  beforeAll: async () => {
    logger.info('🚀 Starting math tests...');
    await delay(100); // Имитация настройки
  },
  afterAll: async () => {
    logger.info('🏁 Math tests completed');
    await delay(100); // Имитация очистки
  },
  beforeEach: async () => {
    logger.info('📝 Running test...');
  },
  afterEach: async () => {
    logger.info('✅ Test completed');
  }
});

// Функция для запуска тестов
export async function runMathTests(): Promise<void> {
  logger.info('🧪 Running math test suite...');
  
  const results = await runSuite(mathTestSuite);
  
  logger.info('📊 Test results:');
  results.forEach((result: TestResult) => {
    const icon = result.success ? '✅' : '❌';
    logger.info(`${icon} ${result.name}: ${result.message}`);
  });
} 