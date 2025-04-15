import { logger } from '@/utils/logger'
import { TestRunner } from '@/test-utils/core/TestRunner'
import assert from '@/test-utils/core/assert'

/**
 * Создает тестовый запуск Inngest-функции
 * @param fn Тестируемая функция
 * @param eventName Имя события Inngest
 * @param params Параметры теста
 */
export const createInngestTest = (
  fn: Function,
  eventName: string,
  params: Record<string, any>
) => {
  const testRunner = new TestRunner(`Inngest Test: ${eventName}`)

  testRunner.test('Успешное выполнение', async () => {
    logger.info('🧪 Запуск теста:', {
      event: eventName,
      params
    })

    const result = await fn(params)
    assert(result.success, 'Функция должна выполниться успешно')
  })

  testRunner.test('Обработка ошибки Inngest', async () => {
    const paramsWithError = {
      ...params,
      _test: { inngest_error: true }
    }

    logger.info('🧪 Запуск теста с ошибкой:', {
      event: eventName,
      params: paramsWithError
    })

    const result = await fn(paramsWithError)
    assert(!result.success, 'Функция должна вернуть ошибку')
    assert(result.error !== undefined, 'Должно быть сообщение об ошибке')
  })

  return testRunner
} 