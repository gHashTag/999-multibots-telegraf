/* eslint-disable sonarjs/no-duplicate-string */
// import { jest, describe, it, expect, beforeEach } from '@jest/globals' // УДАЛИТЬ
import { Scenes } from 'telegraf'
import {
  MyContext,
  MySession,
  SubscriptionType,
  ModeEnum,
  UserModel,
  ModelUrl,
} from '../../src/interfaces' // ОТНОСИТЕЛЬНЫЙ
import { Update, Message } from 'telegraf/types' // Импортируем Message
import { makeMockContext } from '../utils/makeMockContext'
import { isRussian } from '../../src/helpers' // ОТНОСИТЕЛЬНЫЙ
import * as handlers from '../../src/handlers' // ОТНОСИТЕЛЬНЫЙ
import * as supabase from '../../src/core/supabase' // ОТНОСИТЕЛЬНЫЙ
import * as priceHelpers from '../../src/price/helpers' // ОТНОСИТЕЛЬНЫЙ
import * as config from '../../src/config' // ОТНОСИТЕЛЬНЫЙ
import * as botCore from '../../src/core/bot' // ОТНОСИТЕЛЬНЫЙ
import { logger } from '../../src/utils/logger' // ОТНОСИТЕЛЬНЫЙ
import { setPaymentsSuccessResponse } from '../utils/mocks/supabaseMocks' // ОТНОСИТЕЛЬНЫЙ
import { paymentScene } from '../../src/scenes/paymentScene' // ОТНОСИТЕЛЬНЫЙ путь

// Мокаем зависимости ДО импорта сцены с ОТНОСИТЕЛЬНЫМИ путями
jest.mock('../../src/helpers')
jest.mock('../../src/handlers')
jest.mock('../../src/core/supabase')
jest.mock('../../src/price/helpers', () => ({
  __esModule: true,
  starAmounts: [
    { stars: 100, id: '1' },
    { stars: 200, id: '2' },
  ],
  rubTopUpOptions: [{ amountRub: 100, stars: 50, description: '' }],
  getInvoiceId: jest.fn(),
}))
jest.mock('../../src/config', () => ({
  MERCHANT_LOGIN: 'test_login',
  PASSWORD1: 'test_password1',
  SUPABASE_URL: 'http://mock-supabase.co',
  SUPABASE_SERVICE_KEY: 'mock-key',
  SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
}))
jest.mock('../../src/core/bot')
jest.mock('../../src/utils/logger')

// Типизируем моки для автодополнения
const mockedIsRussian = jest.mocked(isRussian)
const mockedBotCore = jest.mocked(botCore)
const mockedLogger = jest.mocked(logger)

