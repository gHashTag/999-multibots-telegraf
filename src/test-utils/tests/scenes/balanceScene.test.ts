import { Middleware } from 'telegraf'
import { createMockContext } from '../../core/mockContext'
import { TestResult } from '../../core/types'
import { assertReplyContains, assertScene } from '../../core/assertions'
import { create as mockFunction } from '../../core/mock'
import { TestCategory } from '../../core/categories'
import { logger } from '../../../utils/logger'
import { ModeEnum } from '../../../price/helpers/modelsCost'
import type { MyContext } from '../../../interfaces'

// Константы для тестирования
const TEST_USER_ID = 123456789
const TEST_USERNAME = 'test_user'

/**
 * Настройка тестовой среды
 */
function setupTest() {
  // Сброс моков между тестами
}

/**
 * Тест для входа в сцену баланса с базовой информацией
 */
export async function testBalanceSceneEnter(): Promise<TestResult> {
  try {
    setupTest()

    // Создаем мок-контекст
    const ctx = createMockContext()
    ctx.from = {
      id: TEST_USER_ID,
      username: TEST_USERNAME,
      language_code: 'ru',
    } as any
    ctx.session = {
      mode: ModeEnum.BalanceScene,
      balance: 100,
      isAdmin: false,
      language: 'ru',
    } as any

    // Мокируем функцию получения статистики баланса
    const mockGetUserBalanceStats = mockFunction().mockReturnValue(
      Promise.resolve({
        stars: 100,
        total_added: 150,
        total_spent: 50,
        bonus_stars: 20,
        added_stars: 30,
        added_rub: 120,
        services: {},
        payment_methods: {},
        payments: [],
      })
    )

    // Подменяем реальную функцию на мок
    const supabaseModule = await import('../../../core/supabase')
    Object.defineProperty(supabaseModule, 'getUserBalanceStats', {
      value: mockGetUserBalanceStats,
    })

    // Импортируем сцену баланса
    const { balanceScene } = await import('../../../scenes/balanceScene')

    // Вызываем обработчик входа в сцену
    await ctx.scene.enter(ModeEnum.BalanceScene)

    // Запускаем первый шаг сцены вручную (если enter не сработает полностью)
    if (balanceScene.steps && balanceScene.steps.length > 0) {
      const firstStep = balanceScene.steps[0]
      // Проверяем, что объект является функцией перед вызовом
      if (typeof firstStep === 'function') {
        await firstStep(ctx)
      }
    }

    // Проверки
    assertReplyContains(ctx, 'Информация о балансе')
    assertReplyContains(ctx, 'Текущий баланс: 100.00')
    assertReplyContains(ctx, 'Бонусные звезды: 20.00')
    assertReplyContains(ctx, 'Всего пополнено: 150.00')
    assertReplyContains(ctx, 'Всего потрачено: 50.00')

    return {
      name: 'BalanceScene: Enter Scene',
      category: TestCategory.All,
      success: true,
      message: 'Тест входа в сцену баланса успешно пройден',
    }
  } catch (error) {
    logger.error('Ошибка в тесте входа в сцену баланса:', error)
    return {
      name: 'BalanceScene: Enter Scene',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест для сцены баланса с историей платежей
 */
export async function testBalanceSceneWithPaymentHistory(): Promise<TestResult> {
  try {
    setupTest()

    // Создаем мок-контекст
    const ctx = createMockContext()
    ctx.from = {
      id: TEST_USER_ID,
      username: TEST_USERNAME,
      language_code: 'ru',
    } as any
    ctx.session = {
      mode: ModeEnum.BalanceScene,
      balance: 100,
      isAdmin: false,
      language: 'ru',
    } as any

    // Текущая дата для платежей
    const currentDate = new Date()
    const yesterday = new Date(currentDate)
    yesterday.setDate(currentDate.getDate() - 1)
    const lastWeek = new Date(currentDate)
    lastWeek.setDate(currentDate.getDate() - 7)

    // Мокируем функцию получения статистики баланса с историей платежей
    const mockGetUserBalanceStats = mockFunction().mockReturnValue(
      Promise.resolve({
        stars: 100,
        total_added: 150,
        total_spent: 50,
        bonus_stars: 20,
        added_stars: 30,
        added_rub: 120,
        services: {
          neuroPhotoWizard: 30,
          textToVideoWizard: 20,
        },
        payment_methods: {
          STARS: 30,
          RUB: 120,
        },
        payments: [
          {
            status: 'COMPLETED',
            type: 'money_income',
            currency: 'RUB',
            amount: 1000,
            stars: 100,
            payment_date: currentDate.toISOString(),
          },
          {
            status: 'COMPLETED',
            type: 'money_income',
            currency: 'RUB',
            amount: 200,
            stars: 20,
            payment_date: yesterday.toISOString(),
          },
          {
            status: 'COMPLETED',
            type: 'money_income',
            currency: 'STARS',
            amount: 30,
            stars: 30,
            payment_date: lastWeek.toISOString(),
          },
          {
            status: 'COMPLETED',
            type: 'system',
            currency: 'STARS',
            amount: 20,
            stars: 20,
            payment_date: lastWeek.toISOString(),
          },
        ],
      })
    )

    // Подменяем реальную функцию на мок
    const supabaseModule = await import('../../../core/supabase')
    Object.defineProperty(supabaseModule, 'getUserBalanceStats', {
      value: mockGetUserBalanceStats,
    })

    // Импортируем сцену баланса
    const { balanceScene } = await import('../../../scenes/balanceScene')

    // Вызываем обработчик входа в сцену
    await ctx.scene.enter(ModeEnum.BalanceScene)

    // Запускаем первый шаг сцены вручную (если enter не сработает полностью)
    if (balanceScene.steps && balanceScene.steps.length > 0) {
      const firstStep = balanceScene.steps[0]
      // Проверяем, что объект является функцией перед вызовом
      if (typeof firstStep === 'function') {
        await firstStep(ctx)
      }
    }

    // Проверки основной информации
    assertReplyContains(ctx, 'Информация о балансе')
    assertReplyContains(ctx, 'Текущий баланс: 100.00')

    // Проверки истории платежей
    assertReplyContains(ctx, 'История платежей')
    assertReplyContains(ctx, 'Всего пополнено: 150.00')
    assertReplyContains(ctx, 'Куплено за рубли')
    assertReplyContains(ctx, '1000 ₽ = 100 ⭐️')
    assertReplyContains(ctx, '200 ₽ = 20 ⭐️')
    assertReplyContains(ctx, 'Куплено за звезды')

    // Проверки детализации поступлений
    assertReplyContains(ctx, 'Детализация поступлений')
    assertReplyContains(ctx, 'Пополнено через оплату')
    assertReplyContains(ctx, 'Прямое пополнение звезд')
    assertReplyContains(ctx, 'Бонусные начисления')

    return {
      name: 'BalanceScene: Payment History',
      category: TestCategory.All,
      success: true,
      message: 'Тест сцены баланса с историей платежей успешно пройден',
    }
  } catch (error) {
    logger.error('Ошибка в тесте сцены баланса с историей платежей:', error)
    return {
      name: 'BalanceScene: Payment History',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест для сцены баланса на английском языке
 */
export async function testBalanceSceneEnglishLanguage(): Promise<TestResult> {
  try {
    setupTest()

    // Создаем мок-контекст
    const ctx = createMockContext()
    ctx.from = {
      id: TEST_USER_ID,
      username: TEST_USERNAME,
      language_code: 'en',
    } as any
    ctx.session = {
      mode: ModeEnum.BalanceScene,
      balance: 100,
      isAdmin: false,
      language: 'en',
    } as any

    // Мокируем функцию получения статистики баланса
    const mockGetUserBalanceStats = mockFunction().mockReturnValue(
      Promise.resolve({
        stars: 100,
        total_added: 150,
        total_spent: 50,
        bonus_stars: 20,
        added_stars: 30,
        added_rub: 120,
        services: {},
        payment_methods: {},
        payments: [],
      })
    )

    // Подменяем реальную функцию на мок
    const supabaseModule = await import('../../../core/supabase')
    Object.defineProperty(supabaseModule, 'getUserBalanceStats', {
      value: mockGetUserBalanceStats,
    })

    // Импортируем сцену баланса
    const { balanceScene } = await import('../../../scenes/balanceScene')

    // Вызываем обработчик входа в сцену
    await ctx.scene.enter(ModeEnum.BalanceScene)

    // Запускаем первый шаг сцены вручную (если enter не сработает полностью)
    if (balanceScene.steps && balanceScene.steps.length > 0) {
      const firstStep = balanceScene.steps[0]
      // Проверяем, что объект является функцией перед вызовом
      if (typeof firstStep === 'function') {
        await firstStep(ctx)
      }
    }

    // Проверки на английском языке
    assertReplyContains(ctx, 'Balance Information')
    assertReplyContains(ctx, 'Current balance: 100.00')
    assertReplyContains(ctx, 'Bonus stars: 20.00')
    assertReplyContains(ctx, 'Payment History')
    assertReplyContains(ctx, 'Total added: 150.00')
    assertReplyContains(ctx, 'Total spent: 50.00')

    return {
      name: 'BalanceScene: English Language',
      category: TestCategory.All,
      success: true,
      message: 'Тест сцены баланса на английском языке успешно пройден',
    }
  } catch (error) {
    logger.error('Ошибка в тесте сцены баланса на английском языке:', error)
    return {
      name: 'BalanceScene: English Language',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест для сцены баланса при ошибке получения статистики
 */
export async function testBalanceSceneError(): Promise<TestResult> {
  try {
    setupTest()

    // Создаем мок-контекст
    const ctx = createMockContext()
    ctx.from = {
      id: TEST_USER_ID,
      username: TEST_USERNAME,
      language_code: 'ru',
    } as any
    ctx.session = {
      mode: ModeEnum.BalanceScene,
      balance: 100,
      isAdmin: false,
      language: 'ru',
    } as any

    // Мокируем функцию получения статистики баланса с ошибкой
    const mockGetUserBalanceStats = mockFunction().mockImplementation(() => {
      throw new Error('Ошибка получения статистики баланса')
    })

    // Подменяем реальную функцию на мок
    const supabaseModule = await import('../../../core/supabase')
    Object.defineProperty(supabaseModule, 'getUserBalanceStats', {
      value: mockGetUserBalanceStats,
    })

    // Импортируем сцену баланса
    const { balanceScene } = await import('../../../scenes/balanceScene')

    // Вызываем обработчик входа в сцену
    await ctx.scene.enter(ModeEnum.BalanceScene)

    // Запускаем первый шаг сцены вручную (если enter не сработает полностью)
    if (balanceScene.steps && balanceScene.steps.length > 0) {
      const firstStep = balanceScene.steps[0]
      // Проверяем, что объект является функцией перед вызовом
      if (typeof firstStep === 'function') {
        await firstStep(ctx)
      }
    }

    // Проверки сообщения об ошибке
    assertReplyContains(ctx, 'ошибка')

    return {
      name: 'BalanceScene: Error Handling',
      category: TestCategory.All,
      success: true,
      message: 'Тест обработки ошибок в сцене баланса успешно пройден',
    }
  } catch (error) {
    logger.error('Ошибка в тесте обработки ошибок сцены баланса:', error)
    return {
      name: 'BalanceScene: Error Handling',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Запуск всех тестов для сцены баланса
 */
export async function runBalanceSceneTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    results.push(await testBalanceSceneEnter())
    results.push(await testBalanceSceneWithPaymentHistory())
    results.push(await testBalanceSceneEnglishLanguage())
    results.push(await testBalanceSceneError())
  } catch (error) {
    logger.error('Ошибка при запуске тестов сцены баланса:', error)
    results.push({
      name: 'BalanceScene: Общая ошибка',
      category: TestCategory.All,
      success: false,
      message: String(error),
    })
  }

  return results
}

export default runBalanceSceneTests
