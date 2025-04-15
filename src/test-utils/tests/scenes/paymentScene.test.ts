import { MyContext } from '@/interfaces'
import { createMockContext } from '../../core/mockContext'
import { TestResult } from '../../core/types'
import {
  assertReplyContains,
  assertReplyMarkupContains,
} from '../../core/assertions'
import { create as mockFunction } from '../../core/mock'
import { TestCategory } from '../../core/categories'
import { logger } from '@/utils/logger'
import { createPendingPayment } from '@/core/supabase/createPendingPayment'
import { handleSelectStars } from '@/handlers/handleSelectStars'
import { handleBuySubscription } from '@/handlers/handleBuySubscription'
import { generateUniqueShortInvId } from '@/scenes/getRuBillWizard/helper'
import { runTest, expect as testExpect } from '../../core/testHelpers'

// Мокированные функции
const mockedCreatePendingPayment = mockFunction<typeof createPendingPayment>()
const mockedHandleSelectStars = mockFunction<typeof handleSelectStars>()
const mockedHandleBuySubscription = mockFunction<typeof handleBuySubscription>()
const mockedGenerateUniqueShortInvId =
  mockFunction<typeof generateUniqueShortInvId>()

// Константы для тестирования
const TEST_USER_ID = 123456789
const TEST_USERNAME = 'test_user'
const TEST_AMOUNT = 100
const TEST_STARS = 50
const TEST_INVOICE_URL = 'https://test-payment-url.com/invoice/12345'
const TEST_INV_ID = '12345'

/**
 * Настройка тестовой среды
 */
function setupTest() {
  // Настройка моков
  mockedCreatePendingPayment.mockReturnValue(Promise.resolve())
  mockedHandleSelectStars.mockReturnValue(Promise.resolve())
  mockedHandleBuySubscription.mockReturnValue(Promise.resolve())
  mockedGenerateUniqueShortInvId.mockReturnValue(
    Promise.resolve(Number(TEST_INV_ID))
  )

  // Сброс моков между тестами
  mockedCreatePendingPayment.mockClear()
  mockedHandleSelectStars.mockClear()
  mockedHandleBuySubscription.mockClear()
  mockedGenerateUniqueShortInvId.mockClear()

  // Мокируем env переменные
  process.env.MERCHANT_LOGIN = 'test_merchant'
  process.env.PASSWORD1 = 'test_password'
  process.env.TEST_PASSWORD1 = 'test_password_test'

  // Логирование настройки тестовой среды
  logger.info('Тестовая среда для paymentScene настроена', {
    mocksSetup: true,
    envVariables: {
      MERCHANT_LOGIN: !!process.env.MERCHANT_LOGIN,
      PASSWORD1: !!process.env.PASSWORD1,
    },
  })

  return {
    mockedCreatePendingPayment,
    mockedHandleSelectStars,
    mockedHandleBuySubscription,
    mockedGenerateUniqueShortInvId,
  }
}

/**
 * Тест для входа в сцену без выбранного платежа
 */
export async function testPaymentSceneEnter(): Promise<TestResult> {
  return runTest(
    async () => {
      const mocks = setupTest()

      // Создаем мок-контекст
      const ctx = createMockContext()
      ctx.from = {
        id: TEST_USER_ID,
        is_bot: false,
        first_name: 'Test',
        username: TEST_USERNAME,
        language_code: 'ru',
      }
      ctx.session = {}

      // Запускаем обработчик сцены
      const paymentScene = (await import('@/scenes/paymentScene')).paymentScene
      await paymentScene.emit('enter', ctx as unknown as MyContext)

      // Проверки
      assertReplyContains(ctx, 'Как вы хотите оплатить?')
      assertReplyMarkupContains(ctx, '⭐️ Звездами')
      assertReplyMarkupContains(ctx, '💳 Рублями')
      assertReplyMarkupContains(ctx, '🏠 Главное меню')

      // Проверяем, что не было создания платежа
      testExpect(mocks.mockedCreatePendingPayment).not.toHaveBeenCalled()

      return {
        message: 'Тест входа в сцену успешно пройден',
      }
    },
    {
      name: 'paymentScene: Enter без выбранного платежа',
      category: TestCategory.Payment,
    }
  )
}

/**
 * Тест для входа в сцену с выбранным платежом
 */
export async function testPaymentSceneEnterWithSelectedPayment(): Promise<TestResult> {
  return runTest(
    async () => {
      const mocks = setupTest()

      // Создаем мок-контекст
      const ctx = createMockContext()
      ctx.from = {
        id: TEST_USER_ID,
        is_bot: false,
        first_name: 'Test',
        username: TEST_USERNAME,
        language_code: 'ru',
      }
      ctx.botInfo = { username: 'test_bot' } as any
      ctx.session = {
        selectedPayment: {
          amount: TEST_AMOUNT,
          stars: TEST_STARS,
          subscription: 'stars',
        },
      }

      // Запускаем обработчик сцены
      const paymentScene = (await import('@/scenes/paymentScene')).paymentScene
      await paymentScene.emit('enter', ctx as unknown as MyContext)

      // Проверки
      assertReplyContains(ctx, 'Оплата')
      assertReplyContains(ctx, TEST_AMOUNT.toString())

      // Проверяем вызов создания платежа с правильными параметрами
      testExpect(mocks.mockedCreatePendingPayment).toHaveBeenCalled()

      return {
        message: 'Тест входа в сцену с выбранным платежом успешно пройден',
      }
    },
    {
      name: 'paymentScene: Enter с выбранным платежом',
      category: TestCategory.Payment,
    }
  )
}

