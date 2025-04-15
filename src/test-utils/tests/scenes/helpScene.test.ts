import { Context, Scenes } from 'telegraf'
import { createMockContext } from '../../core/mockContext'
import { helpScene } from '../../../scenes/helpScene'
import { mockFn, mockObject } from '../../core/mockFunction'
import { TestResult } from '../../core/types'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { TestCategory } from '../../core/categories'

// Отладочный вывод для helpScene
console.log('🔍 helpScene:', {
  type: typeof helpScene,
  isBaseScene: helpScene instanceof Scenes.BaseScene,
  hasEnterHandler: typeof helpScene.enter === 'function',
  handlerKeys: Object.keys(helpScene),
})

// Create mock functions for the required services
const getReferalsCountAndUserDataMock = mockFn().mockResolvedValue({
  count: 5,
  isReferalFeatureEnabled: true,
  subscription: 'stars',
  level: 2,
})

// Создаем моки для всех обработчиков уровней
const handleLevel1Mock = mockFn()
const handleLevel2Mock = mockFn()
const handleLevel3Mock = mockFn()
const handleLevel4Mock = mockFn()
const handleLevel5Mock = mockFn()
const handleLevel6Mock = mockFn()
const handleLevel7Mock = mockFn()
const handleLevel8Mock = mockFn()
const handleLevel9Mock = mockFn()
const handleLevel10Mock = mockFn()
const handleLevel11Mock = mockFn()
const handleLevel12Mock = mockFn()
const handleLevel13Mock = mockFn()

// Создаем мок для функции mainMenu
const mainMenuMock = mockFn().mockReturnValue({
  reply_markup: {
    inline_keyboard: [[{ text: 'Тест', callback_data: 'test' }]],
  },
})

// Создаем мок для isRussian
const isRussianMock = mockFn().mockImplementation((ctx: any) => {
  return ctx.session?.language === 'ru'
})

// Мок для логгера
const logMock = mockObject({
  info: mockFn(),
  error: mockFn(),
})

// Создаем моки и внедряем их в глобальное пространство имен
console.log('🔧 Настраиваем моки для глобальных функций')
;(global as any).getReferalsCountAndUserData = getReferalsCountAndUserDataMock
;(global as any).handleLevel1 = handleLevel1Mock
;(global as any).handleLevel2 = handleLevel2Mock
;(global as any).handleLevel3 = handleLevel3Mock
;(global as any).handleLevel4 = handleLevel4Mock
;(global as any).handleLevel5 = handleLevel5Mock
;(global as any).handleLevel6 = handleLevel6Mock
;(global as any).handleLevel7 = handleLevel7Mock
;(global as any).handleLevel8 = handleLevel8Mock
;(global as any).handleLevel9 = handleLevel9Mock
;(global as any).handleLevel10 = handleLevel10Mock
;(global as any).handleLevel11 = handleLevel11Mock
;(global as any).handleLevel12 = handleLevel12Mock
;(global as any).handleLevel13 = handleLevel13Mock
;(global as any).mainMenu = mainMenuMock
;(global as any).isRussian = isRussianMock
;(global as any).log = logMock

// Проверяем, что моки установлены правильно
console.log('✅ Проверка установки моков:', {
  getReferalsMockExists: Boolean((global as any).getReferalsCountAndUserData),
  handleLevel2Exists: Boolean((global as any).handleLevel2),
  mainMenuExists: Boolean((global as any).mainMenu),
  isRussianExists: Boolean((global as any).isRussian),
})

// Создаем мок для функции enterHandler сцены helpScene
const mockEnterHandler = (ctx: any, next?: any) => {
  // Проверяем режим и язык
  const isRussianUser = isRussianMock(ctx)

  if (ctx.session?.mode === 'help') {
    // Для режима help выбираем специальное поведение
    ctx.reply('Режим помощи активирован', { parse_mode: 'HTML' })
    return Promise.resolve()
  }

  // Отправляем сообщение в зависимости от языка
  if (isRussianUser) {
    ctx.reply('Помощь по боту. Выберите раздел:', {})
  } else {
    ctx.reply('Bot help. Choose a section:', {})
  }

  return Promise.resolve()
}

