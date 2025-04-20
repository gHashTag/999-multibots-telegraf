/* eslint-disable sonarjs/no-duplicate-string */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { Scenes } from 'telegraf'
import { paymentScene } from '../../src/scenes/paymentScene' // ОТНОСИТЕЛЬНЫЙ ПУТЬ
import {
  MyContext,
  MySession,
  SubscriptionType,
  ModeEnum,
  UserModel,
  ModelUrl,
} from '../../src/interfaces' // ОТНОСИТЕЛЬНЫЙ ПУТЬ, добавляем UserModel, ModelUrl
import { Update, Message } from 'telegraf/types' // Импортируем Message
import { makeMockContext } from '../utils/makeMockContext'
import { isRussian } from '../../src/helpers' // ОТНОСИТЕЛЬНЫЙ ПУТЬ
import * as handlers from '../../src/handlers' // ОТНОСИТЕЛЬНЫЙ ПУТЬ
import * as supabase from '../../src/core/supabase' // ОТНОСИТЕЛЬНЫЙ ПУТЬ
import * as priceHelpers from '../../src/price/helpers' // ОТНОСИТЕЛЬНЫЙ ПУТЬ
import * as config from '../../src/config' // ОТНОСИТЕЛЬНЫЙ ПУТЬ
import * as botCore from '../../src/core/bot' // ОТНОСИТЕЛЬНЫЙ ПУТЬ
import { logger } from '../../src/utils/logger' // ОТНОСИТЕЛЬНЫЙ ПУТЬ
import { setPaymentsSuccessResponse } from '../utils/mocks/supabaseMocks'

// Мокаем зависимости
jest.mock('../../src/helpers') // ОТНОСИТЕЛЬНЫЙ ПУТЬ
jest.mock('../../src/handlers') // ОТНОСИТЕЛЬНЫЙ ПУТЬ
jest.mock('../../src/core/supabase') // ОТНОСИТЕЛЬНЫЙ ПУТЬ
jest.mock('../../src/price/helpers', () => ({
  // ОТНОСИТЕЛЬНЫЙ ПУТЬ
  __esModule: true,
  // Не используем jest.requireActual и спред, чтобы избежать TS2698
  // Добавляем только те экспорты, которые реально используются в paymentScene или его тестах
  // (Скорее всего, для paymentScene.test.ts это могут быть только starAmounts и rubTopUpOptions,
  // но нужно проверить код самой сцены paymentScene/index.ts)

  // Пример (нужно проверить реальное использование):
  starAmounts: [
    { stars: 100, id: '1' },
    { stars: 200, id: '2' },
  ],
  rubTopUpOptions: [{ amountRub: 100, stars: 50, description: '' }],
  // Мокаем getInvoiceId, даже если он не используется прямо здесь,
  // на случай если другие части кода (которые не мокаются отдельно) его вызывают
  getInvoiceId: jest.fn(),
  // Добавь другие нужные моки функций из price/helpers, если они вызываются
  // например: calculateCostInStars: jest.fn(),
}))
jest.mock('../../src/config', () => ({
  // ОТНОСИТЕЛЬНЫЙ ПУТЬ
  MERCHANT_LOGIN: 'test_login',
  PASSWORD1: 'test_password1',
}))
jest.mock('../../src/core/bot') // ОТНОСИТЕЛЬНЫЙ ПУТЬ
jest.mock('../../src/utils/logger') // ОТНОСИТЕЛЬНЫЙ ПУТЬ

// Типизируем моки для автодополнения
const mockedIsRussian = jest.mocked(isRussian)
const mockedBotCore = jest.mocked(botCore)
const mockedLogger = jest.mocked(logger)

