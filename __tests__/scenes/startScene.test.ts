/**
 * Тесты для startScene
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { startScene } from '../../src/scenes/startScene'
import makeMockContext from '../utils/mockTelegrafContext'

// Определяем тип для моков Supabase
type SupabaseMocks = {
  getTranslation: jest.Mock
  getReferalsCountAndUserData: jest.Mock
  checkPaymentStatus: jest.Mock
}

// Мокируем функции supabase
jest.mock('../../src/core/supabase', () => {
  return {
    // @ts-ignore - игнорируем ошибки типов в моках для тестов
    getTranslation: jest.fn().mockImplementation(({ key }: { key: any }) => ({
      translation: `Мок-перевод для ключа ${key}`,
      url: key === 'start' ? 'https://example.com/mock-photo.jpg' : '',
    })),
    // @ts-ignore - игнорируем ошибки типов в моках для тестов
    getReferalsCountAndUserData: jest
      .fn()
      .mockImplementation((telegram_id: string) => ({
        count: 0,
        level: 1,
        subscription: 'stars',
        userData: {
          user_id: '123e4567-e89b-12d3-a456-426614174000',
          telegram_id,
          subscription: 'stars',
          level: 1,
        },
        isExist: true,
      })),
    // @ts-ignore - игнорируем ошибки типов в моках для тестов
    checkPaymentStatus: jest
      .fn()
      .mockImplementation((ctx: any, subscription: string) => {
        return subscription !== 'stars'
      }),
  }
})

describe('startScene', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('должна отправить приветственное сообщение с фото и клавиатурой', async () => {
    // Создаем mock-контекст
    const ctx = makeMockContext()

    // Получаем и вызываем первый обработчик сцены
    // @ts-ignore - игнорируем ошибку типов для тестов
    const firstHandler = startScene.steps[0]
    // @ts-ignore - игнорируем ошибку типов для тестов
    await firstHandler(ctx)

    // Проверяем, что фото было отправлено
    expect(ctx.replyWithPhoto).toHaveBeenCalled()

    // Проверяем, что в ответе есть фото и клавиатура
    const photoReply = ctx.debug.replies[0]
    expect(photoReply.type).toBe('photo')
    expect(photoReply.url).toBe('https://example.com/mock-photo.jpg')
    expect(photoReply.caption).toBe('Мок-перевод для ключа start')
    expect(photoReply.extra.reply_markup).toBeDefined()

    // Проверяем, что был вызван метод next()
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('должна перейти на menuScene при наличии подписки', async () => {
    // Создаем mock-контекст с имитацией подписки
    const ctx = makeMockContext()

    // Переопределяем мок функцию для этого теста
    const supabaseMock = jest.requireMock(
      '../../src/core/supabase'
    ) as SupabaseMocks
    supabaseMock.checkPaymentStatus.mockReturnValueOnce(true)

    // Вызываем второй шаг сцены
    // @ts-ignore - игнорируем ошибку типов для тестов
    const secondHandler = startScene.steps[1]
    // @ts-ignore - игнорируем ошибку типов для тестов
    await secondHandler(ctx)

    // Проверяем, что был осуществлен переход на menuScene
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
  })

  it('должна перейти на subscriptionScene при отсутствии подписки', async () => {
    // Создаем mock-контекст без подписки
    const ctx = makeMockContext()

    // Переопределяем мок функцию для этого теста
    const supabaseMock = jest.requireMock(
      '../../src/core/supabase'
    ) as SupabaseMocks
    supabaseMock.checkPaymentStatus.mockReturnValueOnce(false)

    // Вызываем второй шаг сцены
    // @ts-ignore - игнорируем ошибку типов для тестов
    const secondHandler = startScene.steps[1]
    // @ts-ignore - игнорируем ошибку типов для тестов
    await secondHandler(ctx)

    // Проверяем, что был осуществлен переход на subscriptionScene
    expect(ctx.scene.enter).toHaveBeenCalledWith('subscriptionScene')
  })
})
