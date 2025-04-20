// Мокаем @supabase/supabase-js ПЕРЕД всеми остальными импортами и моками
let mockInsert: jest.Mock // Объявляем здесь, чтобы было доступно в тестах
jest.mock('@supabase/supabase-js', () => {
  const mockFrom = jest.fn().mockReturnThis()
  const mockSelect = jest.fn().mockReturnThis()
  const mockUpdate = jest.fn().mockReturnThis()
  mockInsert = jest.fn().mockReturnThis() // Присваиваем здесь
  const mockEq = jest.fn().mockReturnThis()
  const mockMaybeSingle = jest.fn().mockResolvedValue({ data: {}, error: null })
  const mockSingle = jest.fn().mockResolvedValue({ data: {}, error: null })
  const mockRpc = jest.fn().mockResolvedValue({ data: {}, error: null })

  mockFrom.mockImplementation(() => ({
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
    eq: mockEq,
    maybeSingle: mockMaybeSingle,
    single: mockSingle,
  }))

  return {
    createClient: jest.fn().mockReturnValue({
      from: mockFrom,
      rpc: mockRpc,
      auth: {
        /* ... */
      },
    }),
  }
})

// import { jest, describe, it, expect, beforeEach } from '@jest/globals' // УДАЛИТЬ ЭТУ СТРОКУ
import { Scenes } from 'telegraf'
import { Update } from 'telegraf/types'
// import { StarPaymentScene } from '../../src/scenes/paymentScene/starPaymentScene' // ОТНОСИТЕЛЬНЫЙ - предполагаем, что файл существует
import { MyContext, MySession, ModeEnum } from '../../src/interfaces' // ОТНОСИТЕЛЬНЫЙ
import { makeMockContext } from '../utils/makeMockContext' // Оставляем относительный
import { isRussian } from '../../src/helpers' // ОТНОСИТЕЛЬНЫЙ
import * as handlers from '../../src/handlers' // ОТНОСИТЕЛЬНЫЙ
import * as supabase from '../../src/core/supabase' // ОТНОСИТЕЛЬНЫЙ
import * as priceHelpers from '../../src/price/helpers' // ОТНОСИТЕЛЬНЫЙ
import * as botCore from '../../src/core/bot' // ОТНОСИТЕЛЬНЫЙ
import { logger } from '../../src/utils/logger' // ОТНОСИТЕЛЬНЫЙ
// Исправляем опечатку в имени мока
import { setPaymentsSuccessResponse as setPaymentsResponse } from '../utils/mocks/supabaseMocks'
import { SubscriptionType } from '../../src/interfaces/subscription.interface' // ОТНОСИТЕЛЬНЫЙ
import { MiddlewareFn } from 'telegraf'
import { PaymentStatus } from '../../src/interfaces' // Добавляем импорт PaymentStatus
// ИМПОРТИРУЕМ РЕАЛЬНУЮ СЦЕНУ
import { starPaymentScene } from '../../src/scenes/starPaymentScene'
// Импортируем getInvoiceId для мока
import { getInvoiceId } from '../../src/scenes/getRuBillWizard/helper'

// Мокаем остальные зависимости
jest.mock('../../src/helpers')
jest.mock('../../src/handlers')
// Обновляем мок priceHelpers
jest.mock('../../src/price/helpers', () => ({
  ...jest.requireActual('../../src/price/helpers'),
  starAmounts: [
    { stars: 100, id: 'topup_100' },
    { stars: 50, id: 'topup_50' },
  ],
}))
// Мокаем getInvoiceId отдельно
jest.mock('../../src/scenes/getRuBillWizard/helper', () => ({
  getInvoiceId: jest.fn(),
}))
jest.mock('../../src/core/bot')
jest.mock('../../src/utils/logger')

// TODO: Замокать реальную сцену после ее создания
// Временный мок сцены, пока файл не будет создан/найден
// УБИРАЕМ МОК СЦЕНЫ
// const starPaymentScene = new Scenes.BaseScene<MyContext>(
//   ModeEnum.StarPaymentScene
// )

// Объявляем переменную здесь
// Используем MiddlewareFn как тип для action handler в BaseScene
// УБИРАЕМ ГЛОБАЛЬНУЮ ПЕРЕМЕННУЮ ДЛЯ HANDLER
// let starCallbackHandler: MiddlewareFn<MyContext> | undefined

// Типизируем моки
const mockedIsRussian = jest.mocked(isRussian)
const mockedHandlers = jest.mocked(handlers)
const mockedPriceHelpers = jest.mocked(priceHelpers)
const mockedGetInvoiceId = jest.mocked(getInvoiceId)
const mockedBotCore = jest.mocked(botCore)
const mockedLogger = jest.mocked(logger)

