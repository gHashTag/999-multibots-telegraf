import { MyContext } from '@/interfaces'
import { TestResult } from '../../core/types'
import { TestCategory } from '../../core/categories'
import { logger } from '@/utils/logger'
import { create as mockFunction, MockOptions } from '../../core/mock'
import { OpenAIService } from '@/services/openai'

const TEST_PROMPT_RU = 'Создай изображение кота'
const TEST_PROMPT_EN = 'Create an image of a cat'

interface MockOpenAI {
  createChatCompletion: (params: any) => Promise<any>
}

/**
 * Тестирование улучшения русского промпта
 */
export async function testEnhancePrompt_Russian(): Promise<TestResult> {
  try {
    logger.info('Запуск теста: улучшение русского промпта')

    const mockOpenAI = mockFunction<MockOpenAI>({
      createChatCompletion: async () => ({
        choices: [
          {
            message: {
              content:
                'Создай реалистичное изображение пушистого кота с выразительными глазами',
            },
          },
        ],
      }),
    })

    const result = await OpenAIService.enhancePrompt(
      TEST_PROMPT_RU,
      true,
      mockOpenAI
    )

    if (!result || !result.includes('реалистичное изображение')) {
      throw new Error('Некорректный результат улучшения промпта')
    }

    logger.info('Тест успешно завершен')

    return {
      name: 'EnhancePrompt: Russian Prompt Enhancement',
      category: TestCategory.All,
      success: true,
      message: 'Промпт успешно улучшен на русском языке',
    }
  } catch (err) {
    const error = err as Error
    logger.error('Ошибка в тесте улучшения русского промпта:', error)
    return {
      name: 'EnhancePrompt: Russian Prompt Enhancement',
      category: TestCategory.All,
      success: false,
      message: error.message,
    }
  }
}

/**
 * Тестирование улучшения английского промпта
 */
export async function testEnhancePrompt_English(): Promise<TestResult> {
  try {
    logger.info('Запуск теста: улучшение английского промпта')

    const mockOpenAI = mockFunction<MockOpenAI>({
      createChatCompletion: async () => ({
        choices: [
          {
            message: {
              content:
                'Create a photorealistic image of a fluffy cat with expressive eyes',
            },
          },
        ],
      }),
    })

    const result = await OpenAIService.enhancePrompt(
      TEST_PROMPT_EN,
      false,
      mockOpenAI
    )

    if (!result || !result.includes('photorealistic')) {
      throw new Error('Invalid prompt enhancement result')
    }

    logger.info('Test completed successfully')

    return {
      name: 'EnhancePrompt: English Prompt Enhancement',
      category: TestCategory.All,
      success: true,
      message: 'Prompt successfully enhanced in English',
    }
  } catch (err) {
    const error = err as Error
    logger.error('Error in English prompt enhancement test:', error)
    return {
      name: 'EnhancePrompt: English Prompt Enhancement',
      category: TestCategory.All,
      success: false,
      message: error.message,
    }
  }
}

/**
 * Тестирование обработки ошибок API
 */
export async function testEnhancePrompt_APIError(): Promise<TestResult> {
  try {
    logger.info('Запуск теста: обработка ошибок API')

    const mockOpenAI = mockFunction<MockOpenAI>({
      createChatCompletion: async () => {
        throw new Error('API Error')
      },
    })

    try {
      await OpenAIService.enhancePrompt(TEST_PROMPT_RU, true, mockOpenAI)
      throw new Error('Тест должен был выбросить ошибку')
    } catch (err) {
      const error = err as Error
      if (error.message !== 'API Error') {
        throw error
      }
    }

    logger.info('Тест успешно завершен')

    return {
      name: 'EnhancePrompt: API Error Handling',
      category: TestCategory.All,
      success: true,
      message: 'Ошибка API успешно обработана',
    }
  } catch (err) {
    const error = err as Error
    logger.error('Ошибка в тесте обработки ошибок API:', error)
    return {
      name: 'EnhancePrompt: API Error Handling',
      category: TestCategory.All,
      success: false,
      message: error.message,
    }
  }
}

/**
 * Запуск всех тестов для сервиса enhancePrompt
 */
export async function runEnhancePromptTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    results.push(await testEnhancePrompt_Russian())
    results.push(await testEnhancePrompt_English())
    results.push(await testEnhancePrompt_APIError())
  } catch (err) {
    const error = err as Error
    logger.error('Ошибка при запуске тестов enhancePrompt:', error)
    results.push({
      name: 'EnhancePrompt: General Error',
      category: TestCategory.All,
      success: false,
      message: error.message,
    })
  }

  return results
}

export default runEnhancePromptTests
