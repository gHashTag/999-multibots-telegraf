import { MyContext } from '@/interfaces'
import {
  createMockContext,
  createMockWizardContext,
} from '../../core/mockContext'
import { TestResult } from '../../core/types'
import {
  assertReplyContains,
  assertReplyMarkupContains,
} from '../../core/assertions'
import { create as mockFunction } from '../../core/mock'
import { TestCategory } from '../../core/categories'
import { logger } from '@/utils/logger'
import { getReferalsCountAndUserData } from '@/core/supabase/getReferalsCountAndUserData'
import { getTranslation } from '@/core'
import { handleMenu } from '@/handlers'
import { checkFullAccess } from '@/scenes/menuScene/checkFullAccess'
import { sendTutorialMessage } from '@/handlers/sendTutorialMessage'
import { CallbackQuery, Message } from 'telegraf/typings/core/types/typegram'

// Мокированные функции
const mockedGetReferalsCountAndUserData =
  mockFunction<typeof getReferalsCountAndUserData>()
const mockedGetTranslation = mockFunction<typeof getTranslation>()
const mockedHandleMenu = mockFunction<typeof handleMenu>()
const mockedCheckFullAccess = mockFunction<typeof checkFullAccess>()
const mockedSendTutorialMessage = mockFunction<typeof sendTutorialMessage>()

// Константы для тестирования
const TEST_USER_ID = 123456789
const TEST_USERNAME = 'test_user'
const TEST_REFERRALS_COUNT = 3
const TEST_LEVEL = 2
const CURRENT_DATE = new Date().toISOString()

/**
 * Настройка тестовой среды
 */
function setupTest() {
  // Настройка моков
  mockedGetReferalsCountAndUserData.mockReturnValue(
    Promise.resolve({
      count: TEST_REFERRALS_COUNT,
      subscription: 'neurophoto',
      level: TEST_LEVEL,
      userData: {
        id: TEST_USER_ID.toString(),
        created_at: CURRENT_DATE,
        user_id: TEST_USER_ID.toString(),
      },
      isExist: true,
    })
  )

  mockedGetTranslation.mockReturnValue(
    Promise.resolve({
      translation: 'Тестовый текст для меню',
      url: 'https://example.com/test-image.jpg',
    })
  )

  mockedCheckFullAccess.mockReturnValue(true)
  mockedHandleMenu.mockReturnValue(Promise.resolve())
  mockedSendTutorialMessage.mockReturnValue(Promise.resolve())

  // Сброс моков между тестами
  mockedGetReferalsCountAndUserData.mockClear()
  mockedGetTranslation.mockClear()
  mockedHandleMenu.mockClear()
  mockedCheckFullAccess.mockClear()
  mockedSendTutorialMessage.mockClear()

  // Мокируем окружение
  process.env.isDev = 'false'
}

/**
 * Тест для входа в сцену меню
 */