// Mock implementations
const mockSetPayments = jest.fn().mockResolvedValue(undefined)
const mockAnswerCbQuery = jest.fn().mockResolvedValue(true)
const mockReply = jest.fn().mockResolvedValue(true)
const mockLeave = jest.fn().mockResolvedValue({}) // Mock for scene.leave()
const mockEnter = jest.fn().mockResolvedValue({}) // Mock for scene.enter()

describe('Star Payment Scene', () => {
  let ctx: MyContext

  beforeEach(() => {
    jest.clearAllMocks()
    // Создаем мок Update с callback_query.from для action
    const mockUpdate: Partial<Update> = {
      update_id: 3,
      callback_query: {
        id: 'cb2',
        from: { id: 123, is_bot: false, first_name: 'Test' },
        chat_instance: 'chat2',
        data: '',
      },
    }
    ctx = makeMockContext(mockUpdate)
    mockedIsRussian.mockReturnValue(true)
    mockedBotCore.getBotNameByToken.mockReturnValue({ bot_name: 'test_bot' })
    // @ts-ignore - Оставляем пока что, т.к. makeMockContext может не создавать все поля
    ctx.scene = {
      enter: jest.fn(),
      leave: jest.fn(),
      reenter: jest.fn(),
      // @ts-ignore
      session: ctx.session,
      state: {},
      // @ts-ignore
      current: starPaymentScene,
      ctx: ctx,
    } as Scenes.SceneContextScene<MyContext, Scenes.WizardSessionData>

    // Сбрасываем и настраиваем mockInsert
    mockInsert.mockClear()
    // Используем правильный мок ответа
    mockInsert.mockResolvedValue(setPaymentsResponse) // setPaymentsResponse импортирован выше

    // Мок action и hears внутри beforeEach
    // УБИРАЕМ РУЧНЫЕ МОКИ МЕТОДОВ СЦЕНЫ
    // starCallbackHandler = undefined // Сбрасываем перед тестом
    // starPaymentScene.action = jest.fn((triggers, handler) => {
    //   if (
    //     triggers instanceof RegExp &&
    //     triggers.source.includes('top_up') &&
    //     !triggers.source.includes('rub')
    //   ) {
    //     starCallbackHandler = handler
    //   }
    //   // Мок для действия покупки подписки
    //   if (
    //     typeof triggers === 'string' &&
    //     triggers.startsWith('buy_sub_stars_')
    //   ) {
    //     // Здесь можно сохранить хендлер для теста покупки подписки
    //   }
    //   return starPaymentScene // Возвращаем this для цепочки
    // }) as any
    // starPaymentScene.enter = jest.fn(handler => {
    //   // Сохраняем enter middleware для вызова в тесте
    //   ;(starPaymentScene as any)._enterHandler = handler
    //   return starPaymentScene // Возвращаем this для цепочки
    // }) as any
    // starPaymentScene.hears = jest.fn(() => starPaymentScene) as any // Возвращаем this для цепочки

    // Мокаем глобальный supabase insert (если он нужен в этой сцене)
    // Нужно убедиться, что глобальный мок @supabase/supabase-js сделан
    // Если нет, то нужно его добавить и сюда, либо мокать `../../src/core/supabase`
    // Предположим, что глобальный мок есть и мы можем использовать mockInsert
    // mockInsert.mockClear();
    // mockInsert.mockResolvedValue({ data: [{/*...*/}], error: null}); // Пример
    delete ctx.session.subscription // Убеждаемся, что подписки нет

    // Вызываем сохраненный enter handler
    // ВЫЗЫВАЕМ РЕАЛЬНЫЙ MIDDLEWARE
    // const enterHandlerFn = (starPaymentScene as any)._enterHandler
    // if (enterHandlerFn) {
    //   await enterHandlerFn(ctx, jest.fn() as any)
    // } else {
    //   console.warn('Enter handler not mocked correctly for starPaymentScene')
    // }
    await starPaymentScene.middleware()(ctx, jest.fn() as any)

    expect(mockedHandlers.handleSelectStars).toHaveBeenCalledTimes(1)
    expect(mockedHandlers.handleSelectStars).toHaveBeenCalledWith(
      expect.objectContaining({ ctx, isRu: true })
    )
    expect(mockedHandlers.handleBuySubscription).not.toHaveBeenCalled()
  })

  it('should enter the scene and call handleBuySubscription if subscription in session', async () => {
    // require('../../src/scenes/paymentScene/starPaymentScene') // Пока комментируем
    ctx.session.subscription = SubscriptionType.NEUROBASE // Устанавливаем подписку

    // Вызываем сохраненный enter handler
    // ВЫЗЫВАЕМ РЕАЛЬНЫЙ MIDDLEWARE
    // const enterHandlerFn = (starPaymentScene as any)._enterHandler
    // if (enterHandlerFn) {
    //   await enterHandlerFn(ctx, jest.fn() as any)
    // } else {
    //   console.warn('Enter handler not mocked correctly for starPaymentScene')
    // }
    await starPaymentScene.middleware()(ctx, jest.fn() as any)

    expect(mockedHandlers.handleBuySubscription).toHaveBeenCalledTimes(1)
    expect(mockedHandlers.handleBuySubscription).toHaveBeenCalledWith({
      ctx,
      isRu: true,
    })
    expect(mockedHandlers.handleSelectStars).not.toHaveBeenCalled()
  })

  it('should handle selecting a star package (action top_up_X)', async () => {
    const starsAmount = 100
    // УБИРАЕМ старый мок setPayments

    // Имитируем callback
    // @ts-ignore - Добавляем match в контекст теста
    ctx.match = [`top_up_${starsAmount}`, starsAmount.toString()]
    // if (!starCallbackHandler) throw new Error('Action handler not registered')
    // await starCallbackHandler(ctx, jest.fn() as any)
    // НАХОДИМ И ВЫЗЫВАЕМ РЕАЛЬНЫЙ ACTION HANDLER
    const handler = starPaymentScene.actionHandlers.find(h => {
      return (
        h.triggers instanceof RegExp && h.triggers.source.includes('top_up_')
      )
    })
    if (!handler) throw new Error('Action handler for top_up_X not found')
    await handler.middleware(ctx, jest.fn() as any)

    expect(ctx.answerCbQuery).toHaveBeenCalled()
    // Проверяем вызов insert из глобального мока Supabase
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram_id: '123', // Используем ID из mockUpdate
        currency: 'STARS',
        stars: starsAmount,
        status: PaymentStatus.COMPLETED, // Используем enum, предполагаем COMPLETED для звезд
        payment_method: 'TelegramStars',
        bot_name: 'test_bot',
        // ... другие поля по необходимости ...
      })
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Оплата выполнена'),
      { parse_mode: 'HTML' }
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('should handle error during payment saving', async () => {
    const starsAmount = 50
    const dbError = new Error('DB Error')
    // Мокаем ошибку insert
    mockInsert.mockRejectedValueOnce(dbError)

    // Имитируем callback
    // @ts-ignore - Добавляем match в контекст теста
    ctx.match = [`top_up_${starsAmount}`, starsAmount.toString()]
    // if (!starCallbackHandler) throw new Error('Action handler not registered')
    // await starCallbackHandler(ctx, jest.fn() as any)
    // НАХОДИМ И ВЫЗЫВАЕМ РЕАЛЬНЫЙ ACTION HANDLER
    const handler = starPaymentScene.actionHandlers.find(h => {
      return (
        h.triggers instanceof RegExp && h.triggers.source.includes('top_up_')
      )
    })
    if (!handler) throw new Error('Action handler for top_up_X not found')
    await handler.middleware(ctx, jest.fn() as any)

    expect(ctx.answerCbQuery).toHaveBeenCalled()
    // Проверяем, что insert был вызван
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Произошла ошибка'),
      undefined
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error processing callback top_up'),
      expect.any(Object)
    )
  })

  it('should handle buying a subscription with stars', async () => {
    // TODO: Реализовать тест для покупки подписки за звезды, если это будет в этой сцене
    // ctx.session.subscription = 'neurobase'
    // Ожидаем вызов handleBuySubscription
    // const actionHandler = starPaymentScene.action(/buy_sub_neurobase_stars/, async () => {}) // Примерный callback
    // await actionHandler.middleware()(ctx, jest.fn())
    // expect(mockedHandlers.handleBuySubscription).toHaveBeenCalledWith({ ctx, isRu: true })
    // expect(ctx.scene.leave).toHaveBeenCalled()
  })

  // TODO: Добавить другие тесты по необходимости (например, навигация, ошибки)

  // ДОБАВЛЯЕМ async
  it('should enter the scene and call handleSelectStars if no subscription in session', async () => {
    delete ctx.session.subscription // Убеждаемся, что подписки нет

    // ВЫЗЫВАЕМ РЕАЛЬНЫЙ MIDDLEWARE
    await starPaymentScene.middleware()(ctx, jest.fn() as any)

    expect(mockedHandlers.handleSelectStars).toHaveBeenCalledWith(ctx)
  })

  // ДОБАВЛЯЕМ async
  it('should enter the scene and call handleBuySubscription if subscription exists', async () => {
    ctx.session.subscription = SubscriptionType.NEUROBASE // Устанавливаем подписку

    // ВЫЗЫВАЕМ РЕАЛЬНЫЙ MIDDLEWARE
    await starPaymentScene.middleware()(ctx, jest.fn() as any)

    expect(mockedHandlers.handleBuySubscription).toHaveBeenCalledWith(ctx)
  })

  // ДОБАВЛЯЕМ async
  it('should handle selecting star package, save payment, and answer query', async () => {
    const starsAmount = 100
    mockInsert.mockClear()
    // Оборачиваем в Promise.resolve
    mockedGetInvoiceId.mockReturnValue(Promise.resolve('mock-invoice-id'))

    // Имитируем callback_query
    const mockCallbackUpdate: Update.CallbackQueryUpdate = {
      update_id: 10000,
      callback_query: {
        id: 'test-callback-id',
        from: {
          id: 12345,
          is_bot: false,
          first_name: 'Test',
          username: 'testuser',
          language_code: 'en',
        },
        message: {
          message_id: 123456,
          date: Date.now() / 1000,
          chat: {
            id: 1234567,
            type: 'private',
            first_name: 'Test',
            username: 'testuser',
          },
          text: 'Some message',
        },
        chat_instance: 'test-chat-instance',
        data: `top_up_${starsAmount}`,
      },
    }
    const testCtx = makeMockContext(mockCallbackUpdate, ctx.session)
    testCtx.reply = jest.fn().mockResolvedValue({} as any)
    testCtx.answerCbQuery = jest.fn().mockResolvedValue(true)
    testCtx.scene.leave = jest.fn().mockResolvedValue({})

    // Вызываем middleware сцены
    await starPaymentScene.middleware()(testCtx, jest.fn() as any)

    expect(testCtx.answerCbQuery).toHaveBeenCalled()
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram_id: 12345,
        OutSum: 0,
        InvId: 'mock-invoice-id',
        currency: 'STARS',
        stars: starsAmount,
        status: PaymentStatus.PENDING,
        payment_method: 'stars',
        bot_name: 'test_bot',
        language: 'ru',
        subscription: undefined,
      })
    )
    expect(mockedLogger.error).not.toHaveBeenCalled()
  })

  it('should log error if setPayments fails', async () => {
    const starsAmount = 50
    const errorMessage = 'Database error'
    // Оборачиваем в Promise.resolve
    mockedGetInvoiceId.mockReturnValue(Promise.resolve('mock-invoice-id-error'))
    mockInsert.mockClear()
    mockInsert.mockRejectedValue(new Error(errorMessage))
    mockedLogger.error.mockClear()

    // Имитируем callback_query
    const mockCallbackUpdate: Update.CallbackQueryUpdate = {
      update_id: 10001,
      callback_query: {
        id: 'test-callback-id-error',
        from: {
          id: 12345,
          is_bot: false,
          first_name: 'Test',
          username: 'testuser',
          language_code: 'en',
        },
        message: {
          message_id: 123457,
          date: Date.now() / 1000,
          chat: {
            id: 1234567,
            type: 'private',
            first_name: 'Test',
            username: 'testuser',
          },
          text: 'Some message',
        },
        chat_instance: 'test-chat-instance',
        data: `top_up_${starsAmount}`,
      },
    }
    const testCtx = makeMockContext(mockCallbackUpdate, ctx.session)
    testCtx.reply = jest.fn().mockResolvedValue({} as any)
    testCtx.answerCbQuery = jest.fn().mockResolvedValue(true)
    testCtx.scene.leave = jest.fn().mockResolvedValue({})

    // Вызываем middleware сцены
    await starPaymentScene.middleware()(testCtx, jest.fn() as any)

    expect(testCtx.answerCbQuery).toHaveBeenCalled()
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockedLogger.error).toHaveBeenCalledTimes(1)
    // Исправляем проверку logger.error
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        // Ожидаем объект
        message: `Error in starPaymentScene action top_up_${starsAmount}:`,
        error: expect.any(Error),
      })
    )
    const loggedObject = mockedLogger.error.mock.calls[0][0]
    expect(loggedObject.error).toBeInstanceOf(Error)
    if (loggedObject.error instanceof Error) {
      expect(loggedObject.error.message).toBe(errorMessage)
    }
  })
})
