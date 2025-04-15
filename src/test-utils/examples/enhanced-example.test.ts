/**
 * Пример использования расширенного тестового фреймворка
 */

import { TestSuite, Test, BeforeAll, AfterAll } from '../core/types'
import { expect, testContext, mock } from '../core/enhanced'
import { logger } from '@/utils/logger'

// Класс, который мы будем тестировать
class Calculator {
  add(a: number, b: number): number {
    return a + b
  }

  subtract(a: number, b: number): number {
    return a - b
  }

  multiply(a: number, b: number): number {
    return a * b
  }

  divide(a: number, b: number): number {
    if (b === 0) {
      throw new Error('Division by zero')
    }
    return a / b
  }

  async calculateAsync(
    a: number,
    b: number,
    operation: string
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          switch (operation) {
            case 'add':
              resolve(this.add(a, b))
              break
            case 'subtract':
              resolve(this.subtract(a, b))
              break
            case 'multiply':
              resolve(this.multiply(a, b))
              break
            case 'divide':
              resolve(this.divide(a, b))
              break
            default:
              reject(new Error(`Unknown operation: ${operation}`))
          }
        } catch (error) {
          reject(error)
        }
      }, 100)
    })
  }
}

// Пример тестового набора с использованием расширенного фреймворка
@TestSuite('Enhanced Calculator Tests')
class CalculatorTests {
  private calculator: Calculator

  @BeforeAll()
  async setup() {
    logger.info('📋 Setting up calculator tests...')
    this.calculator = new Calculator()
  }

  @AfterAll()
  async teardown() {
    logger.info('🧹 Cleaning up calculator tests...')
  }

  @Test('should add two numbers correctly')
  async testAddition() {
    // Использование expect для проверки равенства
    expect.toEqual(this.calculator.add(2, 3), 5, 'Addition failed')
  }

  @Test('should subtract two numbers correctly')
  async testSubtraction() {
    expect.toEqual(this.calculator.subtract(5, 3), 2, 'Subtraction failed')
  }

  @Test('should multiply two numbers correctly')
  async testMultiplication() {
    expect.toEqual(this.calculator.multiply(2, 3), 6, 'Multiplication failed')
  }

  @Test('should divide two numbers correctly')
  async testDivision() {
    expect.toEqual(this.calculator.divide(6, 3), 2, 'Division failed')
  }

  @Test('should throw error when dividing by zero')
  async testDivisionByZero() {
    // Использование expect.toThrow для проверки исключений
    expect.toThrow(
      () => this.calculator.divide(5, 0),
      Error,
      'Division by zero'
    )
  }

  @Test('should handle async calculations')
  async testAsyncCalculation() {
    // Использование expect.toResolve для проверки промисов
    const result = await expect.toResolve(
      this.calculator.calculateAsync(2, 3, 'add')
    )
    expect.toEqual(result, 5, 'Async addition failed')
  }

  @Test('should reject with error for unknown operations')
  async testAsyncUnknownOperation() {
    // Использование expect.toReject для проверки отклонения промисов
    await expect.toReject(
      this.calculator.calculateAsync(2, 3, 'unknown'),
      Error
    )
  }

  @Test('should spy on calculator methods')
  async testSpyOnMethods() {
    // Использование spy для отслеживания вызовов методов
    const spy = testContext.spy(this.calculator, 'add')

    // Вызываем метод
    this.calculator.add(5, 3)

    // Проверяем, что метод был вызван с правильными аргументами
    expect.toBeTrue(
      spy.calledWith(5, 3),
      'Method was not called with correct arguments'
    )
    expect.toEqual(
      spy.callCount,
      1,
      'Method was called incorrect number of times'
    )
  }

  @Test('should mock calculator methods')
  async testMockMethod() {
    // Создаем мок метода
    const mockAdd = mock.method(this.calculator, 'add', {
      returnValue: 42,
    })

    // Вызываем метод
    const result = this.calculator.add(5, 3)

    // Проверяем, что мок вернул ожидаемое значение
    expect.toEqual(result, 42, 'Mock returned incorrect value')
    expect.toBeTrue(mockAdd.called, 'Mock was not called')

    // Восстанавливаем оригинальный метод
    mock.restore(this.calculator)

    // Проверяем, что оригинальный метод восстановлен
    expect.toEqual(
      this.calculator.add(5, 3),
      8,
      'Original method was not restored'
    )
  }

  @Test('should capture async operations with snapshot')
  async testSnapshotCapture() {
    // Создаем объект для снапшота
    const operations = {
      add: await this.calculator.calculateAsync(5, 3, 'add'),
      subtract: await this.calculator.calculateAsync(5, 3, 'subtract'),
      multiply: await this.calculator.calculateAsync(5, 3, 'multiply'),
      divide: await this.calculator.calculateAsync(6, 3, 'divide'),
    }

    // Проверяем снапшот
    // Примечание: при первом запуске создаст снапшот,
    // при последующих будет сравнивать с ним
    testContext.snapshot.toMatchSnapshot('calculator-operations', operations)
  }

  @Test('should run code in sandbox')
  async testSandbox() {
    // Сохраняем оригинальное значение process.env.NODE_ENV
    const originalNodeEnv = process.env.NODE_ENV

    // Выполняем код в песочнице
    await testContext.sandbox(async () => {
      // Изменяем переменную окружения
      process.env.NODE_ENV = 'test-sandbox'

      // Выполняем тесты с использованием измененного окружения
      expect.toEqual(process.env.NODE_ENV, 'test-sandbox')

      // Даже если выходим из функции без восстановления,
      // sandbox автоматически восстановит оригинальное значение
    })

    // Проверяем, что оригинальное значение было восстановлено
    expect.toEqual(process.env.NODE_ENV, originalNodeEnv)
  }

  @Test('should handle timeouts')
  async testTimeouts() {
    let completed = false

    // Устанавливаем таймаут через testContext
    testContext.setTimeout(() => {
      completed = true
    }, 50)

    // Ожидаем с помощью утилиты wait
    await testContext.wait(100)

    // Проверяем, что таймаут сработал
    expect.toBeTrue(completed, 'Timeout did not complete')
  }
}

// При запуске файла непосредственно, запускаем тесты
if (require.main === module) {
  import('../core/TestDiscovery').then(async ({ TestDiscovery }) => {
    // Инициализируем тесты из текущего модуля
    const suites = await TestDiscovery.initializeTests(__dirname)
    logger.info(
      `📊 Found ${suites.length} test suites with ${suites.reduce((sum, suite) => sum + suite.tests.length, 0)} tests`
    )

    // Запускаем тесты
    for (const suite of suites) {
      logger.info(`🧪 Running test suite: ${suite.name}`)

      // Запускаем хуки beforeAll
      if (suite.beforeAll) {
        await suite.beforeAll()
      }

      // Запускаем тесты
      for (const test of suite.tests) {
        logger.info(`  🔍 Running test: ${test.name}`)

        try {
          // Устанавливаем имя текущего теста в контексте
          testContext.setCurrentTest(test.name)

          // Запускаем тест
          await test.test()

          logger.info(`  ✅ Test passed: ${test.name}`)
        } catch (error) {
          logger.error(`  ❌ Test failed: ${test.name}`, error)
        }
      }

      // Запускаем хуки afterAll
      if (suite.afterAll) {
        await suite.afterAll()
      }
    }
  })
}
