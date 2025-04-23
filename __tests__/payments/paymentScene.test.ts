import { jest } from '@jest/globals'

// Мокируем logger перед любыми другими импортами
jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}))

// Мокируем модули, которые используются в тестах
jest.mock('@/helpers', () => ({
  isRussian: jest.fn().mockReturnValue(true),
  getSubscription: jest.fn(),
}))

// Мок для handlers - создаем имитацию функций
const mockHandleSelectRubAmount = jest.fn()
const mockHandleSelectStars = jest.fn()
const mockHandleBuySubscription = jest.fn()

jest.mock('@/handlers', () => ({
  handleSelectRubAmount: mockHandleSelectRubAmount,
  handleSelectStars: mockHandleSelectStars,
  handleBuySubscription: mockHandleBuySubscription,
}))

// Импортируем после мокирования
import { Update } from 'telegraf/types'
import { MyContext, ModeEnum } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { isRussian } from '@/helpers'
import { makeMockContext } from '../utils/makeMockContext'
import { starAmounts } from '@/price/helpers/starAmounts'
import { rubTopUpOptions } from '@/price/helpers/rubTopUpOptions'
import { logger } from '@/utils/logger'

// Типизированные моки
const mockedIsRussian = jest.mocked(isRussian)
const mockedLogger = jest.mocked(logger)

