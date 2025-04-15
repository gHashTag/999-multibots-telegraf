import { Middleware, Scenes } from 'telegraf'
import { createMockContext } from '../../core/mockContext'
import { mockFn } from '../../core/mockFunction'
import { TestResult } from '../../core/types'
import { TestCategory } from '../../core/categories'
import { logger } from '../../../utils/logger'
import { subscriptionScene } from '../../../scenes/subscriptionScene'
import { MyContext } from '../../../interfaces'
import { ModeEnum } from '../../../price/helpers/modelsCost'
import { LocalSubscription } from '../../../scenes/getRuBillWizard'

// Constants for testing
const TEST_USER_ID = 123456789
const TEST_ADMIN_ID = 987654321
const TEST_USERNAME = 'test_user'

// Mock functions
const getTranslationMock = mockFn().mockImplementation((sceneName, ctx) => {
  const translations: Record<string, string> = {
    ru: 'Варианты подписки',
    en: 'Subscription Options',
  }

  const mockButtons = [
    {
      text: 'Базовая подписка',
      callback_data: 'basic_subscription',
      row: 0,
      en_price: 10,
      ru_price: 750,
      stars_price: 100,
      description: 'Базовая подписка для доступа к основным функциям',
    },
    {
      text: 'Премиум подписка',
      callback_data: 'premium_subscription',
      row: 1,
      en_price: 20,
      ru_price: 1500,
      stars_price: 200,
      description: 'Премиум подписка с расширенными возможностями',
    },
  ]

  const language = ctx.session?.language || 'ru'
  return {
    translation: translations[language],
    buttons: mockButtons,
  }
})

const isRussianMock = mockFn().mockImplementation(ctx => {
  return ctx.session?.language === 'ru'
})

const isValidPaymentSubscriptionMock = mockFn().mockReturnValue(true)
const handleMenuMock = mockFn().mockResolvedValue(true)

// Setup mocks in global space
;(global as any).getTranslation = getTranslationMock
;(global as any).isRussian = isRussianMock
;(global as any).isValidPaymentSubscription = isValidPaymentSubscriptionMock
;(global as any).handleMenu = handleMenuMock

/**
 * Setup test environment
 */
function setupTest() {
  // Reset mocks between tests
  getTranslationMock.mockClear()
  isRussianMock.mockClear()
  isValidPaymentSubscriptionMock.mockClear()
  handleMenuMock.mockClear()

  // Mock environment variables
  process.env.ADMIN_IDS = `${TEST_ADMIN_ID}`
}

// Вспомогательный тип для моковых функций
interface MockFunction<T = any> {
  (...args: any[]): T
  mock: {
    calls: any[][]
    results: any[]
    instances: any[]
  }
  mockClear(): void
  mockReset(): void
  mockImplementation(fn: (...args: any[]) => T): MockFunction<T>
  mockReturnValue(value: T): MockFunction<T>
  mockResolvedValue(value: T): MockFunction<Promise<T>>
}

/**
 * Create a properly typed context for testing
 */
function createTestContext(language = 'ru', isAdmin = false): MyContext {
  const mockCtx = createMockContext() as unknown as MyContext

  // Setup session with required fields
  mockCtx.session = {
    ...(mockCtx.session || {}),
    language,
    buttons: [],
  } as any

  // Setup necessary properties for typing
  ;(mockCtx as any).replies = []
  ;(mockCtx as any).from = {
    id: isAdmin ? TEST_ADMIN_ID : TEST_USER_ID,
    username: TEST_USERNAME,
  }

  // Mock reply method
  mockCtx.reply = mockFn().mockImplementation(function (text, extra = {}) {
    ;(mockCtx as any).replies.push({ text, extra })
    return Promise.resolve({
      message_id: (mockCtx as any).replies.length,
    }) as any
  }) as any

  // Mock scene methods with proper typing for mocks
  mockCtx.scene = {
    enter: mockFn().mockImplementation(sceneId => {
      console.log(`Scene.enter called with arg: ${sceneId}`)
      return Promise.resolve()
    }) as MockFunction<Promise<unknown>>,
    leave: mockFn().mockImplementation(() => {
      console.log('Scene.leave called')
      return Promise.resolve()
    }) as MockFunction<Promise<void>>,
  } as any

  // Setup wizard
  mockCtx.wizard = {
    cursor: 0,
    next: mockFn().mockReturnValue(1),
    step: 0,
  } as any

  return mockCtx
}

