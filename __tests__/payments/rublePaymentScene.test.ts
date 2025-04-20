// Мокаем @supabase/supabase-js ПЕРЕД всеми остальными импортами и моками
let mockInsert: jest.Mock // Объявляем здесь, чтобы было доступно в тестах
jest.mock('@supabase/supabase-js', () => {
  const mockFrom = jest.fn().mockReturnThis()
  const mockSelect = jest.fn().mockReturnThis()
  const mockUpdate = jest.fn().mockReturnThis()
  mockInsert = jest.fn().mockReturnThis()
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
      // Добавляем auth, если нужно будет его мокать
      auth: {
        signInWithPassword: jest.fn(),
        signUp: jest.fn(),
        // ... другие методы auth
      },
    }),
  }
})

// import { jest, describe, it, expect, beforeEach } from '@jest/globals' // УДАЛИТЬ
import { Scenes, Context } from 'telegraf'
import { Update } from 'telegraf/types'
import { rublePaymentScene } from '../../src/scenes/paymentScene/rublePaymentScene' // ОТНОСИТЕЛЬНЫЙ
import {
  MyContext,
  MySession,
  UserModel,
  ModelUrl,
  ModeEnum,
} from '../../src/interfaces' // ОТНОСИТЕЛЬНЫЙ
import { makeMockContext } from '../utils/makeMockContext' // Оставляем относительный
import { isRussian } from '../../src/helpers' // ОТНОСИТЕЛЬНЫЙ
import * as handlers from '../../src/handlers' // ОТНОСИТЕЛЬНЫЙ
import * as priceHelpers from '../../src/price/helpers' // ОТНОСИТЕЛЬНЫЙ
import * as config from '../../src/config' // ОТНОСИТЕЛЬНЫЙ
import * as botCore from '../../src/core/bot' // ОТНОСИТЕЛЬНЫЙ
import { logger } from '../../src/utils/logger' // ОТНОСИТЕЛЬНЫЙ
// Возвращаем ОТНОСИТЕЛЬНЫЙ путь к моку
import { setPaymentsSuccessResponse } from '../utils/mocks/supabaseMocks'
// Убираем дублированный импорт
// import { getInvoiceId as originalGetInvoiceId } from '../../src/price/helpers';

// Мокаем остальные зависимости
jest.mock('../../src/helpers')
jest.mock('../../src/handlers')
// jest.mock('../../src/core/supabase') // <- УБИРАЕМ этот мок, т.к. мокаем саму библиотеку выше

// Мок priceHelpers с ОТНОСИТЕЛЬНЫМ путем
jest.mock('../../src/price/helpers', () => {
  const originalModule = jest.requireActual('../../src/price/helpers')
  return {
    __esModule: true,
    ...originalModule,
    getInvoiceId: jest.fn(),
    createAmountButtons: jest.fn(),
    createInvoiceLink: jest.fn(),
    rubTopUpOptions: [
      { amountRub: 100, stars: 50, description: '' },
      { amountRub: 200, stars: 110, description: '' },
    ],
  }
})

jest.mock('../../src/config', () => ({
  MERCHANT_LOGIN: 'test_merchant',
  PASSWORD1: 'test_password1',
  // Убираем моки SUPABASE_URL/KEY, т.к. createClient замокан
}))
jest.mock('../../src/core/bot')
jest.mock('../../src/utils/logger')

// Объявляем переменные для ошибок здесь
let enterError: Error
let invoiceError: Error

// Типизируем моки
const mockedIsRussian = jest.mocked(isRussian)
// const mockedHandlers = jest.mocked(handlers) // Убираем
// const mockedSupabase = jest.mocked(supabase) // Убираем
// const mockedConfig = jest.mocked(config) // Убираем
const mockedBotCore = jest.mocked(botCore)
const mockedLogger = jest.mocked(logger)
// Явно указываем тип мока priceHelpers, включая getInvoiceId
const mockedPriceHelpers = priceHelpers as jest.Mocked<
  typeof priceHelpers & { getInvoiceId: jest.Mock }
>