describe('Payment Scene', () => {
  let ctx: MyContext
  let replyMock: jest.Mock
  let mockUpdate: Update.MessageUpdate | Update.CallbackQueryUpdate

  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdate = {
      update_id: 1,
      message: {
        message_id: 1,
        date: Date.now(),
        from: {
          id: 123,
          is_bot: false,
          first_name: 'Test',
          language_code: 'ru',
        },
        chat: { id: 123, type: 'private', first_name: 'Test' },
        text: '',
      },
    } as Update.MessageUpdate
    ctx = makeMockContext(mockUpdate)
    mockedIsRussian.mockReturnValue(true)
    mockedBotCore.getBotNameByToken.mockReturnValue({ bot_name: 'test_bot' })
    replyMock = jest.fn()
    ctx.reply = replyMock as jest.MockedFunction<typeof ctx.reply>

    // Убедимся, что ctx.scene и его методы замоканы
    // @ts-ignore
    ctx.scene = {
      enter: jest.fn(),
      leave: jest.fn(),
      reenter: jest.fn(),
      // @ts-ignore
      session: ctx.session,
      state: {},
      // @ts-ignore
      current: paymentScene, // Указываем текущую сцену
      ctx: ctx,
    } as Scenes.SceneContextScene<MyContext, Scenes.WizardSessionData>
  })

  it('should enter the scene and show payment options for RU user', async () => {
    // Используем enterMiddleware
    await paymentScene.enterMiddleware()(ctx, async () => {})

    expect(replyMock).toHaveBeenCalledTimes(1)
    expect(replyMock).toHaveBeenCalledWith(
      'Выберите способ оплаты:',
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: '⭐️ Звездами' }),
              expect.objectContaining({ text: '💳 Рублями' }),
            ]),
            expect.arrayContaining([
              expect.objectContaining({ text: 'Что такое звезды❓' }),
            ]),
            expect.arrayContaining([
              // Добавляем проверку кнопки выхода
              expect.objectContaining({ text: '🏠 Главное меню' }),
            ]),
          ]),
          resize_keyboard: true,
        }),
      })
    )
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('### paymentScene ENTERED ###'),
      expect.any(Object)
    )
  })

  it('should enter the scene and show payment options for EN user', async () => {
    mockedIsRussian.mockReturnValue(false)
    // Используем enterMiddleware
    await paymentScene.enterMiddleware()(ctx, async () => {})

    expect(replyMock).toHaveBeenCalledTimes(1)
    expect(replyMock).toHaveBeenCalledWith(
      'Select payment method:',
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: '⭐️ Stars' }),
              expect.objectContaining({ text: '💳 Rubles' }), // Обновленный текст кнопки
            ]),
            expect.arrayContaining([
              expect.objectContaining({ text: 'What are stars❓' }),
            ]),
            expect.arrayContaining([
              expect.objectContaining({ text: '🏠 Main menu' }), // Обновленный текст кнопки
            ]),
          ]),
          resize_keyboard: true,
        }),
      })
    )
  })

  // --- Тесты для hears ---
  it('should handle "⭐️ Звездами" and enter StarPaymentScene', async () => {
    // @ts-ignore
    ctx.message = { ...ctx.message, text: '⭐️ Звездами' }
    // @ts-ignore
    ctx.updateType = 'message'
    // @ts-ignore
    ctx.update.message = ctx.message
    // Используем middleware
    await paymentScene.middleware()(ctx, async () => {})

    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.StarPaymentScene)
  })

  it('should handle "💳 Рублями" and enter RublePaymentScene', async () => {
    // @ts-ignore
    ctx.message = { ...ctx.message, text: '💳 Рублями' }
    // @ts-ignore
    ctx.updateType = 'message'
    // @ts-ignore
    ctx.update.message = ctx.message
    // Используем middleware
    await paymentScene.middleware()(ctx, async () => {})

    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.RublePaymentScene)
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('User chose Rubles. Entering'),
      expect.any(Object)
    )
  })

  it('should handle "🏠 Главное меню" and enter MenuScene', async () => {
    // @ts-ignore
    ctx.message = { ...ctx.message, text: '🏠 Главное меню' }
    // @ts-ignore
    ctx.updateType = 'message'
    // @ts-ignore
    ctx.update.message = ctx.message
    // Используем middleware
    await paymentScene.middleware()(ctx, async () => {})

    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MenuScene)
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Leaving scene via Main Menu button'),
      expect.any(Object)
    )
  })

  // --- Тест для on('message') ---
  it('should handle unexpected message', async () => {
    // @ts-ignore
    ctx.message = { ...ctx.message, text: 'непонятный текст' }
    // @ts-ignore
    ctx.updateType = 'message'
    // @ts-ignore
    ctx.update.message = ctx.message
    // Используем middleware
    await paymentScene.middleware()(ctx, async () => {})

    expect(replyMock).toHaveBeenCalledWith(
      'Пожалуйста, выберите способ оплаты (⭐️ или 💳) или вернитесь в главное меню.',
      expect.any(Object)
    )
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Received unexpected message'),
      expect.any(Object)
    )
    expect(ctx.scene.enter).not.toHaveBeenCalled()
  })

  // --- Тест ошибки входа ---
  it('should handle error during enterMiddleware and leave scene', async () => {
    const enterError = new Error('Enter failed')
    replyMock.mockImplementationOnce(async () => {
      throw enterError
    })

    // Используем enterMiddleware
    await paymentScene.enterMiddleware()(ctx, async () => {})

    expect(replyMock).toHaveBeenCalledTimes(2)
    expect(replyMock).toHaveBeenNthCalledWith(
      2,
      'Произошла ошибка. Пожалуйста, попробуйте войти снова через меню.'
    )
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error in enter:'),
      expect.objectContaining({ error: enterError.message })
    )
    expect(ctx.scene.leave).toHaveBeenCalledTimes(1)
  })
})
