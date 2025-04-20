import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { Scenes } from 'telegraf'
// import { starPaymentScene } from '@/scenes/starPaymentScene' // Будущая сцена
import { MyContext, MySession } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { makeMockContext } from '../utils/makeMockContext'
import { isRussian } from '@/helpers'
import * as handlers from '@/handlers'
import * as supabase from '@/core/supabase'
import * as priceHelpers from '@/price/helpers'
import * as botCore from '@/core/bot'
import { logger } from '@/utils/logger'
import { setPaymentsResponse } from '@/__tests__/core/supabase/mocks/paymentsMock'
import { Update } from 'telegraf/types'
import { SubscriptionType } from '@/interfaces/subscription.interface'

// Мокаем зависимости
jest.mock('@/helpers')
jest.mock('@/handlers')
jest.mock('@/core/supabase')
jest.mock('@/price/helpers', () => ({
  __esModule: true,
  starAmounts: [
    { stars: 100, id: '1' },
    { stars: 200, id: '2' },
  ], // Пример
}))
jest.mock('@/core/bot')
jest.mock('@/utils/logger')

// TODO: Замокать реальную сцену после ее создания
const starPaymentScene = new Scenes.BaseScene<MyContext>('starPaymentScene')

// Типизируем моки
const mockedIsRussian = jest.mocked(isRussian)
const mockedHandlers = jest.mocked(handlers)
const mockedSupabase = jest.mocked(supabase)
const mockedPriceHelpers = jest.mocked(priceHelpers)
const mockedBotCore = jest.mocked(botCore)
const mockedLogger = jest.mocked(logger)

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
    // @ts-ignore
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
    // ctx.session = {} // Убираем

    // Мок action и hears внутри beforeEach
    starCallbackHandler = undefined
    starPaymentScene.action = jest.fn((triggers, handler) => {
      if (
        triggers instanceof RegExp &&
        triggers.source.includes('top_up') &&
        !triggers.source.includes('rub')
      ) {
        starCallbackHandler = handler
      }
      // Мок для действия покупки подписки
      if (
        typeof triggers === 'string' &&
        triggers.startsWith('buy_sub_stars_')
      ) {
        // Здесь можно сохранить хендлер для теста покупки подписки
      }
    }) as any
    starPaymentScene.enter = jest.fn()
    starPaymentScene.hears = jest.fn()
  })

  it('should enter the scene and call handleSelectStars if no subscription in session', async () => {
    // Регистрируем enter handler
    let enterHandlerFn: Scenes.Middleware<MyContext> | undefined
    starPaymentScene.enter = jest.fn(handler => {
      enterHandlerFn = handler
    }) as any
    require('@/scenes/starPaymentScene') // Вызываем регистрацию
    delete ctx.session.subscription // Убеждаемся, что подписки нет

    if (enterHandlerFn) {
      await enterHandlerFn(ctx, jest.fn() as any)
    }

    expect(mockedHandlers.handleSelectStars).toHaveBeenCalledTimes(1)
    expect(mockedHandlers.handleSelectStars).toHaveBeenCalledWith(
      expect.objectContaining({ ctx, isRu: true })
    )
    expect(mockedHandlers.handleBuySubscription).not.toHaveBeenCalled()
  })

  it('should enter the scene and call handleBuySubscription if subscription in session', async () => {
    // Регистрируем enter handler
    let enterHandlerFn: Scenes.Middleware<MyContext> | undefined
    starPaymentScene.enter = jest.fn(handler => {
      enterHandlerFn = handler
    }) as any
    require('@/scenes/starPaymentScene')
    ctx.session.subscription = SubscriptionType.NEUROBASE // Устанавливаем подписку

    if (enterHandlerFn) {
      await enterHandlerFn(ctx, jest.fn() as any)
    }

    expect(mockedHandlers.handleBuySubscription).toHaveBeenCalledTimes(1)
    expect(mockedHandlers.handleBuySubscription).toHaveBeenCalledWith({
      ctx,
      isRu: true,
    })
    expect(mockedHandlers.handleSelectStars).not.toHaveBeenCalled()
  })

  it('should handle selecting a star package (action top_up_X)', async () => {
    const starsAmount = 100
    mockedSupabase.setPayments.mockResolvedValue(setPaymentsResponse)

    // Регистрируем action handler
    let actionHandlerFn: Scenes.ActionHandler<MyContext> | undefined
    starPaymentScene.action = jest.fn((triggers, handler) => {
      if (
        triggers instanceof RegExp &&
        triggers.source.includes('top_up') &&
        !triggers.source.includes('rub')
      ) {
        actionHandlerFn = handler
      }
    }) as any
    require('@/scenes/starPaymentScene')

    // Имитируем callback
    ctx.match = [`top_up_${starsAmount}`, starsAmount.toString()]
    if (!actionHandlerFn) throw new Error('Action handler not registered')
    await actionHandlerFn(ctx, jest.fn() as any)

    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(mockedSupabase.setPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'STARS',
        stars: starsAmount,
        status: 'SUCCESS',
        payment_method: 'TelegramStars',
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
    mockedSupabase.setPayments.mockRejectedValue(dbError)

    // Регистрируем action handler
    let actionHandlerFn: Scenes.ActionHandler<MyContext> | undefined
    starPaymentScene.action = jest.fn((triggers, handler) => {
      if (
        triggers instanceof RegExp &&
        triggers.source.includes('top_up') &&
        !triggers.source.includes('rub')
      ) {
        actionHandlerFn = handler
      }
    }) as any
    require('@/scenes/starPaymentScene')

    // Имитируем callback
    ctx.match = [`top_up_${starsAmount}`, starsAmount.toString()]
    if (!actionHandlerFn) throw new Error('Action handler not registered')
    await actionHandlerFn(ctx, jest.fn() as any)

    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(mockedSupabase.setPayments).toHaveBeenCalledTimes(1)
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
})