/**
 * Тест для оплаты звездами
 */
export async function testPaymentScenePayWithStars(): Promise<TestResult> {
  return runTest(
    async () => {
      const mocks = setupTest()

      // Создаем мок-контекст
      const ctx = createMockContext()
      ctx.from = {
        id: TEST_USER_ID,
        is_bot: false,
        first_name: 'Test',
        username: TEST_USERNAME,
        language_code: 'ru',
      }
      ctx.session = {}
      ctx.message = { text: '⭐️ Звездами' } as any

      // Запускаем обработчик сцены
      const paymentScene = (await import('@/scenes/paymentScene')).paymentScene
      await paymentScene.emit(
        'text',
        ctx as unknown as MyContext,
        {},
        '⭐️ Звездами'
      )

      // Проверки вызова обработчика покупки звезд
      testExpect(mocks.mockedHandleSelectStars).toHaveBeenCalled()

      // Проверяем, что после обработки мы покидаем сцену
      testExpect(ctx.scene.leave).toHaveBeenCalled()

      return {
        message: 'Тест оплаты звездами успешно пройден',
      }
    },
    {
      name: 'paymentScene: Оплата звездами',
      category: TestCategory.Payment,
    }
  )
}

/**
 * Тест для оплаты звездами с подпиской
 */
export async function testPaymentScenePayWithStarsSubscription(): Promise<TestResult> {
  return runTest(
    async () => {
      const mocks = setupTest()

      // Создаем мок-контекст
      const ctx = createMockContext()
      ctx.from = {
        id: TEST_USER_ID,
        is_bot: false,
        first_name: 'Test',
        username: TEST_USERNAME,
        language_code: 'ru',
      }
      ctx.session = {
        subscription: 'neurophoto',
      }
      ctx.message = { text: '⭐️ Звездами' } as any

      // Запускаем обработчик сцены
      const paymentScene = (await import('@/scenes/paymentScene')).paymentScene
      await paymentScene.emit(
        'text',
        ctx as unknown as MyContext,
        {},
        '⭐️ Звездами'
      )

      // Проверки вызова обработчика подписки с правильными параметрами
      testExpect(mocks.mockedHandleBuySubscription).toHaveBeenCalled()

      // Проверяем, что после обработки мы покидаем сцену
      testExpect(ctx.scene.leave).toHaveBeenCalled()

      return {
        message: 'Тест оплаты звездами с подпиской успешно пройден',
      }
    },
    {
      name: 'paymentScene: Оплата звездами с подпиской',
      category: TestCategory.Payment,
    }
  )
}

/**
 * Тест для оплаты рублями
 */
export async function testPaymentScenePayWithRubles(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Создаем мок-контекст
      const ctx = createMockContext()
      ctx.from = {
        id: TEST_USER_ID,
        is_bot: false,
        first_name: 'Test',
        username: TEST_USERNAME,
        language_code: 'ru',
      }
      ctx.session = {
        subscription: 'neurophoto',
      }
      ctx.message = { text: '💳 Рублями' } as any

      // Запускаем обработчик сцены
      const paymentScene = (await import('@/scenes/paymentScene')).paymentScene
      await paymentScene.emit(
        'text',
        ctx as unknown as MyContext,
        {},
        '💳 Рублями'
      )

      // Проверки перехода в сцену getRuBillWizard
      testExpect(ctx.scene.enter).toHaveBeenCalledWith('getRuBillWizard')

      return {
        message: 'Тест оплаты рублями успешно пройден',
      }
    },
    {
      name: 'paymentScene: Оплата рублями',
      category: TestCategory.Payment,
    }
  )
}

/**
 * Тест для оплаты рублями без подписки
 */
export async function testPaymentScenePayWithRublesNoSubscription(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Создаем мок-контекст
      const ctx = createMockContext()
      ctx.from = {
        id: TEST_USER_ID,
        is_bot: false,
        first_name: 'Test',
        username: TEST_USERNAME,
        language_code: 'ru',
      }
      ctx.session = {}
      ctx.message = { text: '💳 Рублями' } as any

      // Запускаем обработчик сцены
      const paymentScene = (await import('@/scenes/paymentScene')).paymentScene
      await paymentScene.emit(
        'text',
        ctx as unknown as MyContext,
        {},
        '💳 Рублями'
      )

      // Проверки перехода в сцену getRuBillWizard
      testExpect(ctx.scene.enter).toHaveBeenCalledWith('getRuBillWizard')

      return {
        message: 'Тест оплаты рублями без подписки успешно пройден',
      }
    },
    {
      name: 'paymentScene: Оплата рублями без подписки',
      category: TestCategory.Payment,
    }
  )
}