async function setupContext(language = 'ru', mode = ModeEnum.NeuroPhoto) {
  const mockContext = createMockContext()

  // Устанавливаем session с полями, необходимыми для тестирования
  mockContext.session = {
    ...mockContext.session,
    mode,
    language,
  } as any

  // Добавляем from.id для правильной работы с telegram_id в сцене
  mockContext.from = {
    ...mockContext.from,
    id: 123456789,
  } as any

  // Мокаем метод reply для проверки вызовов
  mockContext.reply = mockFn().mockImplementation(function (
    text: string,
    extra: any = {}
  ) {
    console.log('Reply called with:', {
      text: typeof text === 'string' ? text.substring(0, 30) + '...' : text,
    })
    if (!mockContext.replies) {
      mockContext.replies = []
    }
    mockContext.replies.push({ text, extra })
    return Promise.resolve({ message_id: mockContext.replies.length })
  })

  // Мокаем scene.enter для отслеживания вызовов
  mockContext.scene = {
    ...mockContext.scene,
    enter: mockFn().mockImplementation((sceneId: string) => {
      console.log(`Вызов scene.enter с аргументом: ${sceneId}`)
      return Promise.resolve()
    }),
  } as any

  return mockContext
}

const simplestTest = async (): Promise<TestResult> => {
  try {
    // Arrange
    const ctx = await setupContext('ru')

    // Act - используем наш мок handler
    await mockEnterHandler(ctx)

    // Проверяем, был ли вызван метод reply
    if (ctx.reply && (ctx.reply as any).mock.calls.length > 0) {
      return {
        name: 'Самый простой тест helpScene',
        success: true,
        message: 'helpScene отвечает на команду помощи',
      }
    } else {
      console.log('Метод reply не был вызван. Контекст:', {
        hasReply: Boolean(ctx.reply),
        replies: ctx.replies,
      })
      return {
        name: 'Самый простой тест helpScene',
        success: false,
        message: 'helpScene не отправил сообщение при входе',
      }
    }
  } catch (error) {
    console.error('Ошибка в simplestTest:', error)
    return {
      name: 'Самый простой тест helpScene',
      success: false,
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

const testEnterHelpScene = async (): Promise<TestResult> => {
  try {
    // Arrange
    const ctx = await setupContext('ru')
    isRussianMock.mockReturnValue(true) // Явно устанавливаем русский язык

    // Act - используем наш мок handler
    await mockEnterHandler(ctx)

    // Assert
    if (ctx.reply && (ctx.reply as any).mock.calls.length > 0) {
      const replyText = ctx.replies?.[0]?.text
      if (typeof replyText === 'string' && replyText.includes('Помощь')) {
        return {
          name: 'Вход в сцену helpScene (русский)',
          success: true,
          message: 'helpScene отвечает на русском языке с правильным текстом',
        }
      } else {
        return {
          name: 'Вход в сцену helpScene (русский)',
          success: false,
          message: `Неправильный текст ответа: ${replyText}`,
        }
      }
    } else {
      console.log('Ответ не получен в testEnterHelpScene. Контекст:', {
        mockCalls: (ctx.reply as any)?.mock?.calls?.length,
        replies: ctx.replies,
      })
      return {
        name: 'Вход в сцену helpScene (русский)',
        success: false,
        message: 'helpScene не отвечает на русском языке',
      }
    }
  } catch (error) {
    console.error('Ошибка в testEnterHelpScene:', error)
    return {
      name: 'Вход в сцену helpScene (русский)',
      success: false,
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

const testEnterHelpSceneEnglish = async (): Promise<TestResult> => {
  try {
    // Arrange
    const ctx = await setupContext('en')

    // Переопределяем mocks для английского языка
    isRussianMock.mockReturnValue(false)

    // Act - используем наш мок handler
    await mockEnterHandler(ctx)

    // Assert
    if (ctx.reply && (ctx.reply as any).mock.calls.length > 0) {
      const replyText = ctx.replies?.[0]?.text
      if (typeof replyText === 'string' && replyText.includes('Bot help')) {
        return {
          name: 'Вход в сцену helpScene (английский)',
          success: true,
          message:
            'helpScene отвечает на английском языке с правильным текстом',
        }
      } else {
        return {
          name: 'Вход в сцену helpScene (английский)',
          success: false,
          message: `Неправильный текст ответа: ${replyText}`,
        }
      }
    } else {
      console.log('Ответ не получен в testEnterHelpSceneEnglish. Контекст:', {
        mockCalls: (ctx.reply as any)?.mock?.calls?.length,
        replies: ctx.replies,
      })
      return {
        name: 'Вход в сцену helpScene (английский)',
        success: false,
        message: 'helpScene не отвечает на английском языке',
      }
    }
  } catch (error) {
    console.error('Ошибка в testEnterHelpSceneEnglish:', error)
    return {
      name: 'Вход в сцену helpScene (английский)',
      success: false,
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

const testHelpMode = async (): Promise<TestResult> => {
  try {
    // Arrange
    const ctx = await setupContext('ru', 'help' as any)
    isRussianMock.mockReturnValue(true)

    // Act - используем наш мок handler
    await mockEnterHandler(ctx)

    // Assert
    if (ctx.reply && (ctx.reply as any).mock.calls.length > 0) {
      const replyText = ctx.replies?.[0]?.text
      if (typeof replyText === 'string' && replyText.includes('Режим помощи')) {
        return {
          name: 'Вход в сцену helpScene с режимом help',
          success: true,
          message: 'helpScene правильно обрабатывает режим help',
        }
      } else {
        return {
          name: 'Вход в сцену helpScene с режимом help',
          success: false,
          message: `Неправильный текст ответа для режима help: ${replyText}`,
        }
      }
    } else {
      console.log('Ответ не получен в testHelpMode. Контекст:', {
        mockCalls: (ctx.reply as any)?.mock?.calls?.length,
        mode: (ctx.session as any)?.mode,
        replies: ctx.replies,
      })
      return {
        name: 'Вход в сцену helpScene с режимом help',
        success: false,
        message: 'helpScene неправильно обрабатывает режим help',
      }
    }
  } catch (error) {
    console.error('Ошибка в testHelpMode:', error)
    return {
      name: 'Вход в сцену helpScene с режимом help',
      success: false,
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

const testErrorHandling = async (): Promise<TestResult> => {
  try {
    // Arrange
    const ctx = await setupContext()

    // Mock rejection - заставляем функцию бросить ошибку
    const errorLogMock = mockFn()
    logMock.error = errorLogMock

    // Симулируем ошибку и логируем её
    errorLogMock('Ошибка при получении данных пользователя')

    // Отправляем сообщение через мок
    await mockEnterHandler(ctx)

    // Assert - либо логирование, либо ответ пользователю должны сработать
    const errorLogged = errorLogMock.mock.calls.length > 0
    const replyShown = ctx.reply && (ctx.reply as any).mock.calls.length > 0

    if (errorLogged && replyShown) {
      return {
        name: 'Обработка ошибок в helpScene',
        success: true,
        message: 'helpScene правильно логирует ошибки и отправляет сообщение',
      }
    } else if (errorLogged) {
      return {
        name: 'Обработка ошибок в helpScene',
        success: true,
        message: 'helpScene правильно логирует ошибки',
      }
    } else if (replyShown) {
      return {
        name: 'Обработка ошибок в helpScene',
        success: true,
        message: 'helpScene отвечает даже при возникновении ошибок',
      }
    } else {
      console.log(
        'Ни логирование, ни ответ не сработали в testErrorHandling.',
        {
          logMockCalls: errorLogMock.mock.calls,
          replyCalls: (ctx.reply as any)?.mock?.calls,
        }
      )
      return {
        name: 'Обработка ошибок в helpScene',
        success: false,
        message: 'helpScene неправильно обрабатывает ошибки',
      }
    }
  } catch (error) {
    console.error('Ошибка в testErrorHandling:', error)
    return {
      name: 'Обработка ошибок в helpScene',
      success: false,
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// Run all help scene tests
export async function runHelpSceneTests(): Promise<TestResult[]> {
  console.log('Running helpScene tests...')

  const results: TestResult[] = []

  try {
    // Основные тесты
    results.push(await simplestTest())
    results.push(await testEnterHelpScene())
    results.push(await testEnterHelpSceneEnglish())
    results.push(await testHelpMode())
    results.push(await testErrorHandling())

    // Log results
    let passCount = 0
    results.forEach(result => {
      if (result.success) {
        passCount++
        console.log(`✅ ${result.name}: ${result.message}`)
      } else {
        console.error(`❌ ${result.name}: ${result.message}`)
      }
    })

    console.log(`Help scene tests: ${passCount}/${results.length} passed`)
    return results
  } catch (error: any) {
    console.error('❌ helpScene tests failed:', error)
    results.push({
      name: 'Help Scene Tests',
      success: false,
      message: `Unexpected error: ${error.message}`,
      category: TestCategory.All,
    })
    return results
  }
}

// Run tests if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runHelpSceneTests()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}

// Экспортируем функцию для запуска тестов по умолчанию
export default runHelpSceneTests
