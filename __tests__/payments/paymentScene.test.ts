// import { jest, describe, it, expect, beforeEach } from '@jest/globals' // УДАЛИТЬ
import { Scenes } from 'telegraf'
import {
  MyContext,
  MySession,
  SubscriptionType,
  ModeEnum,
  UserModel,
  ModelUrl,
} from '@/interfaces' // Используем алиас
import { Update, Message } from 'telegraf/types' // Импортируем Message
import { makeMockContext } from '../utils/makeMockContext' // Оставляем относительным
import { isRussian } from '@/helpers' // Используем алиас
import * as handlers from '@/handlers' // Используем алиас
import * as supabase from '@/core/supabase' // Используем алиас
import * as priceHelpers from '@/price/helpers' // Используем алиас
import * as config from '@/config' // Используем алиас
import * as botCore from '@/core/bot' // Используем алиас
import { logger } from '@/utils/logger' // Используем алиас
import { setPaymentsSuccessResponse } from '../utils/mocks/supabaseMocks' // Оставляем относительным
import { paymentScene } from '@/scenes/paymentScene' // Используем алиас

// Мокаем зависимости ДО импорта сцены с АЛИАСАМИ
jest.mock('@/helpers')
jest.mock('@/handlers')
jest.mock('@/core/supabase')
jest.mock('@/price/helpers', () => ({
  __esModule: true,
  starAmounts: [
    { stars: 100, id: '1' },
    { stars: 200, id: '2' },
  ],
  rubTopUpOptions: [{ amountRub: 100, stars: 50, description: '' }],
  getInvoiceId: jest.fn(),
}))
jest.mock('@/config', () => ({
  MERCHANT_LOGIN: 'test_login',
  PASSWORD1: 'test_password1',
  SUPABASE_URL: 'http://mock-supabase.co',
  SUPABASE_SERVICE_KEY: 'mock-key',
  SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
}))
jest.mock('@/core/bot')
jest.mock('@/utils/logger')

// Типизируем моки для автодополнения
const mockedIsRussian = jest.mocked(isRussian)
const mockedBotCore = jest.mocked(botCore)
const mockedLogger = jest.mocked(logger)

describe('Payment Scene', () => {
  let ctx: MyContext
  let replyMock: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext({ update_id: 1 } as Update) // Use basic update for enter tests
    mockedIsRussian.mockReturnValue(true)
    mockedBotCore.getBotNameByToken.mockReturnValue({ bot_name: 'test_bot' })
    replyMock = jest.fn()
    ctx.reply = replyMock as jest.MockedFunction<typeof ctx.reply>

    // We rely on makeMockContext to provide a valid ctx.scene mock
    // No need to manually mock ctx.scene here
  })

  it('should enter the scene and show payment options for RU user', async () => {
    await paymentScene.enterMiddleware()(ctx, jest.fn())

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
    await paymentScene.enterMiddleware()(ctx, jest.fn())

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
    const text = '⭐️ Звездами'
    const messageUpdate: Update.MessageUpdate = {
      update_id: 2,
      message: {
        message_id: 2,
        date: Date.now(),
        from: {
          id: 123,
          is_bot: false,
          first_name: 'Test',
          language_code: 'ru',
        },
        chat: { id: 123, type: 'private', first_name: 'Test' },
        text: text,
      },
    }
    // Create context specific for this message update
    ctx = makeMockContext(messageUpdate)
    // We rely on makeMockContext to provide ctx.scene

    await paymentScene.middleware()(ctx, jest.fn())
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.StarPaymentScene)
  })

  it('should handle "💳 Рублями" and enter RublePaymentScene', async () => {
    const text = '💳 Рублями'
    const messageUpdate: Update.MessageUpdate = {
      update_id: 3,
      message: {
        message_id: 3,
        date: Date.now(),
        from: {
          id: 123,
          is_bot: false,
          first_name: 'Test',
          language_code: 'ru',
        },
        chat: { id: 123, type: 'private', first_name: 'Test' },
        text: text,
      },
    }
    // Create context specific for this message update
    ctx = makeMockContext(messageUpdate)
    // We rely on makeMockContext to provide ctx.scene

    await paymentScene.middleware()(ctx, jest.fn())
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.RublePaymentScene)
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('User chose Rubles. Entering'),
      expect.any(Object)
    )
  })

  it('should handle "🏠 Главное меню" and enter MenuScene', async () => {
    const text = '🏠 Главное меню'
    const messageUpdate: Update.MessageUpdate = {
      update_id: 4,
      message: {
        message_id: 4,
        date: Date.now(),
        from: {
          id: 123,
          is_bot: false,
          first_name: 'Test',
          language_code: 'ru',
        },
        chat: { id: 123, type: 'private', first_name: 'Test' },
        text: text,
      },
    }
    // Create context specific for this message update
    ctx = makeMockContext(messageUpdate)
    // We rely on makeMockContext to provide ctx.scene

    await paymentScene.middleware()(ctx, jest.fn())
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MenuScene)
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Leaving scene via Main Menu button'),
      expect.any(Object)
    )
  })

  // --- Тест для on('message') ---
  it('should handle unexpected message', async () => {
    const text = 'непонятный текст'
    const messageUpdate: Update.MessageUpdate = {
      update_id: 5,
      message: {
        message_id: 5,
        date: Date.now(),
        from: {
          id: 123,
          is_bot: false,
          first_name: 'Test',
          language_code: 'ru',
        },
        chat: { id: 123, type: 'private', first_name: 'Test' },
        text: text,
      },
    }
    // Create context specific for this message update
    ctx = makeMockContext(messageUpdate)
    replyMock = jest.fn() // Re-assign mockReply as ctx is new
    ctx.reply = replyMock as jest.MockedFunction<typeof ctx.reply>
    // We rely on makeMockContext to provide ctx.scene

    await paymentScene.middleware()(ctx, jest.fn())
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
    // Re-create context for this specific test setup
    ctx = makeMockContext({ update_id: 6 } as Update)
    replyMock = jest.fn()
    ctx.reply = replyMock as jest.MockedFunction<typeof ctx.reply>
    // We rely on makeMockContext to provide ctx.scene
    const leaveMock = jest.fn()
    ctx.scene.leave = leaveMock // Assign the leave mock to the scene from makeMockContext

    replyMock.mockImplementationOnce(async () => {
      throw enterError
    })

    await paymentScene.enterMiddleware()(ctx, jest.fn())

    expect(replyMock).toHaveBeenCalledTimes(2)
    expect(replyMock).toHaveBeenNthCalledWith(
      2,
      'Произошла ошибка. Пожалуйста, попробуйте войти снова через меню.'
    )
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error in enter:'),
      expect.objectContaining({ error: enterError.message })
    )
    expect(leaveMock).toHaveBeenCalledTimes(1) // Check if the specific leave mock was called
  })
})
