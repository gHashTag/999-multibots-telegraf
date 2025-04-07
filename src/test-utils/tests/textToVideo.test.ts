import { InngestTester } from '../inngest-tests'
import { TEST_CONFIG } from '../test-config'
import { TestLogger } from '../test-logger'

interface TextToVideoParams {
  prompt: string
  telegram_id: string
  is_ru: boolean
  bot_name: string
}

describe('textToVideo', () => {
  let tester: InngestTester
  let startTime: number

  beforeEach(() => {
    tester = new InngestTester()
    startTime = Date.now()
  })

  it('🎯 должен успешно создавать видео из текста', async () => {
    const testName = 'Тест создания видео из текста'
    TestLogger.logTestStart(testName, {
      tester: 'InngestTester',
      mode: 'textToVideo',
    })

    try {
      const result = await tester.textToVideo({
        prompt: 'Тестовый текст для видео',
        telegram_id: TEST_CONFIG.users.main.telegramId,
        is_ru: true,
        bot_name: TEST_CONFIG.users.main.botName,
      })

      const testResult = TestLogger.createTestResult({
        name: testName,
        success: true,
        message: 'Видео успешно создано',
        details: { videoBuffer: !!result.videoBuffer },
        startTime,
      })

      TestLogger.logTestSuccess(testResult)
      expect(result.success).toBe(true)
      expect(result.videoBuffer).toBeDefined()
    } catch (error) {
      TestLogger.logTestError({
        message: 'Ошибка при создании видео',
        description: 'Error creating video from text',
        error: error as Error,
        context: {
          test: testName,
          tester: 'InngestTester',
        },
      })
      throw error
    }
  })

  it('❌ должен обрабатывать ошибку при отсутствии текста', async () => {
    const testName = 'Тест обработки ошибки при отсутствии текста'
    TestLogger.logTestStart(testName, {
      tester: 'InngestTester',
      mode: 'textToVideo',
    })

    try {
      await expect(
        tester.textToVideo({
          prompt: '',
          telegram_id: TEST_CONFIG.users.main.telegramId,
          is_ru: true,
          bot_name: TEST_CONFIG.users.main.botName,
        })
      ).rejects.toThrow('Missing required fields')

      const testResult = TestLogger.createTestResult({
        name: testName,
        success: true,
        message: 'Ошибка успешно обработана',
        startTime,
      })

      TestLogger.logTestSuccess(testResult)
    } catch (error) {
      TestLogger.logTestError({
        message: 'Неожиданная ошибка в тесте',
        description: 'Unexpected error in error handling test',
        error: error as Error,
        context: {
          test: testName,
          tester: 'InngestTester',
        },
      })
      throw error
    }
  })

  it('💰 должен корректно обрабатывать оплату', async () => {
    const testName = 'Тест обработки оплаты'
    TestLogger.logTestStart(testName, {
      tester: 'InngestTester',
      mode: 'textToVideo',
    })

    try {
      const result = await tester.textToVideo({
        prompt: 'Тестовый текст для видео',
        telegram_id: TEST_CONFIG.users.main.telegramId,
        is_ru: true,
        bot_name: TEST_CONFIG.users.main.botName,
      })

      const testResult = TestLogger.createTestResult({
        name: testName,
        success: true,
        message: 'Оплата успешно обработана',
        details: { paymentProcessed: result.paymentProcessed },
        startTime,
      })

      TestLogger.logTestSuccess(testResult)
      expect(result.paymentProcessed).toBe(true)
    } catch (error) {
      TestLogger.logTestError({
        message: 'Ошибка при обработке оплаты',
        description: 'Error processing payment',
        error,
        context: {
          test: testName,
          tester: 'InngestTester',
        },
      })
      throw error
    }
  })
})
