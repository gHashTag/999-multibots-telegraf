import { TestResult, TEST_CONFIG } from './test-config'
import { logger } from '@/utils/logger'
import { generateImageToPrompt } from '@/price/helpers/imageToPrompt'
import { MyContext } from '@/interfaces'
import { inngest } from '@/core/inngest/clients'
import { getBotByName } from '@/core/bot'
import { getUserByTelegramIdString } from '@/core/supabase'

jest.mock('@/core/inngest/clients')
jest.mock('@/core/bot')
jest.mock('@/core/supabase')
jest.mock('@/utils/logger')

describe('ImageToPrompt Tests 🖼️', () => {
  const mockContext = {
    from: {
      username: 'testUser'
    }
  } as MyContext

  const mockImageUrl = 'https://example.com/test.jpg'
  const mockTelegramId = '123456789'
  const mockBotName = 'testBot'

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Мокаем getBotByName
    ;(getBotByName as jest.Mock).mockReturnValue({
      bot: {
        telegram: {
          sendMessage: jest.fn()
        }
      }
    })

    // Мокаем getUserByTelegramIdString
    ;(getUserByTelegramIdString as jest.Mock).mockResolvedValue({
      bot_name: mockBotName
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

  test('Успешная генерация промпта 🎨', async () => {
    const result = await runTest(
      'successful_prompt_generation',
      () => {
        // Setup mocks
      },
      async () => {
        const response = await generateImageToPrompt(
          mockImageUrl,
          mockTelegramId,
          mockContext,
          true,
          mockBotName
        )

        expect(response).toBeNull()
        expect(inngest.send).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'image/to-prompt.generate',
            data: expect.objectContaining({
              image: mockImageUrl,
              telegram_id: mockTelegramId,
              is_ru: true,
              bot_name: mockBotName
            })
          })
        )
      }
    )

    expect(result.success).toBe(true)
  })

  test('Ошибка при отсутствии имени бота ⚠️', async () => {
    const result = await runTest(
      'missing_bot_name',
      () => {
        // Setup mocks
      },
      async () => {
        await expect(
          generateImageToPrompt(
            mockImageUrl,
            mockTelegramId,
            mockContext,
            true,
            ''
          )
        ).rejects.toThrow('Bot name is required')
      }
    )

    expect(result.success).toBe(true)
  })

  test('Ошибка при несуществующем боте 🤖', async () => {
    const result = await runTest(
      'nonexistent_bot',
      () => {
        ;(getBotByName as jest.Mock).mockReturnValue({ bot: null })
      },
      async () => {
        await expect(
          generateImageToPrompt(
            mockImageUrl,
            mockTelegramId,
            mockContext,
            true,
            'nonexistentBot'
          )
        ).rejects.toThrow('Bot nonexistentBot not found')
      }
    )

    expect(result.success).toBe(true)
  })

  test('Ошибка при несуществующем пользователе 👤', async () => {
    const result = await runTest(
      'nonexistent_user',
      () => {
        ;(getUserByTelegramIdString as jest.Mock).mockResolvedValue(null)
      },
      async () => {
        await expect(
          generateImageToPrompt(
            mockImageUrl,
            mockTelegramId,
            mockContext,
            true,
            mockBotName
          )
        ).rejects.toThrow('User not found')
      }
    )

    expect(result.success).toBe(true)
  })

  test('Ошибка при несоответствии бота пользователя 🔄', async () => {
    const result = await runTest(
      'user_bot_mismatch',
      () => {
        ;(getUserByTelegramIdString as jest.Mock).mockResolvedValue({
          bot_name: 'differentBot'
        })
      },
      async () => {
        await expect(
          generateImageToPrompt(
            mockImageUrl,
            mockTelegramId,
            mockContext,
            true,
            mockBotName
          )
        ).rejects.toThrow('User does not have access to this bot')
      }
    )

    expect(result.success).toBe(true)
  })
}) 