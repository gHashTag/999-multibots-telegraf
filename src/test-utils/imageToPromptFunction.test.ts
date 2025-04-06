import { TestResult, TEST_CONFIG } from './test-config'
import { logger } from '@/utils/logger'
import { imageToPromptFunction } from '@/inngest-functions/imageToPrompt'
import { getBotByName } from '@/core/bot'
import { getUserBalance } from '@/core/supabase'
import { inngest } from '@/core/inngest/clients'
import axios from 'axios'

jest.mock('@/core/bot')
jest.mock('@/core/supabase')
jest.mock('@/utils/logger')
jest.mock('axios')
jest.mock('@/core/inngest/clients', () => ({
  inngest: {
    send: jest.fn().mockResolvedValue({}),
    createFunction: jest.fn().mockReturnValue({
      fn: jest.fn()
    })
  }
}))

describe('ImageToPromptFunction Tests 🤖', () => {
  const mockEvent = {
    data: {
      image: 'https://example.com/test.jpg',
      telegram_id: '123456789',
      username: 'testUser',
      is_ru: true,
      bot_name: 'testBot',
      cost_per_image: 10
    }
  }

  const mockBot = {
    telegram: {
      sendMessage: jest.fn()
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // Мокаем getBotByName
    ;(getBotByName as jest.Mock).mockReturnValue({ bot: mockBot })

    // Мокаем getUserBalance
    ;(getUserBalance as jest.Mock).mockResolvedValue(100)

    // Мокаем axios
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { event_id: 'test-event-id' }
    })
    ;(axios.get as jest.Mock).mockResolvedValue({
      data: 'data: ["", "Generated prompt description"]'
    })

    // Мокаем inngest.send
    ;(inngest.send as jest.Mock).mockResolvedValue({})
  })

  const runTest = async (
    testName: string,
    setup: () => void,
    assertions: () => Promise<void>
  ): Promise<TestResult> => {
    try {
      logger.info('🎯 Начало теста', {
        description: `Starting test: ${testName}`,
        test_name: testName
      })

      setup()
      await assertions()

      logger.info('✅ Тест успешно завершен', {
        description: `Test completed successfully: ${testName}`,
        test_name: testName
      })

      return {
        success: true,
        name: testName
      }
    } catch (error) {
      logger.error('❌ Ошибка в тесте', {
        description: `Test failed: ${testName}`,
        test_name: testName,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      return {
        success: false,
        name: testName,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  test('Успешная обработка события 🎨', async () => {
    const result = await runTest(
      'successful_event_processing',
      () => {
        // Setup mocks
      },
      async () => {
        await inngest.send({
          name: 'image/to-prompt.generate',
          data: mockEvent.data
        })

        expect(inngest.send).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'payment/process',
            data: expect.objectContaining({
              telegram_id: mockEvent.data.telegram_id,
              amount: mockEvent.data.cost_per_image
            })
          })
        )

        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          mockEvent.data.telegram_id,
          expect.any(String)
        )
      }
    )

    expect(result.success).toBe(true)
  })

  test('Ошибка при отправке запроса к API ⚠️', async () => {
    const result = await runTest(
      'api_request_error',
      () => {
        ;(axios.post as jest.Mock).mockRejectedValue(new Error('API Error'))
      },
      async () => {
        await inngest.send({
          name: 'image/to-prompt.generate',
          data: mockEvent.data
        })

        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          mockEvent.data.telegram_id,
          expect.stringContaining('Произошла ошибка')
        )
      }
    )

    expect(result.success).toBe(true)
  })

  test('Ошибка при получении результата 🔄', async () => {
    const result = await runTest(
      'result_fetch_error',
      () => {
        ;(axios.get as jest.Mock).mockRejectedValue(new Error('Fetch Error'))
      },
      async () => {
        await inngest.send({
          name: 'image/to-prompt.generate',
          data: mockEvent.data
        })

        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          mockEvent.data.telegram_id,
          expect.stringContaining('Произошла ошибка')
        )
      }
    )

    expect(result.success).toBe(true)
  })

  test('Успешная обработка платежа 💰', async () => {
    const result = await runTest(
      'successful_payment_processing',
      () => {
        // Setup mocks
      },
      async () => {
        await inngest.send({
          name: 'image/to-prompt.generate',
          data: mockEvent.data
        })

        expect(inngest.send).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'payment/process',
            data: expect.objectContaining({
              telegram_id: mockEvent.data.telegram_id,
              amount: mockEvent.data.cost_per_image,
              type: 'money_expense'
            })
          })
        )
      }
    )

    expect(result.success).toBe(true)
  })

  test('Корректная обработка ответа API 📝', async () => {
    const mockPrompt = 'Generated prompt description'
    
    const result = await runTest(
      'api_response_processing',
      () => {
        ;(axios.get as jest.Mock).mockResolvedValue({
          data: `data: ["", "${mockPrompt}"]`
        })
      },
      async () => {
        await inngest.send({
          name: 'image/to-prompt.generate',
          data: mockEvent.data
        })

        expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
          mockEvent.data.telegram_id,
          expect.stringContaining(mockPrompt)
        )
      }
    )

    expect(result.success).toBe(true)
  })
}) 