describe('Ruble Payment Scene', () => {
  let ctx: MyContext
  let mockUpdate: Update.CallbackQueryUpdate // Объявляем mockUpdate здесь

  beforeEach(() => {
    jest.clearAllMocks()
    // Инициализируем ошибки перед каждым тестом
    enterError = new Error('Failed to select rub amount')
    invoiceError = new Error('Invoice generation failed')
    // Сбрасываем мок getInvoiceId
    mockedPriceHelpers.getInvoiceId.mockClear()

    // Создаем мок Update с callback_query.from для action
    mockUpdate = {
      // Присваиваем значение здесь
      update_id: 2,
      callback_query: {
        id: 'cb1',
        from: {
          id: 456,
          is_bot: false,
          first_name: 'Test2',
          language_code: 'ru',
        },
        chat_instance: 'chat1',
        data: '',
      },
    } as Update.CallbackQueryUpdate // Явное приведение типа
    // Добавляем базовые поля message для ctx.from и ctx.chat
    // @ts-ignore - Добавляем message для полноты контекста
    mockUpdate.message = {
      message_id: 1,
      date: Date.now(),
      from: {
        id: 456,
        is_bot: false,
        first_name: 'Test2',
        language_code: 'ru',
      },
      chat: { id: 456, type: 'private', first_name: 'Test2' },
      text: '',
    }

    ctx = makeMockContext(mockUpdate)
    mockedIsRussian.mockReturnValue(true)
    mockedBotCore.getBotNameByToken.mockReturnValue({ bot_name: 'test_bot' })

    // @ts-ignore
    ctx.scene = {
      enter: jest.fn(),
      leave: jest.fn(),
      reenter: jest.fn(),
      session: ctx.session,
      state: {},
      current: rublePaymentScene,
      ctx: ctx,
    } as Scenes.SceneContextScene<MyContext, Scenes.WizardSessionData>

    // ИНИЦИАЛИЗИРУЕМ СЕССИЮ
    ctx.session = {
      mode: undefined,
      cursor: 0,
      images: [],
      targetUserId: 'default-target-id',
      userModel: {
        model_name: 'm1',
        trigger_word: 't1',
        model_url: 'o/r:v' as ModelUrl,
      },
      email: undefined,
      steps: undefined,
      subscription: undefined, // Добавляем недостающее поле
    } as MySession
    // @ts-ignore
    ctx.scene.session = ctx.session

    // Сбрасываем мок insert перед каждым тестом
    mockInsert.mockClear()
    mockInsert.mockResolvedValue(setPaymentsSuccessResponse) // Устанавливаем дефолтный resolve
  })

  it('should enter the scene and call handleSelectRubAmount', async () => {
    await rublePaymentScene.enterMiddleware()(ctx, jest.fn() as any)
    expect(mockedLogger.info).toHaveBeenCalledWith(
      `Entering ${ModeEnum.RublePaymentScene}`,
      { telegram_id: ctx.from?.id }
    )
    expect(handlers.handleSelectRubAmount).toHaveBeenCalledTimes(1)
    expect(handlers.handleSelectRubAmount).toHaveBeenCalledWith({
      ctx,
      isRu: true,
    })
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('should handle error during enterMiddleware and leave the scene', async () => {
    // Мокаем конкретную функцию из handlers
    ;(handlers.handleSelectRubAmount as jest.Mock).mockRejectedValueOnce(
      enterError
    ) // Используем enterError

    await rublePaymentScene.enterMiddleware()(ctx, jest.fn() as any)

    expect(handlers.handleSelectRubAmount).toHaveBeenCalledTimes(1)
    expect(mockedLogger.error).toHaveBeenCalledWith(
      `Error entering ${ModeEnum.RublePaymentScene}`,
      expect.objectContaining({
        error: enterError.message, // Используем enterError.message
        telegram_id: ctx.from?.id,
      })
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка. Попробуйте позже.',
      undefined
    )
    expect(ctx.scene.leave).toHaveBeenCalledTimes(1)
  })

  it('should handle selecting a ruble amount via action callback', async () => {
    const amountRub = 100
    const stars = 50
    const invoiceUrl = 'https://robokassa.example.com/invoice/123'
    const invId = 'mockInvId123'
    mockedPriceHelpers.getInvoiceId.mockResolvedValue(invId)

    // @ts-ignore
    const actionCallback = rublePaymentScene.actions.get('top_up_rub_(d+)')
    if (!actionCallback) throw new Error('Action handler not found')

    // @ts-ignore
    ctx.updateType = 'callback_query'
    // @ts-ignore
    ctx.update.callback_query = mockUpdate.callback_query
    // @ts-ignore
    ctx.match = [`top_up_rub_${amountRub}`, amountRub.toString()]

    await actionCallback(ctx, jest.fn() as any)

    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1)
    expect(mockedPriceHelpers.getInvoiceId).toHaveBeenCalledWith(
      config.MERCHANT_LOGIN,
      amountRub,
      expect.any(Number),
      expect.stringContaining(`Пополнение баланса на ${stars} звезд`),
      config.PASSWORD1
    )
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram_id: '456',
        OutSum: amountRub.toString(),
        InvId: expect.any(String),
        currency: 'RUB',
        stars: stars,
        status: 'PENDING',
        payment_method: 'Robokassa',
        subscription: 'stars',
        bot_name: 'test_bot',
        language: 'ru',
      })
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining(`<b>Счет № ${invId} создан</b>`),
      expect.objectContaining({ parse_mode: 'HTML' })
    )
    expect(ctx.scene.leave).toHaveBeenCalledTimes(1)
  })

  it('should handle error when Robokassa invoice generation fails', async () => {
    const amountRub = 200
    mockedPriceHelpers.getInvoiceId.mockRejectedValue(invoiceError)

    // @ts-ignore
    const actionCallback = rublePaymentScene.actions.get('top_up_rub_(d+)')
    if (!actionCallback) throw new Error('Action handler not found')

    // @ts-ignore
    ctx.updateType = 'callback_query'
    // @ts-ignore
    ctx.update.callback_query = {
      ...mockUpdate.callback_query,
      data: `top_up_rub_${amountRub}`,
    }
    // @ts-ignore
    ctx.match = [`top_up_rub_${amountRub}`, amountRub.toString()]

    await actionCallback(ctx, jest.fn() as any)

    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1)
    expect(mockedPriceHelpers.getInvoiceId).toHaveBeenCalledTimes(1)
    expect(mockInsert).not.toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка при создании счета Robokassa. Попробуйте позже.',
      undefined
    )
    expect(ctx.scene.leave).toHaveBeenCalledTimes(1)
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        `Error processing callback top_up_rub_${amountRub}`
      ),
      expect.objectContaining({ error: invoiceError.message, telegram_id: 456 })
    )
  })

  it('should handle selecting an invalid ruble amount option', async () => {
    const invalidAmount = 999

    // @ts-ignore
    const actionCallback = rublePaymentScene.actions.get('top_up_rub_(d+)')
    if (!actionCallback) throw new Error('Action handler not found')

    // @ts-ignore
    ctx.updateType = 'callback_query'
    // @ts-ignore
    ctx.update.callback_query = {
      ...mockUpdate.callback_query,
      data: `top_up_rub_${invalidAmount}`,
    }
    // @ts-ignore
    ctx.match = [`top_up_rub_${invalidAmount}`, invalidAmount.toString()]

    await actionCallback(ctx, jest.fn() as any)

    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1)
    expect(mockedPriceHelpers.getInvoiceId).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка: неверная сумма пополнения.',
      undefined
    )
    expect(ctx.scene.leave).toHaveBeenCalledTimes(1)
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining(`Invalid ruble top-up option selected`),
      expect.objectContaining({ amount: invalidAmount, telegram_id: 456 })
    )
  })

  // Добавляем тест на ошибку при сохранении в БД
  it('should handle error when saving payment to DB fails', async () => {
    const amountRub = 100
    const stars = 50
    const invId = 'mockInvIdDbError'
    const dbError = new Error('DB insert error')
    mockedPriceHelpers.getInvoiceId.mockResolvedValue(invId)
    // Мокаем ошибку insert
    mockInsert.mockRejectedValue(dbError)

    // @ts-ignore
    const actionCallback = rublePaymentScene.actions.get('top_up_rub_(d+)')
    if (!actionCallback) throw new Error('Action handler not found')
    // @ts-ignore
    ctx.updateType = 'callback_query'
    // @ts-ignore
    ctx.update.callback_query = mockUpdate.callback_query
    // @ts-ignore
    ctx.match = [`top_up_rub_${amountRub}`, amountRub.toString()]

    await actionCallback(ctx, jest.fn() as any)

    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1)
    expect(mockedPriceHelpers.getInvoiceId).toHaveBeenCalledTimes(1)
    expect(mockInsert).toHaveBeenCalledTimes(1) // Проверяем, что попытка insert была
    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка при сохранении платежа. Попробуйте позже.',
      undefined
    )
    expect(ctx.scene.leave).toHaveBeenCalledTimes(1)
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error processing callback top_up_rub_'),
      expect.objectContaining({ error: dbError.message, telegram_id: 456 })
    )
  })
})