export async function testMenuSceneEnter(): Promise<TestResult> {
  try {
    setupTest()

    // Создаем мок-контекст
    const ctx = createMockWizardContext()
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      language_code: 'ru',
    }

    // Запускаем обработчик сцены
    const { menuCommandStep } = await import('@/scenes/menuScene')
    await menuCommandStep(ctx as unknown as MyContext)

    // Проверки
    expect(mockedGetReferalsCountAndUserData).toHaveBeenCalledWith(
      TEST_USER_ID.toString()
    )
    assertReplyContains(ctx, 'Ваш уровень')

    return {
      name: 'menuScene: Вход в сцену меню',
      category: TestCategory.All,
      success: true,
      message: 'Тест входа в сцену меню успешно пройден',
    }
  } catch (error) {
    logger.error('Ошибка в тесте входа в сцену меню:', error)
    return {
      name: 'menuScene: Вход в сцену меню',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест для отображения клавиатуры с подпиской нейрофото
 */
export async function testMenuSceneWithNeuroPhotoSubscription(): Promise<TestResult> {
  try {
    setupTest()

    // Создаем мок-контекст
    const ctx = createMockWizardContext()
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      language_code: 'ru',
    }

    // Настраиваем мок для подписки нейрофото
    mockedGetReferalsCountAndUserData.mockReturnValue(
      Promise.resolve({
        count: TEST_REFERRALS_COUNT,
        subscription: 'neurophoto',
        level: 3,
        userData: {
          id: TEST_USER_ID.toString(),
          created_at: CURRENT_DATE,
          user_id: TEST_USER_ID.toString(),
        },
        isExist: true,
      })
    )

    // Запускаем обработчик сцены
    const { menuCommandStep } = await import('@/scenes/menuScene')
    await menuCommandStep(ctx as unknown as MyContext)

    // Проверки
    assertReplyContains(ctx, 'Главное меню')

    return {
      name: 'menuScene: Отображение клавиатуры с подпиской нейрофото',
      category: TestCategory.All,
      success: true,
      message:
        'Тест отображения клавиатуры с подпиской нейрофото успешно пройден',
    }
  } catch (error) {
    logger.error(
      'Ошибка в тесте отображения клавиатуры с подпиской нейрофото:',
      error
    )
    return {
      name: 'menuScene: Отображение клавиатуры с подпиской нейрофото',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест для отображения клавиатуры с подпиской neurotester
 */
export async function testMenuSceneWithNeuroTesterSubscription(): Promise<TestResult> {
  try {
    setupTest()

    // Создаем мок-контекст
    const ctx = createMockWizardContext()
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      language_code: 'ru',
    }

    // Настраиваем мок для подписки neurotester
    mockedGetReferalsCountAndUserData.mockReturnValue(
      Promise.resolve({
        count: TEST_REFERRALS_COUNT,
        subscription: 'neurotester',
        level: TEST_LEVEL,
        userData: {
          id: TEST_USER_ID.toString(),
          created_at: CURRENT_DATE,
          user_id: TEST_USER_ID.toString(),
        },
        isExist: true,
      })
    )

    // Запускаем обработчик сцены
    const { menuCommandStep } = await import('@/scenes/menuScene')
    await menuCommandStep(ctx as unknown as MyContext)

    // Проверки
    assertReplyContains(ctx, 'Главное меню')
    expect(ctx.wizard.next).toHaveBeenCalled()

    return {
      name: 'menuScene: Отображение клавиатуры с подпиской neurotester',
      category: TestCategory.All,
      success: true,
      message:
        'Тест отображения клавиатуры с подпиской neurotester успешно пройден',
    }
  } catch (error) {
    logger.error(
      'Ошибка в тесте отображения клавиатуры с подпиской neurotester:',
      error
    )
    return {
      name: 'menuScene: Отображение клавиатуры с подпиской neurotester',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест для отображения клавиатуры без полного доступа
 */
export async function testMenuSceneWithoutFullAccess(): Promise<TestResult> {
  try {
    setupTest()

    // Создаем мок-контекст
    const ctx = createMockWizardContext()
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      language_code: 'ru',
    }

    // Настраиваем мок для подписки без полного доступа
    mockedGetReferalsCountAndUserData.mockReturnValue(
      Promise.resolve({
        count: TEST_REFERRALS_COUNT,
        subscription: 'stars',
        level: TEST_LEVEL,
        userData: {
          id: TEST_USER_ID.toString(),
          created_at: CURRENT_DATE,
          user_id: TEST_USER_ID.toString(),
        },
        isExist: true,
      })
    )

    // Обновляем мок для проверки полного доступа
    mockedCheckFullAccess.mockReturnValue(false)

    // Запускаем обработчик сцены
    const { menuCommandStep } = await import('@/scenes/menuScene')
    await menuCommandStep(ctx as unknown as MyContext)

    // Проверки
    expect(mockedSendTutorialMessage).toHaveBeenCalled()

    return {
      name: 'menuScene: Отображение клавиатуры без полного доступа',
      category: TestCategory.All,
      success: true,
      message:
        'Тест отображения клавиатуры без полного доступа успешно пройден',
    }
  } catch (error) {
    logger.error(
      'Ошибка в тесте отображения клавиатуры без полного доступа:',
      error
    )
    return {
      name: 'menuScene: Отображение клавиатуры без полного доступа',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест для обработки выбора подписки из меню
 */
export async function testMenuSceneSelectSubscription(): Promise<TestResult> {
  try {
    setupTest()

    // Создаем расширенный мок-контекст
    const ctx = createMockContext() as any
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      language_code: 'ru',
    }

    // Имитируем коллбэк запрос на разблокировку функций
    const callbackQuery: CallbackQuery = {
      id: 'test-callback-id',
      from: ctx.from,
      chat_instance: 'test-chat-instance',
      data: 'unlock_features',
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: TEST_USER_ID,
          type: 'private',
          first_name: 'Test',
        },
        text: 'Test message',
      } as any,
    }

    // Присваиваем callbackQuery контексту
    ctx.callbackQuery = callbackQuery

    // Запускаем обработчик сцены
    const { menuNextStep } = await import('@/scenes/menuScene')
    await menuNextStep(ctx as unknown as MyContext)

    // Проверки
    expect(ctx.scene.enter).toHaveBeenCalledWith('subscriptionScene')

    return {
      name: 'menuScene: Выбор подписки из меню',
      category: TestCategory.All,
      success: true,
      message: 'Тест выбора подписки из меню успешно пройден',
    }
  } catch (error) {
    logger.error('Ошибка в тесте выбора подписки из меню:', error)
    return {
      name: 'menuScene: Выбор подписки из меню',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест для обработки выбора языка из меню
 */
export async function testMenuSceneSelectLanguage(): Promise<TestResult> {
  try {
    setupTest()

    // Создаем расширенный мок-контекст
    const ctx = createMockContext() as any
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      language_code: 'ru',
    }

    // Имитируем сообщение с выбором языка
    const message: Message = {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: {
        id: TEST_USER_ID,
        type: 'private',
        first_name: 'Test',
      },
      text: '🌐 Выбор языка',
    } as any

    // Присваиваем сообщение контексту
    ctx.message = message

    // Запускаем обработчик сцены
    const { menuNextStep } = await import('@/scenes/menuScene')
    await menuNextStep(ctx as unknown as MyContext)

    // Проверки
    expect(ctx.scene.enter).toHaveBeenCalledWith('languageScene')

    return {
      name: 'menuScene: Выбор языка из меню',
      category: TestCategory.All,
      success: true,
      message: 'Тест выбора языка из меню успешно пройден',
    }
  } catch (error) {
    logger.error('Ошибка в тесте выбора языка из меню:', error)
    return {
      name: 'menuScene: Выбор языка из меню',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест для обработки стандартного пункта меню
 */
export async function testMenuSceneOtherMenuOption(): Promise<TestResult> {
  try {
    setupTest()

    // Создаем расширенный мок-контекст
    const ctx = createMockContext() as any
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      language_code: 'ru',
    }

    // Имитируем сообщение с выбором стандартного пункта меню
    const message: Message = {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: {
        id: TEST_USER_ID,
        type: 'private',
        first_name: 'Test',
      },
      text: '💰 Баланс',
    } as any

    // Присваиваем сообщение контексту
    ctx.message = message

    // Запускаем обработчик сцены
    const { menuNextStep } = await import('@/scenes/menuScene')
    await menuNextStep(ctx as unknown as MyContext)

    // Проверки
    expect(mockedHandleMenu).toHaveBeenCalled()

    return {
      name: 'menuScene: Выбор стандартного пункта меню',
      category: TestCategory.All,
      success: true,
      message: 'Тест выбора стандартного пункта меню успешно пройден',
    }
  } catch (error) {
    logger.error('Ошибка в тесте выбора стандартного пункта меню:', error)
    return {
      name: 'menuScene: Выбор стандартного пункта меню',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест для обработки DEV окружения
 */
export async function testMenuSceneDevEnvironment(): Promise<TestResult> {
  try {
    setupTest()

    // Мокируем DEV окружение
    process.env.isDev = 'true'

    // Создаем мок-контекст
    const ctx = createMockWizardContext()
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      language_code: 'ru',
    }

    // Запускаем обработчик сцены
    const { menuCommandStep } = await import('@/scenes/menuScene')
    await menuCommandStep(ctx as unknown as MyContext)

    // Проверки
    expect(mockedGetReferalsCountAndUserData).not.toHaveBeenCalled()
    assertReplyContains(ctx, 'Ваш уровень')

    // Восстанавливаем окружение
    process.env.isDev = 'false'

    return {
      name: 'menuScene: Проверка DEV окружения',
      category: TestCategory.All,
      success: true,
      message: 'Тест работы в DEV окружении успешно пройден',
    }
  } catch (error) {
    logger.error('Ошибка в тесте работы в DEV окружении:', error)
    // Восстанавливаем окружение
    process.env.isDev = 'false'
    return {
      name: 'menuScene: Проверка DEV окружения',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Запуск всех тестов для menuScene
 */
export async function runMenuSceneTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    results.push(await testMenuSceneEnter())
    results.push(await testMenuSceneWithNeuroPhotoSubscription())
    results.push(await testMenuSceneWithNeuroTesterSubscription())
    results.push(await testMenuSceneWithoutFullAccess())
    results.push(await testMenuSceneSelectSubscription())
    results.push(await testMenuSceneSelectLanguage())
    results.push(await testMenuSceneOtherMenuOption())
    results.push(await testMenuSceneDevEnvironment())
  } catch (error) {
    logger.error('Ошибка при запуске тестов menuScene:', error)
    results.push({
      name: 'menuScene: Общая ошибка',
      category: TestCategory.All,
      success: false,
      message: String(error),
    })
  }

  return results
}

export default runMenuSceneTests