/**
 * Safely invoke a handler middleware
 */
async function invokeHandler(handler: any, ctx: MyContext) {
  if (typeof handler === 'function') {
    return await handler(ctx, () => Promise.resolve())
  } else {
    console.error('Handler is not a function:', handler)
    return false
  }
}

/**
 * Test entering subscription scene in Russian
 */
const testSubscriptionSceneEnterRussian = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest()
    const ctx = createTestContext('ru')
    isRussianMock.mockReturnValue(true)

    // Act - invoke the first step of the subscription scene
    const handler = subscriptionScene.steps[0]
    await invokeHandler(handler, ctx)

    // Assert
    if ((ctx as any).replies && (ctx as any).replies.length > 0) {
      const replyText = (ctx as any).replies[0].text
      const replyMarkup = (ctx as any).replies[0].extra?.reply_markup

      if (
        typeof replyText === 'string' &&
        replyText.includes('Варианты подписки') &&
        replyMarkup &&
        replyMarkup.inline_keyboard
      ) {
        return {
          name: 'Вход в сцену subscriptionScene (русский)',
          category: TestCategory.All,
          success: true,
          message:
            'subscriptionScene правильно показывает варианты подписки на русском языке',
        }
      } else {
        return {
          name: 'Вход в сцену subscriptionScene (русский)',
          category: TestCategory.All,
          success: false,
          message: `Неправильный текст ответа или разметка: ${replyText}`,
        }
      }
    } else {
      return {
        name: 'Вход в сцену subscriptionScene (русский)',
        category: TestCategory.All,
        success: false,
        message: 'subscriptionScene не отвечает на русском языке',
      }
    }
  } catch (error) {
    console.error('Ошибка в testSubscriptionSceneEnterRussian:', error)
    return {
      name: 'Вход в сцену subscriptionScene (русский)',
      category: TestCategory.All,
      success: false,
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Test entering subscription scene in English
 */
const testSubscriptionSceneEnterEnglish = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest()
    const ctx = createTestContext('en')
    isRussianMock.mockReturnValue(false)

    // Act - invoke the first step of the subscription scene
    const handler = subscriptionScene.steps[0]
    await invokeHandler(handler, ctx)

    // Assert
    if ((ctx as any).replies && (ctx as any).replies.length > 0) {
      const replyText = (ctx as any).replies[0].text
      const replyMarkup = (ctx as any).replies[0].extra?.reply_markup

      if (
        typeof replyText === 'string' &&
        replyText.includes('Subscription Options') &&
        replyMarkup &&
        replyMarkup.inline_keyboard
      ) {
        return {
          name: 'Вход в сцену subscriptionScene (английский)',
          category: TestCategory.All,
          success: true,
          message:
            'subscriptionScene правильно показывает варианты подписки на английском языке',
        }
      } else {
        return {
          name: 'Вход в сцену subscriptionScene (английский)',
          category: TestCategory.All,
          success: false,
          message: `Неправильный текст ответа или разметка: ${replyText}`,
        }
      }
    } else {
      return {
        name: 'Вход в сцену subscriptionScene (английский)',
        category: TestCategory.All,
        success: false,
        message: 'subscriptionScene не отвечает на английском языке',
      }
    }
  } catch (error) {
    console.error('Ошибка в testSubscriptionSceneEnterEnglish:', error)
    return {
      name: 'Вход в сцену subscriptionScene (английский)',
      category: TestCategory.All,
      success: false,
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Test entering subscription scene as admin user
 */
const testSubscriptionSceneAdminUser = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest()
    const ctx = createTestContext('ru', true)
    isRussianMock.mockReturnValue(true)

    // Act - invoke the first step of the subscription scene
    const handler = subscriptionScene.steps[0]
    await invokeHandler(handler, ctx)

    // Assert
    if ((ctx as any).replies && (ctx as any).replies.length > 0) {
      const replyText = (ctx as any).replies[0].text
      const replyMarkup = (ctx as any).replies[0].extra?.reply_markup

      if (
        typeof replyText === 'string' &&
        replyText.includes('Варианты подписки') &&
        replyMarkup &&
        replyMarkup.inline_keyboard
      ) {
        return {
          name: 'Вход в сцену subscriptionScene (админ)',
          category: TestCategory.All,
          success: true,
          message: 'subscriptionScene правильно работает для администратора',
        }
      } else {
        return {
          name: 'Вход в сцену subscriptionScene (админ)',
          category: TestCategory.All,
          success: false,
          message: `Неправильный текст ответа или разметка для админа: ${replyText}`,
        }
      }
    } else {
      return {
        name: 'Вход в сцену subscriptionScene (админ)',
        category: TestCategory.All,
        success: false,
        message: 'subscriptionScene не отвечает для администратора',
      }
    }
  } catch (error) {
    console.error('Ошибка в testSubscriptionSceneAdminUser:', error)
    return {
      name: 'Вход в сцену subscriptionScene (админ)',
      category: TestCategory.All,
      success: false,
      message: 'Ошибка при выполнении теста для администратора',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Test selecting subscription plan
 */
const testSubscriptionSceneSelectPlan = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest()
    const ctx = createTestContext('ru')

    // Simulate callback query with appropriate mocking
    ;(ctx as any).callbackQuery = {
      id: '12345',
      from: { id: TEST_USER_ID, is_bot: false, first_name: 'Test' },
      chat_instance: '123',
      data: 'premium_subscription',
      message: { message_id: 1 } as any,
    }

    // Setup selectedPayment in session
    ctx.session.selectedPayment = {
      amount: 100,
      stars: 100,
      subscription: undefined,
    }

    ctx.answerCbQuery = mockFn().mockResolvedValue(true) as any

    // Act - invoke the second step of the subscription scene
    const handler = subscriptionScene.steps[1]
    await invokeHandler(handler, ctx)

    // Assert
    if (
      ctx.session?.selectedPayment &&
      ctx.session.selectedPayment.subscription
    ) {
      return {
        name: 'Выбор плана в сцене subscriptionScene',
        category: TestCategory.All,
        success: true,
        message: 'subscriptionScene правильно обрабатывает выбор подписки',
      }
    } else {
      return {
        name: 'Выбор плана в сцене subscriptionScene',
        category: TestCategory.All,
        success: false,
        message: 'subscriptionScene неправильно обрабатывает выбор подписки',
      }
    }
  } catch (error) {
    console.error('Ошибка в testSubscriptionSceneSelectPlan:', error)
    return {
      name: 'Выбор плана в сцене subscriptionScene',
      category: TestCategory.All,
      success: false,
      message: 'Ошибка при выполнении теста выбора подписки',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Test selecting subscription plan in English
 */
const testSubscriptionSceneSelectPlanEnglish =
  async (): Promise<TestResult> => {
    try {
      // Arrange
      setupTest()
      const ctx = createTestContext('en')
      isRussianMock.mockReturnValue(false)

      // Simulate callback query with appropriate mocking
      ;(ctx as any).callbackQuery = {
        id: '12345',
        from: { id: TEST_USER_ID, is_bot: false, first_name: 'Test' },
        chat_instance: '123',
        data: 'basic_subscription',
        message: { message_id: 1 } as any,
      }

      // Setup selectedPayment in session
      ctx.session.selectedPayment = {
        amount: 100,
        stars: 100,
        subscription: undefined,
      }

      ctx.answerCbQuery = mockFn().mockResolvedValue(true) as any

      // Act - invoke the second step of the subscription scene
      const handler = subscriptionScene.steps[1]
      await invokeHandler(handler, ctx)

      // Assert
      const sceneEnterCalled =
        ((ctx.scene.enter as any).mock?.calls?.length || 0) > 0

      if (
        ctx.session?.selectedPayment &&
        ctx.session.selectedPayment.subscription &&
        sceneEnterCalled
      ) {
        return {
          name: 'Выбор плана в сцене subscriptionScene (английский)',
          category: TestCategory.All,
          success: true,
          message:
            'subscriptionScene правильно обрабатывает выбор подписки на английском',
        }
      } else {
        return {
          name: 'Выбор плана в сцене subscriptionScene (английский)',
          category: TestCategory.All,
          success: false,
          message:
            'subscriptionScene неправильно обрабатывает выбор подписки на английском',
        }
      }
    } catch (error) {
      console.error('Ошибка в testSubscriptionSceneSelectPlanEnglish:', error)
      return {
        name: 'Выбор плана в сцене subscriptionScene (английский)',
        category: TestCategory.All,
        success: false,
        message: 'Ошибка при выполнении теста выбора подписки на английском',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

/**
 * Test handling invalid callback
 */
const testSubscriptionSceneInvalidCallback = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest()
    const ctx = createTestContext('ru')

    // Simulate callback query with appropriate mocking
    ;(ctx as any).callbackQuery = {
      id: '12345',
      from: { id: TEST_USER_ID, is_bot: false, first_name: 'Test' },
      chat_instance: '123',
      data: 'invalid_option',
      message: { message_id: 1 } as any,
    }

    ctx.answerCbQuery = mockFn().mockResolvedValue(true) as any

    // Act - invoke the second step of the subscription scene
    const handler = subscriptionScene.steps[1]
    await invokeHandler(handler, ctx)

    // Assert - check if scene was left
    const sceneLeftCalled =
      ((ctx.scene.leave as any).mock?.calls?.length || 0) > 0

    if (sceneLeftCalled) {
      return {
        name: 'Обработка неверного callback в сцене subscriptionScene',
        category: TestCategory.All,
        success: true,
        message: 'subscriptionScene правильно обрабатывает неверный callback',
      }
    } else {
      return {
        name: 'Обработка неверного callback в сцене subscriptionScene',
        category: TestCategory.All,
        success: false,
        message: 'subscriptionScene неправильно обрабатывает неверный callback',
      }
    }
  } catch (error) {
    console.error('Ошибка в testSubscriptionSceneInvalidCallback:', error)
    return {
      name: 'Обработка неверного callback в сцене subscriptionScene',
      category: TestCategory.All,
      success: false,
      message: 'Ошибка при выполнении теста обработки неверного callback',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Test returning to main menu
 */
const testSubscriptionSceneReturnToMainMenu = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest()
    const ctx = createTestContext('ru')

    // Simulate callback query with appropriate mocking
    ;(ctx as any).callbackQuery = {
      id: '12345',
      from: { id: TEST_USER_ID, is_bot: false, first_name: 'Test' },
      chat_instance: '123',
      data: 'mainmenu',
      message: { message_id: 1 } as any,
    }

    ctx.answerCbQuery = mockFn().mockResolvedValue(true) as any

    // Act - invoke the second step of the subscription scene
    const handler = subscriptionScene.steps[1]
    await invokeHandler(handler, ctx)

    // Assert
    const handleMenuCalled = handleMenuMock.mock.calls.length > 0
    const sceneLeaveCalled =
      ((ctx.scene.leave as any).mock?.calls?.length || 0) > 0

    if (handleMenuCalled && sceneLeaveCalled) {
      return {
        name: 'Возврат в главное меню из сцены subscriptionScene',
        category: TestCategory.All,
        success: true,
        message:
          'subscriptionScene правильно обрабатывает возврат в главное меню',
      }
    } else {
      return {
        name: 'Возврат в главное меню из сцены subscriptionScene',
        category: TestCategory.All,
        success: false,
        message:
          'subscriptionScene неправильно обрабатывает возврат в главное меню',
      }
    }
  } catch (error) {
    console.error('Ошибка в testSubscriptionSceneReturnToMainMenu:', error)
    return {
      name: 'Возврат в главное меню из сцены subscriptionScene',
      category: TestCategory.All,
      success: false,
      message: 'Ошибка при выполнении теста возврата в главное меню',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Run all subscription scene tests
 */
export async function runSubscriptionSceneTests(): Promise<TestResult[]> {
  console.log('Running subscriptionScene tests...')

  const results: TestResult[] = []

  try {
    // Run all tests
    results.push(await testSubscriptionSceneEnterRussian())
    results.push(await testSubscriptionSceneEnterEnglish())
    results.push(await testSubscriptionSceneAdminUser())
    results.push(await testSubscriptionSceneSelectPlan())
    results.push(await testSubscriptionSceneSelectPlanEnglish())
    results.push(await testSubscriptionSceneInvalidCallback())
    results.push(await testSubscriptionSceneReturnToMainMenu())

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

    console.log(
      `✅ Тесты сцены подписки: ${passCount}/${results.length} успешно`
    )
    return results
  } catch (error: any) {
    console.error('❌ Тесты сцены подписки завершились с ошибкой:', error)
    results.push({
      name: 'Тесты сцены подписки',
      category: TestCategory.All,
      success: false,
      message: `Неожиданная ошибка: ${error.message}`,
    })
    return results
  }
}

// Run tests if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runSubscriptionSceneTests()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}

// Export default function to run tests
export default runSubscriptionSceneTests