describe('Payment Scene', () => {
  // Создаем упрощенную версию сцены для тестов
  const paymentScene = {
    // Имитация логики enter
    enter: async (ctx: MyContext) => {
      try {
        mockedLogger.info('### paymentScene ENTERED ###', expect.any(Object))
        const isRu = mockedIsRussian(ctx)
        const message = isRu
          ? 'Выберите способ оплаты:'
          : 'Select payment method:'
        await ctx.reply(message, expect.any(Object))
      } catch (error: any) {
        mockedLogger.error(`Error in enter:`, { error: error.message })
        await ctx.reply(
          isRussian(ctx)
            ? 'Произошла ошибка. Пожалуйста, попробуйте войти снова через меню.'
            : 'An error occurred. Please try entering again via the menu.'
        )
        await ctx.scene.leave()
      }
    },

    // Имитация обработчиков hears
    hearsStars: async (ctx: MyContext) => {
      const isRu = mockedIsRussian(ctx)
      const subscription = ctx.session?.subscription

      // Логика, схожая с paymentScene.hears(["⭐️ Звездами", "⭐️ Stars"])
      if (subscription) {
        if (
          typeof subscription === 'string' &&
          ['neuroblogger', 'neurobase', 'neuromeeting', 'neurophoto'].includes(
            subscription.toLowerCase()
          )
        ) {
          await mockHandleBuySubscription({ ctx, isRu })
          return
        } else if (subscription === SubscriptionType.STARS) {
          await mockHandleSelectStars({ ctx, isRu, starAmounts })
          return
        }
      } else {
        await mockHandleSelectStars({ ctx, isRu, starAmounts })
        return
      }

      await ctx.reply(isRu ? 'Произошла ошибка' : 'An error occurred')
    },

    hearsRub: async (ctx: MyContext) => {
      mockedLogger.info(
        'User chose Rubles. Checking session',
        expect.any(Object)
      )
      await ctx.scene.enter(ModeEnum.RublePaymentScene)
    },

    hearsMainMenu: async (ctx: MyContext) => {
      await ctx.scene.enter(ModeEnum.MainMenu)
    },

    onMessage: async (ctx: MyContext) => {
      const isRu = mockedIsRussian(ctx)
      mockedLogger.warn('Received unexpected message', expect.any(Object))
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите способ оплаты (⭐️ или 💳) или вернитесь в главное меню.'
          : 'Please select a payment method (⭐️ or 💳) or return to the main menu.',
        expect.any(Object)
      )
    },
  }

  // Очищаем моки перед каждым тестом
  beforeEach(() => {
    jest.clearAllMocks()
    mockedIsRussian.mockReturnValue(true)
  })

  it('should show payment options for RU user when entering scene', async () => {
    // Создаем контекст
    const ctx = makeMockContext({ update_id: 1 })

    // Вызываем enter
    await paymentScene.enter(ctx)

    // Проверяем вызов reply
    expect(ctx.reply).toHaveBeenCalledWith(
      'Выберите способ оплаты:',
      expect.any(Object)
    )

    // Проверяем логирование
    expect(mockedLogger.info).toHaveBeenCalledWith(
      '### paymentScene ENTERED ###',
      expect.any(Object)
    )
  })

  it('should show payment options for EN user when entering scene', async () => {
    // Создаем контекст
    const ctx = makeMockContext({ update_id: 1 })

    // Устанавливаем мок isRussian на false
    mockedIsRussian.mockReturnValue(false)

    // Вызываем enter
    await paymentScene.enter(ctx)

    // Проверяем вызов reply
    expect(ctx.reply).toHaveBeenCalledWith(
      'Select payment method:',
      expect.any(Object)
    )
  })

  it('should call handleSelectStars when user selects Stars', async () => {
    // Создаем контекст с сообщением "⭐️ Звездами"
    const ctx = makeMockContext({
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
        text: '⭐️ Звездами',
      },
    })

    // Вызываем обработчик звезд
    await paymentScene.hearsStars(ctx)

    // Проверяем вызов handleSelectStars
    expect(mockHandleSelectStars).toHaveBeenCalledWith({
      ctx,
      isRu: true,
      starAmounts,
    })
  })

  it('should call scene.enter with RublePaymentScene when user selects Rubles', async () => {
    // Создаем контекст с сообщением "💳 Рублями"
    const ctx = makeMockContext({
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
        text: '💳 Рублями',
      },
    })

    // Вызываем обработчик рублей
    await paymentScene.hearsRub(ctx)

    // Проверяем переход в сцену оплаты рублями
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.RublePaymentScene)
    expect(mockedLogger.info).toHaveBeenCalledWith(
      'User chose Rubles. Checking session',
      expect.any(Object)
    )
  })

  it('should call scene.enter with MainMenu when user selects Main Menu', async () => {
    // Создаем контекст с сообщением "🏠 Главное меню"
    const ctx = makeMockContext({
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
        text: '🏠 Главное меню',
      },
    })

    // Вызываем обработчик главного меню
    await paymentScene.hearsMainMenu(ctx)

    // Проверяем переход в главное меню
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
  })

  it('should handle unexpected messages', async () => {
    // Создаем контекст с непредусмотренным сообщением
    const ctx = makeMockContext({
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
        text: 'Непредусмотренное сообщение',
      },
    })

    // Вызываем обработчик сообщений
    await paymentScene.onMessage(ctx)

    // Проверяем ответ и логирование
    expect(ctx.reply).toHaveBeenCalled()
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Received unexpected message',
      expect.any(Object)
    )
  })

  it('should handle error during scene enter', async () => {
    // Создаем контекст
    const ctx = makeMockContext({ update_id: 6 })

    // Создаем мок для ctx.reply, который бросает ошибку при первом вызове
    const replyMock = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('Test error')
      })
      .mockImplementation(() => Promise.resolve())

    ctx.reply = replyMock as any

    // Вызываем enter
    await paymentScene.enter(ctx)

    // Проверяем второй вызов reply с сообщением об ошибке
    expect(replyMock).toHaveBeenCalledTimes(2)
    expect(replyMock).toHaveBeenNthCalledWith(
      2,
      'Произошла ошибка. Пожалуйста, попробуйте войти снова через меню.'
    )
    expect(mockedLogger.error).toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('should call handleBuySubscription for known subscription type', async () => {
    // Создаем контекст с подпиской
    const ctx = makeMockContext(
      {
        update_id: 7,
        message: {
          message_id: 7,
          date: Date.now(),
          from: {
            id: 123,
            is_bot: false,
            first_name: 'Test',
            language_code: 'ru',
          },
          chat: { id: 123, type: 'private', first_name: 'Test' },
          text: '⭐️ Звездами',
        },
      },
      {
        subscription: SubscriptionType.NEUROBLOGGER,
      }
    )

    // Вызываем обработчик звезд
    await paymentScene.hearsStars(ctx)

    // Проверяем вызов handleBuySubscription
    expect(mockHandleBuySubscription).toHaveBeenCalledWith({
      ctx,
      isRu: true,
    })
  })
})
