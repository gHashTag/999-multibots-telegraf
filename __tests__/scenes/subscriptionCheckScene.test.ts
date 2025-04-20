/**
 * Тесты для subscriptionCheckScene
 */
import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals'
import { subscriptionCheckScene } from '../../src/scenes/subscriptionCheckScene'
import makeMockContext from '../utils/mockTelegrafContext'
import { checkSubscriptionByTelegramId as checkSubscription } from '../../src/core/supabase/checkSubscriptionByTelegramId'
import { MyContext, ModeEnum } from '../../src/interfaces'
import { Scenes, Telegraf, session, Context } from 'telegraf'
import {
  MyContext as TelegramBotContext,
  MySession,
  SubscriptionType,
} from '@/interfaces/telegram-bot.interface'
import {
  makeMockContext as makeTelegrafMockContext,
  MockContextOptions,
} from '../utils/makeMockContext'
import { DeepMocked, createMock } from '@golevelup/ts-jest'
import { Middleware, MiddlewareFn } from 'telegraf'
import { Update } from 'telegraf/types'
import * as supabase from '@/core/supabase'
import * as constants from '@/constants'

// Мокируем зависимости
jest.mock('../../src/core/supabase/checkSubscriptionByTelegramId', () => ({
  checkSubscriptionByTelegramId: jest.fn(),
}))
jest.mock('../../src/middlewares/verifySubscription') // Мокаем, т.к. сцена его использует

// Изначально пустой, будет инициализироваться в beforeEach
let mockAdminIdsArray: number[] = []

jest.mock('@/config', () => ({
  // Используем getter-функцию
  get ADMIN_IDS_ARRAY() {
    return mockAdminIdsArray
  },
}))

// Типы для моков
interface SupabaseMocks {
  getUserByTelegramId: jest.Mock
  checkSubscriptionByTelegramId: jest.Mock
}

interface VerifyMocks {
  verifySubscription: jest.Mock
}

type SupabaseMock = DeepMocked<typeof supabase>

describe('subscriptionCheckScene', () => {
  let ctx: MyContext
  let step: any

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    mockAdminIdsArray = []
    // @ts-ignore
    step = subscriptionCheckScene.steps[0]
  })

  afterEach(() => {
    expect(ctx.reply).toHaveBeenCalledWith(
      constants.messages.ru.unsubscribed,
      expect.anything()
    )
    expect(ctx.scene.enter).toHaveBeenCalledWith('subscriptionScene')
  })

  it('should enter main menu if user is admin', async () => {
    const adminId = 123456789
    mockAdminIdsArray = [adminId]
    ctx = makeMockContext({ from: { id: adminId } })
    await step(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu) // ИСПОЛЬЗУЕМ ENUM
    expect(checkSubscription).not.toHaveBeenCalled()
  })

  it('should call checkSubscription for non-admin user', async () => {
    const userId = 987654321
    ctx = makeMockContext({ from: { id: userId } })
    ;(checkSubscription as jest.Mock).mockResolvedValue('neurobase')
    await step(ctx)
    expect(checkSubscription).toHaveBeenCalledWith(userId.toString())
  })

  it('should enter subscription scene if check returns unsubscribed', async () => {
    const userId = 987654321
    ctx = makeMockContext({ from: { id: userId } })
    ;(checkSubscription as jest.Mock).mockResolvedValue('unsubscribed')
    await step(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
  })

  it('should enter main menu if check returns a level', async () => {
    const userId = 987654321
    const level = 'neuroblogger'
    ctx = makeMockContext({ from: { id: userId } })
    ;(checkSubscription as jest.Mock).mockResolvedValue(level)
    await step(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu) // ИСПОЛЬЗУЕМ ENUM
    expect(ctx.session.subscription).toBe(level)
  })

  it('should enter subscription scene on error', async () => {
    const userId = 987654321
    ctx = makeMockContext({ from: { id: userId } })
    const error = new Error('DB failed')
    ;(checkSubscription as jest.Mock).mockRejectedValue(error)
    await step(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('error'))
  })

  it('should enter subscription scene if user ID is missing', async () => {
    ctx = makeMockContext({})
    await step(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('error'))
    expect(checkSubscription).not.toHaveBeenCalled()
  })

  test('should handle database error', async () => {
    const spMock = jest.requireMock('@/core/supabase') as SupabaseMock
    const err = new Error('DB Error')
    spMock.checkSubscriptionByTelegramId.mockRejectedValue(err)

    await expect(step(ctx, jest.fn())).rejects.toThrow('DB Error')
  })

  test('should grant access to admin', async () => {
    const spMock = jest.requireMock('@/core/supabase') as SupabaseMock
    spMock.checkSubscriptionByTelegramId = jest
      .fn()
      .mockResolvedValue(SubscriptionType.Free) // Админ может быть Free

    ctx = makeMockContext({ from: { id: 123, language_code: 'ru' } }) // ID админа из mockAdminIdsArray
    mockAdminIdsArray = [123, 456] // Убедимся, что массив содержит ID админа

    await step(ctx)

    expect(spMock.checkSubscriptionByTelegramId).not.toHaveBeenCalled() // Проверка подписки не должна вызываться для админа
    expect(ctx.reply).not.toHaveBeenCalled()
    expect(ctx.scene.enter).not.toHaveBeenCalled() // Админ не должен переходить в сцену подписки
  })
})