/**
 * Тест для возврата в главное меню
 */
export async function testPaymentSceneBackToMainMenu(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Создаем мок-контекст
      const ctx = createMockContext()
      ctx.from = {
        id: TEST_USER_ID,
        is_bot: false,
        first_name: 'Test',
        username: TEST_USERNAME,
        language_code: 'ru',
      }
      ctx.session = {}
      ctx.message = { text: '🏠 Главное меню' } as any

      // Запускаем обработчик сцены
      const paymentScene = (await import('@/scenes/paymentScene')).paymentScene
      await paymentScene.emit(
        'text',
        ctx as unknown as MyContext,
        {},
        '🏠 Главное меню'
      )

      // Проверки перехода в главное меню
      testExpect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')

      return {
        message: 'Тест возврата в главное меню успешно пройден',
      }
    },
    {
      name: 'paymentScene: Возврат в главное меню',
      category: TestCategory.Payment,
    }
  )
}

/**
 * Тест для обработки ошибок при создании платежа
 */
export async function testPaymentSceneHandleCreatePaymentError(): Promise<TestResult> {
  return runTest(
    async () => {
      const mocks = setupTest()

      // Настраиваем мок для создания платежа, который вызывает ошибку
      mocks.mockedCreatePendingPayment.mockImplementation(() => {
        throw new Error('Тестовая ошибка создания платежа')
      })

      // Создаем мок-контекст
      const ctx = createMockContext()
      ctx.from = {
        id: TEST_USER_ID,
        is_bot: false,
        first_name: 'Test',
        username: TEST_USERNAME,
        language_code: 'ru',
      }
      ctx.botInfo = { username: 'test_bot' } as any
      ctx.session = {
        selectedPayment: {
          amount: TEST_AMOUNT,
          stars: TEST_STARS,
          subscription: 'stars',
        },
      }

      // Запускаем обработчик сцены и перехватываем ошибку
      const paymentScene = (await import('@/scenes/paymentScene')).paymentScene

      try {
        await paymentScene.emit('enter', ctx as unknown as MyContext)
      } catch (error) {
        // Проверяем, что была попытка создать платеж
        testExpect(mocks.mockedCreatePendingPayment).toHaveBeenCalled()

        return {
          message: 'Тест обработки ошибки при создании платежа успешно пройден',
        }
      }

      return {
        message: 'Тест обработки ошибки при создании платежа',
      }
    },
    {
      name: 'paymentScene: Обработка ошибки создания платежа',
      category: TestCategory.Payment,
    }
  )
}

/**
 * Тест для проверки английской локализации
 */
export async function testPaymentSceneEnglishLocalization(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Создаем мок-контекст с английским языком
      const ctx = createMockContext()
      ctx.from = {
        id: TEST_USER_ID,
        is_bot: false,
        first_name: 'Test',
        username: TEST_USERNAME,
        language_code: 'en',
      }
      ctx.session = {}

      // Запускаем обработчик сцены
      const paymentScene = (await import('@/scenes/paymentScene')).paymentScene
      await paymentScene.emit('enter', ctx as unknown as MyContext)

      // Проверки английской локализации
      assertReplyContains(ctx, 'How would you like to pay?')
      assertReplyMarkupContains(ctx, '⭐️ Stars')
      assertReplyMarkupContains(ctx, '💳 Rubles')
      assertReplyMarkupContains(ctx, '🏠 Main Menu')

      return {
        message: 'Тест английской локализации успешно пройден',
      }
    },
    {
      name: 'paymentScene: Английская локализация',
      category: TestCategory.Payment,
    }
  )
}

/**
 * Запуск всех тестов сцены оплаты
 */
export async function runPaymentSceneTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    // Базовые тесты
    results.push(await testPaymentSceneEnter())
    results.push(await testPaymentSceneEnterWithSelectedPayment())
    results.push(await testPaymentScenePayWithStars())
    results.push(await testPaymentScenePayWithStarsSubscription())
    results.push(await testPaymentScenePayWithRubles())
    results.push(await testPaymentScenePayWithRublesNoSubscription())
    results.push(await testPaymentSceneBackToMainMenu())
    results.push(await testPaymentSceneHandleCreatePaymentError())
    results.push(await testPaymentSceneEnglishLocalization())
  } catch (error) {
    logger.error('Ошибка при запуске тестов paymentScene:', error)
    results.push({
      name: 'paymentScene: Общая ошибка',
      category: TestCategory.Payment,
      success: false,
      message: String(error),
    })
  }

  // Логируем статистику прохождения тестов
  const successCount = results.filter(r => r.success).length
  const failCount = results.length - successCount

  logger.info(
    `📊 Результаты тестирования paymentScene: Всего ${results.length}, Успех: ${successCount}, Ошибки: ${failCount}`
  )

  return results
}

export default runPaymentSceneTests
