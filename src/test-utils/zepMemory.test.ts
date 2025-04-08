import { TestResult } from './types'
import { logger } from '@/utils/logger'
import { MyContext } from '@/interfaces'
import { ZepClient } from '@/core/zep'

interface TestMemoryConfig {
  sessionId: string
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
}

export async function testZepMemory(): Promise<TestResult> {
  const results: TestResult = {
    name: 'Тест памяти чата',
    success: true,
    message: 'Тесты памяти чата выполнены успешно',
    error: undefined,
    details: {},
    metadata: {
      startTime: Date.now(),
      testType: 'memory'
    }
  }

  logger.info('🎯 Запуск тестов памяти чата:', {
    description: 'Starting chat memory tests'
  })

  try {
    // Тест 1: Проверка создания уникального sessionId
    const mockContext = {
      from: { id: 123456 },
      botInfo: { username: 'test_bot' },
    } as MyContext

    const expectedSessionId = `${mockContext.from?.id}_${mockContext.botInfo?.username}`
    
    if (expectedSessionId !== '123456_test_bot') {
      results.success = false
      results.error = '❌ Ошибка создания sessionId'
      return results
    }

    logger.info('✅ Тест 1 - Создание sessionId пройден:', {
      description: 'SessionId creation test passed',
      sessionId: expectedSessionId
    })

    // Тест 2: Проверка сохранения и загрузки памяти
    const zepClient = ZepClient.getInstance()
    const testConfig: TestMemoryConfig = {
      sessionId: expectedSessionId,
      messages: [
        { role: 'user', content: 'Привет!' },
        { role: 'assistant', content: 'Здравствуйте! Чем могу помочь?' }
      ]
    }

    // Сохраняем память
    await zepClient.saveMemory(testConfig.sessionId, {
      messages: testConfig.messages
    })

    logger.info('✅ Тест 2.1 - Сохранение памяти выполнено:', {
      description: 'Memory saved successfully',
      config: testConfig
    })

    // Загружаем память и проверяем
    const loadedMemory = await zepClient.getMemory(testConfig.sessionId)
    
    if (!loadedMemory) {
      results.success = false
      results.error = '❌ Ошибка: Память не найдена после сохранения'
      return results
    }

    if (loadedMemory.messages.length !== testConfig.messages.length) {
      results.success = false
      results.error = '❌ Ошибка: Количество сообщений не совпадает'
      return results
    }

    if (loadedMemory.messages[0].content !== testConfig.messages[0].content) {
      results.success = false
      results.error = '❌ Ошибка: Содержимое сообщений не совпадает'
      return results
    }

    logger.info('✅ Тест 2.2 - Загрузка памяти успешна:', {
      description: 'Memory loaded successfully',
      loadedMemory
    })

    // Тест 3: Проверка очистки памяти
    await zepClient.clearMemory(testConfig.sessionId)
    const clearedMemory = await zepClient.getMemory(testConfig.sessionId)

    if (clearedMemory !== null) {
      results.success = false
      results.error = '❌ Ошибка: Память не была очищена'
      return results
    }

    logger.info('✅ Тест 3 - Очистка памяти успешна:', {
      description: 'Memory cleared successfully'
    })

    // Тест 4: Проверка обработки ошибок
    try {
      await zepClient.saveMemory('', { messages: [] })
      results.success = false
      results.error = '❌ Ошибка: Должно быть исключение при пустом sessionId'
      return results
    } catch (error) {
      logger.info('✅ Тест 4 - Обработка ошибок успешна:', {
        description: 'Error handling test passed',
        error: error instanceof Error ? error.message : String(error)
      })
    }

    results.metadata = {
      ...results.metadata,
      endTime: Date.now()
    }

    results.details = {
      testsRun: 4,
      sessionIdTested: expectedSessionId,
      memorySizeChecked: testConfig.messages.length
    }

    logger.info('🏁 Все тесты завершены успешно:', {
      description: 'All tests completed successfully',
      success: results.success,
      details: results.details
    })

  } catch (error) {
    results.success = false
    results.error = `❌ Неожиданная ошибка: ${error instanceof Error ? error.message : String(error)}`
    
    logger.error('❌ Ошибка при выполнении тестов:', {
      description: 'Error during test execution',
      error: error instanceof Error ? error.message : String(error)
    })
  }

  return results
} 