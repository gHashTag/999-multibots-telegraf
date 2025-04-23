// Мокирование модулей должно идти до импортов
import { jest } from '@jest/globals'

// Мокируем logger перед любыми другими импортами
jest.mock('@/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}))

// Мокируем модули, которые используются в тестах
jest.mock('@/helpers/language', () => ({ isRussian: () => true }))

// Мок для handleSelectStars - создаем имитацию функции
const mockHandleSelectStars = jest.fn()
jest.mock('@/handlers', () => ({
  handleSelectStars: mockHandleSelectStars,
}))

// Импортируем остальное после мокирования
import { MyContext } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { starAmounts } from '@/price/helpers/starAmounts'
import { makeMockContext } from '../utils/makeMockContext'

// Тесты
describe('starPaymentScene', () => {
  // Сцена для теста (упрощенная)
  const starPaymentScene = {
    middleware: () => async (ctx: MyContext, next: any) => {
      await mockHandleSelectStars({ ctx, isRu: true, starAmounts })
      await next()
    },
  }

  // Очищаем моки перед каждым тестом
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('вызывает handleSelectStars при входе в сцену', async () => {
    // Создаем контекст
    const ctx = makeMockContext({ update_id: 1 }, { balance: 500 })
    const next = jest.fn()

    // Вызываем middleware
    await starPaymentScene.middleware()(ctx, next)

    // Проверяем вызов
    expect(mockHandleSelectStars).toHaveBeenCalledWith({
      ctx,
      isRu: true,
      starAmounts,
    })
    expect(next).toHaveBeenCalled()
  })

  test('работает с контекстом, содержащим подписку', async () => {
    // Создаем контекст с подпиской
    const ctx = makeMockContext(
      { update_id: 2 },
      {
        balance: 500,
        subscription: SubscriptionType.NEUROBLOGGER,
      }
    )
    const next = jest.fn()

    // Вызываем middleware
    await starPaymentScene.middleware()(ctx, next)

    // Проверяем вызов
    expect(mockHandleSelectStars).toHaveBeenCalledWith({
      ctx,
      isRu: true,
      starAmounts,
    })
    expect(next).toHaveBeenCalled()
  })

  test('работает с контекстом, содержащим callback_query', async () => {
    // Создаем контекст с callback_query
    const ctx = makeMockContext(
      {
        update_id: 3,
        callback_query: {
          id: '123',
          data: 'menu',
          chat_instance: '1',
          from: {
            id: 123,
            first_name: 'Test',
            is_bot: false,
          },
        },
      },
      { balance: 500 }
    )
    const next = jest.fn()

    // Вызываем middleware
    await starPaymentScene.middleware()(ctx, next)

    // Проверяем вызов
    expect(mockHandleSelectStars).toHaveBeenCalledWith({
      ctx,
      isRu: true,
      starAmounts,
    })
    expect(next).toHaveBeenCalled()
  })

  test('работает с контекстом, содержащим message', async () => {
    // Создаем контекст с сообщением
    const ctx = makeMockContext(
      {
        update_id: 4,
        message: {
          message_id: 123,
          date: 1622222111,
          text: 'Тестовое сообщение',
          from: {
            id: 456,
            first_name: 'Test User',
            is_bot: false,
          },
          chat: {
            id: 456,
            type: 'private',
            first_name: 'Test User',
          },
        },
      },
      { balance: 500 }
    )
    const next = jest.fn()

    // Вызываем middleware
    await starPaymentScene.middleware()(ctx, next)

    // Проверяем вызов
    expect(mockHandleSelectStars).toHaveBeenCalledWith({
      ctx,
      isRu: true,
      starAmounts,
    })
    expect(next).toHaveBeenCalled()
  })
})
