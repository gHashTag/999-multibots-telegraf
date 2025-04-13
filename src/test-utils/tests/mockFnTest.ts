import { TestResult } from '../types'
import { createMockFn } from '../mocks/mockFn'
import { logger } from '../../utils/logger'

/**
 * Тест для проверки функциональности createMockFn
 */
export async function runMockFunctionTest(): Promise<TestResult> {
  try {
    logger.info('🧪 Запуск теста для мок-функций')

    // Тест базовой функциональности
    const mockFn = createMockFn()
    mockFn(1, 2, 3)

    // Проверка вызовов
    if (mockFn.mock.calls.length !== 1) {
      throw new Error(
        `❌ Ожидалось 1 вызов, получено ${mockFn.mock.calls.length}`
      )
    }

    if (
      mockFn.mock.calls[0][0] !== 1 ||
      mockFn.mock.calls[0][1] !== 2 ||
      mockFn.mock.calls[0][2] !== 3
    ) {
      throw new Error('❌ Аргументы вызова не соответствуют ожидаемым')
    }

    logger.info('✅ Базовая функциональность проверена')

    // Тест mockReturnValue
    const mockWithReturn = createMockFn()
    mockWithReturn.mockReturnValue('test result')
    const result = mockWithReturn()

    if (result !== 'test result') {
      throw new Error(`❌ Ожидался результат 'test result', получено ${result}`)
    }

    logger.info('✅ mockReturnValue работает корректно')

    // Тест mockResolvedValue
    const mockWithPromise = createMockFn()
    mockWithPromise.mockResolvedValue('async result')
    const promiseResult = await mockWithPromise()

    if (promiseResult !== 'async result') {
      throw new Error(
        `❌ Ожидался результат 'async result', получено ${promiseResult}`
      )
    }

    logger.info('✅ mockResolvedValue работает корректно')

    // Тест mockImplementation
    const mockWithImpl = createMockFn()
    logger.info('⚙️ Тестирую mockImplementation')
    const testImplementation = (a: number, b: number) => a + b
    const modifiedMock = mockWithImpl.mockImplementation(testImplementation)

    // Вызываем полученную функцию
    logger.info('⚙️ Вызываем модифицированную функцию')
    const implResult = modifiedMock(5, 3)

    logger.info(`⚙️ Результат: ${implResult}, тип: ${typeof implResult}`)

    if (implResult !== 8) {
      throw new Error(`❌ Ожидался результат 8, получено ${implResult}`)
    }

    logger.info('✅ mockImplementation работает корректно')

    // Тест mockReset
    mockWithImpl.mockReset()
    if (mockWithImpl.mock.calls.length !== 0) {
      throw new Error(
        `❌ После сброса ожидалось 0 вызовов, получено ${mockWithImpl.mock.calls.length}`
      )
    }

    mockWithImpl(1, 2)
    if (mockWithImpl(1, 2) !== undefined) {
      throw new Error('❌ После сброса ожидался результат undefined')
    }

    logger.info('✅ mockReset работает корректно')

    // Тест mockRejectedValue с try/catch
    const mockWithReject = createMockFn()
    mockWithReject.mockRejectedValue(new Error('test error'))

    try {
      await mockWithReject()
      throw new Error('❌ Ожидалось исключение, но оно не было выброшено')
    } catch (error: any) {
      if (error.message !== 'test error') {
        throw new Error(
          `❌ Ожидалось сообщение 'test error', получено ${error.message}`
        )
      }
    }

    logger.info('✅ mockRejectedValue работает корректно')

    logger.info('🎉 Все тесты для мок-функций прошли успешно')

    return {
      success: true,
      message: 'Тесты для мок-функций успешно пройдены',
      name: 'Тест мок-функций',
    }
  } catch (error: any) {
    logger.error(`❌ Тест мок-функций не пройден: ${error.message}`)
    return {
      success: false,
      message: `Ошибка в тесте мок-функций: ${error.message}`,
      name: 'Тест мок-функций',
    }
  }
}
