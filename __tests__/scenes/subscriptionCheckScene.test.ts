/**
 * Тесты для subscriptionCheckScene
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { subscriptionCheckScene } from '../../src/scenes/subscriptionCheckScene'
import makeMockContext from '../utils/mockTelegrafContext'

// Мокируем зависимости
jest.mock('../../src/core/supabase', () => ({
  // @ts-ignore
  getUserByTelegramId: jest.fn(),
}))
jest.mock('../../src/middlewares/verifySubscription', () => ({
  // @ts-ignore
  verifySubscription: jest.fn(),
}))
jest.mock('../../src/handlers', () => ({
  // @ts-ignore
  getSubScribeChannel: jest.fn(),
}))

// Типы моков
type SupabaseMocks = {
  getUserByTelegramId: jest.Mock
}
type VerifyMocks = {
  verifySubscription: jest.Mock
}
type HandlerMocks = {
  getSubScribeChannel: jest.Mock
}

describe('subscriptionCheckScene', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('должна перейти в createUserScene, если пользователь не существует', async () => {
    const ctx = makeMockContext()
    // @ts-ignore: requireMock returns unknown
    const supabaseMock = jest.requireMock('../../src/core/supabase') as SupabaseMocks
    supabaseMock.getUserByTelegramId.mockResolvedValueOnce(null)

    // Вызываем единственный шаг сцены
    // @ts-ignore
    const step = subscriptionCheckScene.steps[0]
    await step(ctx)

    expect(ctx.scene.enter).toHaveBeenCalledWith('createUserScene')
  })

  it('должна выйти из сцены, если подписка не stars и пользователь не подписан', async () => {
    const ctx = makeMockContext()
    const supabaseMock = jest.requireMock(
      '../../src/core/supabase'
    ) as SupabaseMocks
    // Пользователь существует, но подписка не stars
    supabaseMock.getUserByTelegramId.mockResolvedValueOnce({
      subscription: 'premium',
    })

    // @ts-ignore: requireMock returns unknown
    const handlerMock = jest.requireMock('../../src/handlers') as HandlerMocks
    handlerMock.getSubScribeChannel.mockReturnValueOnce('channel123')

    // @ts-ignore: requireMock returns unknown
    const verifyMock = jest.requireMock('../../src/middlewares/verifySubscription') as VerifyMocks
    verifyMock.verifySubscription.mockResolvedValueOnce(false)

    // @ts-ignore
    const step = subscriptionCheckScene.steps[0]
    await step(ctx)

    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('должна перейти в menuScene, если подписка stars и mode main_menu', async () => {
    const ctx = makeMockContext()
    ctx.session.mode = 'main_menu'
    // @ts-ignore: requireMock returns unknown
    const supabaseMock = jest.requireMock('../../src/core/supabase') as SupabaseMocks
    supabaseMock.getUserByTelegramId.mockResolvedValueOnce({
      subscription: 'stars',
    })

    // @ts-ignore
    const step = subscriptionCheckScene.steps[0]
    await step(ctx)

    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
  })

  it('должна перейти в startScene, если подписка stars и mode не main_menu', async () => {
    const ctx = makeMockContext()
    // @ts-ignore: allow invalid mode for test
    ctx.session.mode = 'other'
    // @ts-ignore: requireMock returns unknown
    const supabaseMock = jest.requireMock('../../src/core/supabase') as SupabaseMocks
    supabaseMock.getUserByTelegramId.mockResolvedValueOnce({
      subscription: 'stars',
    })

    // @ts-ignore
    const step = subscriptionCheckScene.steps[0]
    await step(ctx)

    expect(ctx.scene.enter).toHaveBeenCalledWith('startScene')
  })

  it('должна перейти в menuScene после верификации подписки, если подписка не stars и подписан, mode main_menu', async () => {
    const ctx = makeMockContext()
    ctx.session.mode = 'main_menu'
    // @ts-ignore: requireMock returns unknown
    const supabaseMock = jest.requireMock('../../src/core/supabase') as SupabaseMocks
    supabaseMock.getUserByTelegramId.mockResolvedValueOnce({
      subscription: 'premium',
    })

    // @ts-ignore: requireMock returns unknown
    const handlerMock = jest.requireMock('../../src/handlers') as HandlerMocks
    handlerMock.getSubScribeChannel.mockReturnValueOnce('channel123')

    // @ts-ignore: requireMock returns unknown
    const verifyMock = jest.requireMock('../../src/middlewares/verifySubscription') as VerifyMocks
    verifyMock.verifySubscription.mockResolvedValueOnce(true)

    // @ts-ignore
    const step = subscriptionCheckScene.steps[0]
    await step(ctx)

    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
  })

  it('должна перейти в startScene после верификации подписки, если подписка не stars и подписан, mode не main_menu', async () => {
    const ctx = makeMockContext()
    // @ts-ignore: allow invalid mode for test
    ctx.session.mode = 'other'
    // @ts-ignore: requireMock returns unknown
    const supabaseMock = jest.requireMock('../../src/core/supabase') as SupabaseMocks
    supabaseMock.getUserByTelegramId.mockResolvedValueOnce({
      subscription: 'premium',
    })

    // @ts-ignore: requireMock returns unknown
    const handlerMock = jest.requireMock('../../src/handlers') as HandlerMocks
    handlerMock.getSubScribeChannel.mockReturnValueOnce('channel123')

    // @ts-ignore: requireMock returns unknown
    const verifyMock = jest.requireMock('../../src/middlewares/verifySubscription') as VerifyMocks
    verifyMock.verifySubscription.mockResolvedValueOnce(true)

    // @ts-ignore
    const step = subscriptionCheckScene.steps[0]
    await step(ctx)

    expect(ctx.scene.enter).toHaveBeenCalledWith('startScene')
  })
})
