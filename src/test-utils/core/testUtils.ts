import { MyContext } from '@/interfaces';
import { TestResult } from './types';
import { TestCategory } from './categories';
import { logger } from '@/utils/logger';

/**
 * Базовая функция для создания теста сцены
 */
export function createSceneTest(
  name: string,
  testFn: (context: MyContext) => Promise<void>
): (context: MyContext) => Promise<TestResult> {
  return async (context: MyContext): Promise<TestResult> => {
    try {
      logger.info(`Starting test: ${name}`);
      await testFn(context);
      
      return {
        name,
        category: TestCategory.Scenes,
        success: true,
        message: 'Test completed successfully'
      };
    } catch (error) {
      logger.error(`Test failed: ${name}`, error);
      return {
        name,
        category: TestCategory.Scenes,
        success: false,
        message: `Test failed: ${error}`
      };
    }
  };
}

/**
 * Функция для запуска группы тестов
 */
export async function runTestGroup(
  groupName: string,
  tests: Array<(context: MyContext) => Promise<TestResult>>
): Promise<TestResult[]> {
  logger.info(`Starting test group: ${groupName}`);
  const results: TestResult[] = [];
  
  for (const test of tests) {
    try {
      const result = await test(createMockContext());
      results.push(result);
    } catch (error) {
      results.push({
        name: `${groupName}: Unexpected error`,
        category: TestCategory.Scenes,
        success: false,
        message: `Test execution failed: ${error}`
      });
    }
  }
  
  return results;
}

/**
 * Функция для проверки вызова метода мока
 */
export function assertMockCalled<T extends (...args: any[]) => any>(
  mock: MockFunction<T>,
  expectedArgs?: Parameters<T>
): void {
  if (!mock.mock.calls.length) {
    throw new Error('Expected mock to be called but it was not called');
  }
  
  if (expectedArgs) {
    const actualArgs = mock.mock.calls[0];
    if (!arraysEqual(actualArgs, expectedArgs)) {
      throw new Error(
        `Expected mock to be called with ${JSON.stringify(expectedArgs)} but it was called with ${JSON.stringify(actualArgs)}`
      );
    }
  }
}

/**
 * Вспомогательная функция для сравнения массивов
 */
function arraysEqual(a: any[], b: any[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export { createMockContext } from './mockContext';
export { MockFunction } from './mock';
export { TestCategory } from './categories';
export { TestResult } from './types'; 