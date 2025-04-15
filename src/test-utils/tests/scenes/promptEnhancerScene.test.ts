import { Scenes } from 'telegraf'
import { MyContext, MyWizardSession } from '@/interfaces'
import { createMockContext } from '@/test-utils/mocks/context'
import {
  MockFunction,
  createMockFunction,
} from '@/test-utils/mocks/mockFunction'
import { TestResult } from '@/test-utils/interfaces'
import { logger } from '@/utils/logger'
import { isRussian } from '@/helpers/language'
import { enhancePrompt } from '@/services/enhancePrompt'
import { promptEnhancerScene } from '@/scenes/promptEnhancerScene'

// Мокируем зависимости
jest.mock('@/helpers/language')
jest.mock('@/services/enhancePrompt')
jest.mock('@/utils/logger')

// Определяем типы для тестов
type MockFunction = jest.Mock

interface TestResult {
  name: string
  category: string
  success: boolean
  message: string
}

interface TestContext extends Omit<MyContext, 'scene'> {
  scene: {
    enter: MockFunction
    leave: MockFunction
    reenter: MockFunction
    session: MyWizardSession
  }
  wizard: {
    next: MockFunction
    back: MockFunction
    selectStep: MockFunction
  }
  message?: {
    text?: string
  }
}

describe('promptEnhancerScene Tests', () => {
  let mockContext: TestContext

  beforeEach(() => {
    // Сбрасываем моки перед каждым тестом
    jest.clearAllMocks()

    // Создаем мок контекст
    mockContext = createMockContext() as unknown as TestContext

    // Мокируем функции определения языка
    ;(isRussian as jest.Mock).mockReturnValue(true)
  })

  // Тест входа в сцену (русский язык)
  async function testPromptEnhancerScene_Enter(): Promise<TestResult> {
    try {
      console.log('🔄 Запуск теста: вход в сцену promptEnhancer (RU)')

      // Получаем первый handler
      const enterHandler = (promptEnhancerScene as any).steps[0]

      // Вызываем handler
      await enterHandler(mockContext)

      // Проверяем, что было отправлено правильное сообщение
      expect(mockContext.reply).toHaveBeenCalledWith(
        '✍️ Пожалуйста, отправьте промпт, который нужно улучшить\n\nПромпт - это текстовое описание для генерации изображения или видео',
        { reply_markup: { remove_keyboard: true } }
      )

      // Проверяем переход к следующему шагу
      expect(mockContext.wizard.next).toHaveBeenCalled()

      console.log('✅ Тест успешно завершен: вход в сцену promptEnhancer (RU)')
      return {
        name: 'testPromptEnhancerScene_Enter',
        category: 'promptEnhancer',
        success: true,
        message: 'Успешный вход в сцену с русским языком',
      }
    } catch (error) {
      console.error(
        '❌ Ошибка в тесте входа в сцену:',
        error instanceof Error ? error.message : String(error)
      )
      return {
        name: 'testPromptEnhancerScene_Enter',
        category: 'promptEnhancer',
        success: false,
        message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  // Тест входа в сцену (английский язык)
  async function testPromptEnhancerScene_EnterEnglish(): Promise<TestResult> {
    try {
      console.log('🔄 Запуск теста: вход в сцену promptEnhancer (EN)')

      // Меняем язык на английский
      ;(isRussian as jest.Mock).mockReturnValue(false)

      // Получаем первый handler
      const enterHandler = (promptEnhancerScene as any).steps[0]

      // Вызываем handler
      await enterHandler(mockContext)

      // Проверяем, что было отправлено правильное сообщение
      expect(mockContext.reply).toHaveBeenCalledWith(
        '✍️ Please send the prompt you want to enhance\n\nA prompt is a text description for generating an image or video',
        { reply_markup: { remove_keyboard: true } }
      )

      console.log('✅ Тест успешно завершен: вход в сцену promptEnhancer (EN)')
      return {
        name: 'testPromptEnhancerScene_EnterEnglish',
        category: 'promptEnhancer',
        success: true,
        message: 'Успешный вход в сцену с английским языком',
      }
    } catch (error) {
      console.error(
        '❌ Ошибка в тесте входа в сцену (EN):',
        error instanceof Error ? error.message : String(error)
      )
      return {
        name: 'testPromptEnhancerScene_EnterEnglish',
        category: 'promptEnhancer',
        success: false,
        message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  // Тест успешного улучшения промпта
  async function testPromptEnhancerScene_EnhancePrompt(): Promise<TestResult> {
    try {
      console.log('🔄 Запуск теста: улучшение промпта')

      // Подготавливаем контекст с сообщением
      mockContext.message = { text: 'Test prompt' }

      // Получаем второй handler
      const enhanceHandler = (promptEnhancerScene as any).steps[1]

      // Вызываем handler
      await enhanceHandler(mockContext)

      // Проверяем вызов сервиса улучшения промпта
      expect(enhancePrompt).toHaveBeenCalledWith('Test prompt', true)

      // Проверяем отправку сообщений
      expect(mockContext.reply).toHaveBeenCalledWith('🔄 Улучшаю промпт...')
      expect(mockContext.reply).toHaveBeenCalledWith(
        '✨ Улучшенная версия:\n\nEnhanced prompt text\n\nТеперь этот промпт должен давать лучшие результаты при генерации.'
      )

      // Проверяем логирование
      expect(logger.info).toHaveBeenCalled()

      console.log('✅ Тест успешно завершен: улучшение промпта')
      return {
        name: 'testPromptEnhancerScene_EnhancePrompt',
        category: 'promptEnhancer',
        success: true,
        message: 'Успешное улучшение промпта',
      }
    } catch (error) {
      console.error(
        '❌ Ошибка в тесте улучшения промпта:',
        error instanceof Error ? error.message : String(error)
      )
      return {
        name: 'testPromptEnhancerScene_EnhancePrompt',
        category: 'promptEnhancer',
        success: false,
        message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  // Тест обработки ошибки при улучшении промпта
  async function testPromptEnhancerScene_HandleError(): Promise<TestResult> {
    try {
      console.log('🔄 Запуск теста: обработка ошибки улучшения промпта')

      // Подготавливаем контекст с сообщением
      mockContext.message = { text: 'Test prompt' }

      // Мокируем ошибку в сервисе
      ;(enhancePrompt as jest.Mock).mockRejectedValue(new Error('Test error'))

      // Получаем второй handler
      const enhanceHandler = (promptEnhancerScene as any).steps[1]

      // Вызываем handler
      await enhanceHandler(mockContext)

      // Проверяем отправку сообщения об ошибке
      expect(mockContext.reply).toHaveBeenCalledWith(
        '❌ Произошла ошибка при улучшении промпта. Пожалуйста, попробуйте позже.'
      )

      // Проверяем логирование ошибки
      expect(logger.error).toHaveBeenCalled()

      console.log(
        '✅ Тест успешно завершен: обработка ошибки улучшения промпта'
      )
      return {
        name: 'testPromptEnhancerScene_HandleError',
        category: 'promptEnhancer',
        success: true,
        message: 'Успешная обработка ошибки',
      }
    } catch (error) {
      console.error(
        '❌ Ошибка в тесте обработки ошибки:',
        error instanceof Error ? error.message : String(error)
      )
      return {
        name: 'testPromptEnhancerScene_HandleError',
        category: 'promptEnhancer',
        success: false,
        message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  // Функция для запуска всех тестов
  async function runPromptEnhancerSceneTests(): Promise<TestResult[]> {
    const results: TestResult[] = []

    results.push(await testPromptEnhancerScene_Enter())
    results.push(await testPromptEnhancerScene_EnterEnglish())
    results.push(await testPromptEnhancerScene_EnhancePrompt())
    results.push(await testPromptEnhancerScene_HandleError())

    return results
  }

  // Запускаем все тесты
  it('should pass all promptEnhancerScene tests', async () => {
    const results = await runPromptEnhancerSceneTests()
    const failedTests = results.filter(result => !result.success)

    if (failedTests.length > 0) {
      console.error('❌ Провалены следующие тесты:')
      failedTests.forEach(test => {
        console.error(`- ${test.name}: ${test.message}`)
      })
      throw new Error('Некоторые тесты не прошли')
    }

    console.log('✅ Все тесты успешно пройдены')
  })
})