describe('Payment Scene', () => {
  let ctx: MyContext
  let replyMock: jest.Mock // Объявляем переменную для мока reply

  beforeEach(() => {
    jest.clearAllMocks()
    // Создаем более полный мок Update
    const mockUpdate: Update.CallbackQueryUpdate | Update.MessageUpdate = {
      update_id: 1,
      // Начнем с message для теста enter
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
    }
    ctx = makeMockContext(mockUpdate) // Передаем более конкретный Update
    mockedIsRussian.mockReturnValue(true)
    mockedBotCore.getBotNameByToken.mockReturnValue({ bot_name: 'test_bot' })

    // Инициализируем сцену в контексте
    // @ts-ignore
    ctx.scene = {
      enter: jest.fn(),
      leave: jest.fn(),
      reenter: jest.fn(),
      // @ts-ignore
      session: ctx.session,
      state: {},
      // @ts-ignore
      current: paymentScene,
      // @ts-ignore
      ctx: ctx,
    } as Scenes.SceneContextScene<MyContext, Scenes.WizardSessionData>

    // ИНИЦИАЛИЗИРУЕМ СЕССИЮ
    ctx.session = {
      subscription: undefined,
      mode: undefined,
      cursor: 0,
      images: [],
      targetUserId: 'default-target-id',
      userModel: {
        model_name: 'default_model',
        trigger_word: 'default_trigger',
        model_url: 'org/repo:version' as ModelUrl, // Используем каст к типу ModelUrl
      },
      email: undefined,
      steps: undefined,
    } as MySession
    // @ts-ignore
    ctx.scene.session = ctx.session

    // Инициализируем мок reply здесь, чтобы он был доступен в тестах
    replyMock = jest.fn() as jest.Mock
    ctx.reply = replyMock as jest.MockedFunction<typeof ctx.reply>
  })

  it('should enter the scene and show payment options for RU user', async () => {
    // @ts-ignore - next не используется в BaseScene enter
    await paymentScene.enterMiddleware()(ctx, jest.fn())

    expect(ctx.reply).toHaveBeenCalledTimes(1)
    expect(ctx.reply).toHaveBeenCalledWith(
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
      expect.stringContaining('paymentScene ROUTER ENTERED'),
      expect.any(Object)
    )
  })

  it('should enter the scene and show payment options for EN user', async () => {
    mockedIsRussian.mockReturnValue(false) // Английский пользователь
    // @ts-ignore
    await paymentScene.enterMiddleware()(ctx, jest.fn())

    expect(ctx.reply).toHaveBeenCalledTimes(1)
    // Обновляем ожидаемый текст и кнопки для EN
    expect(ctx.reply).toHaveBeenCalledWith(
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
    // Находим обработчик hears
    // @ts-ignore Не типизированный доступ к listeners
    const hearsHandler = paymentScene.listeners.find(
      listener =>
        Array.isArray(listener.triggers) &&
        listener.triggers.includes('⭐️ Звездами')
    )
    if (!hearsHandler || !hearsHandler.middleware) {
      throw new Error('Hears handler for "⭐️ Звездами" not found')
    }

    await hearsHandler.middleware(ctx, jest.fn() as any)

    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.StarPaymentScene)
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('User chose Stars. Entering'),
      expect.any(Object)
    )
  })

  it('should handle "💳 Рублями" and enter RublePaymentScene', async () => {
    // Находим обработчик hears
    // @ts-ignore
    const hearsHandler = paymentScene.listeners.find(
      listener =>
        Array.isArray(listener.triggers) &&
        listener.triggers.includes('💳 Рублями')
    )
    if (!hearsHandler || !hearsHandler.middleware) {
      throw new Error('Hears handler for "💳 Рублями" not found')
    }

    await hearsHandler.middleware(ctx, jest.fn() as any)

    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.RublePaymentScene)
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('User chose Rubles. Entering'),
      expect.any(Object)
    )
  })

  it('should handle "🏠 Главное меню" and enter MenuScene', async () => {
    // @ts-ignore
    const hearsHandler = paymentScene.listeners.find(
      listener =>
        Array.isArray(listener.triggers) &&
        listener.triggers.includes('🏠 Главное меню')
    )
    if (!hearsHandler || !hearsHandler.middleware) {
      throw new Error('Hears handler for "🏠 Главное меню" not found')
    }
    await hearsHandler.middleware(ctx, jest.fn() as any)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MenuScene)
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Leaving scene via Main Menu button'),
      expect.any(Object)
    )
  })

  // --- Убираем старые тесты для action, так как они переехали в дочерние сцены ---

  it('should handle unexpected message', async () => {
    // @ts-ignore - message точно есть
    ctx.update.message.text = 'непонятный текст'
    // @ts-ignore - Доступ к listeners
    const messageHandler = paymentScene.listeners.find(
      listener => listener.type === 'message' && !listener.triggers // Обработчик по умолчанию
    )
    if (!messageHandler || !messageHandler.middleware) {
      throw new Error('Default message handler not found')
    }
    await messageHandler.middleware(ctx, jest.fn() as any)

    expect(ctx.reply).toHaveBeenCalledWith(
      'Пожалуйста, выберите способ оплаты (⭐️ или 💳) или вернитесь в главное меню.'
    )
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Received unexpected message'),
      expect.any(Object)
    )
    expect(ctx.scene.enter).not.toHaveBeenCalled() // Должны остаться в текущей сцене
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  // Упрощенный тест ошибки входа
  it('should handle error during enterMiddleware and leave scene', async () => {
    const enterError = new Error('Enter failed')
    // Настраиваем мок ctx.reply для этого теста
    replyMock.mockImplementation(
      async (text: string, extra?: any): Promise<Message.TextMessage> => {
        if (text === 'Выберите способ оплаты:') {
          throw enterError
        }
        if (!ctx.chat || !ctx.from) {
          throw new Error('Chat or From context missing')
        }
        return {
          message_id: 2,
          date: Math.floor(Date.now() / 1000),
          chat: ctx.chat,
          from: ctx.from,
          text: text,
        }
      }
    )

    // @ts-ignore
    await paymentScene.enterMiddleware()(ctx, jest.fn())

    // Проверяем, что reply был вызван дважды
    expect(replyMock).toHaveBeenCalledTimes(2)
    // Проверяем второй вызов - сообщение об ошибке
    expect(replyMock).toHaveBeenNthCalledWith(
      2,
      'Произошла ошибка. Пожалуйста, попробуйте войти снова через меню.',
      expect.anything()
    )

    // Проверяем логирование ошибки (добавим проверку снова)
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error in enter:'),
      expect.objectContaining({ error: enterError.message })
    )

    // Проверяем, что сцена завершилась
    expect(ctx.scene.leave).toHaveBeenCalledTimes(1)
  })
})
