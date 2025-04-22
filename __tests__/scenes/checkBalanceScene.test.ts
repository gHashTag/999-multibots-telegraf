import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import { ModeEnum } from '@/interfaces/modes'
import * as priceHelpers from '@/price/helpers'
import * as userInfo from '@/handlers/getUserInfo'
import { checkBalanceScene } from '@/scenes/checkBalanceScene'
import {
  getUserDetails,
  UserDetailsResult,
} from '@/core/supabase/getUserDetails'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { UserModel } from '@/interfaces/models.interface'
import {
  MyContext,
  MySession,
  SessionData,
  WizardSessionData,
} from '@/interfaces'
import { Middleware, Scenes } from 'telegraf'
import type { Update, Message } from 'telegraf/typings/core/types/typegram'
import { WizardContext, WizardScene } from 'telegraf/scenes'

// Мокаем getUserDetails. reduceBalance мокать не нужно, т.к. его нет.
// Мокаем только getUserDetails
jest.mock('@/core/supabase/getUserDetails', () => ({
  getUserDetails: jest.fn(),
}))

jest.mock('@/price/helpers', () => ({
  sendBalanceMessage: jest.fn(),
  sendInsufficientStarsMessage: jest.fn(),
  calculateCostInStars: jest.fn().mockReturnValue(5),
}))
jest.mock('@/handlers/getUserInfo', () => ({
  getUserInfo: jest.fn().mockReturnValue({ telegramId: '42' }), // Убеждаемся, что ID это строка
}))

describe('checkBalanceScene.enter', () => {
  let ctx: MyContext
  const next = jest.fn()

  const mockFrom = {
    id: 123,
    is_bot: false,
    first_name: 'Test',
    last_name: 'User',
    username: 'testuser',
    language_code: 'ru',
  }

  const mockUserModel: UserModel = {
    model_name: 'test-model',
    trigger_word: 'test',
    model_url: 'org/model:version',
  }

  // Определяем моковую сессию используя MySession
  const mockSession: Partial<MySession> = {
    cursor: 0,
    mode: ModeEnum.NeuroPhoto,
    userModel: mockUserModel,
    images: [],
    targetUserId: '123',
  }

  // Моковая реализация getUserDetails
  const mockedGetUserDetails = getUserDetails as jest.MockedFunction<
    typeof getUserDetails
  >
  // const mockedReduceBalance = reduceBalance as jest.MockedFunction<typeof reduceBalance> // Комментируем

  // Моковые данные для тестов (тип UserDetailsResult импортирован)
  const mockUserDetailsSufficient: UserDetailsResult = {
    stars: 100,
    subscriptionType: SubscriptionType.NEUROPHOTO,
    isSubscriptionActive: true,
    isExist: true,
    subscriptionStartDate: new Date().toISOString(),
  }

  const mockUserDetailsInsufficient: UserDetailsResult = {
    stars: 1, // Недостаточно звезд
    subscriptionType: SubscriptionType.NEUROPHOTO,
    isSubscriptionActive: true,
    isExist: true,
    subscriptionStartDate: new Date().toISOString(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    next.mockClear()
    ctx = makeMockContext(
      { message: { from: mockFrom } },
      mockSession
    ) as MyContext

    // Мокируем методы сцены
    ctx.scene.enter =
      jest.fn<Scenes.SceneContext<MyContext>['scene']['enter']>()
    ctx.scene.leave =
      jest.fn<Scenes.SceneContext<MyContext>['scene']['leave']>()
  })

  it('should allow access and enter target scene if user exists, has subscription, and enough balance', async () => {
    mockedGetUserDetails.mockResolvedValue(mockUserDetailsSufficient)
    ctx.session.mode = ModeEnum.NeuroPhoto

    await checkBalanceScene.enter(ctx as any)

    expect(getUserDetails).toHaveBeenCalledWith('123')
    expect(ctx.scene.enter).toHaveBeenCalledWith(
      ModeEnum.NeuroPhoto,
      expect.any(Object)
    )
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('should deny access and leave scene if user exists, has subscription, but insufficient balance', async () => {
    mockedGetUserDetails.mockResolvedValue(mockUserDetailsInsufficient)
    ctx.session.mode = ModeEnum.NeuroPhoto

    await checkBalanceScene.enter(ctx as any)

    expect(getUserDetails).toHaveBeenCalledWith('123')
    expect(
      require('@/price/helpers').sendInsufficientStarsMessage
    ).toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(ctx.scene.enter).not.toHaveBeenCalled()
  })

  it('should deny access and enter StartScene if user exists but no active subscription', async () => {
    mockedGetUserDetails.mockResolvedValue({
      stars: 100,
      subscriptionType: null,
      isSubscriptionActive: false,
      isExist: true,
      subscriptionStartDate: null,
    })
    ctx.session.mode = ModeEnum.NeuroPhoto

    await checkBalanceScene.enter(ctx as any)

    expect(getUserDetails).toHaveBeenCalledWith('123')
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.StartScene)
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('should deny access and enter StartScene if user does not exist', async () => {
    mockedGetUserDetails.mockResolvedValue({
      stars: 0,
      subscriptionType: null,
      isSubscriptionActive: false,
      isExist: false,
      subscriptionStartDate: null,
    })
    ctx.session.mode = ModeEnum.NeuroPhoto

    await checkBalanceScene.enter(ctx as any)

    expect(getUserDetails).toHaveBeenCalledWith('123')
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Не удалось найти ваш профиль')
    )
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.StartScene)
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('should leave scene if getUserDetails rejects', async () => {
    const errorMessage = 'Database error'
    mockedGetUserDetails.mockRejectedValue(new Error(errorMessage))
    ctx.session.mode = ModeEnum.NeuroPhoto

    await checkBalanceScene.enter(ctx as any)

    expect(getUserDetails).toHaveBeenCalledWith('123')
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(ctx.scene.enter).not.toHaveBeenCalled()
  })

  it('should enter target scene if balance is sufficient', async () => {
    mockedGetUserDetails.mockResolvedValue(mockUserDetailsSufficient)
    ctx.session.mode = ModeEnum.NeuroPhoto
    await checkBalanceScene.enter(ctx as any)
    expect(ctx.scene.enter).toHaveBeenCalledWith(
      ModeEnum.NeuroPhoto,
      expect.any(Object)
    )
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('should leave scene if balance is insufficient', async () => {
    mockedGetUserDetails.mockResolvedValue(mockUserDetailsInsufficient)
    ctx.session.mode = ModeEnum.NeuroPhoto
    await checkBalanceScene.enter(ctx as any)
    expect(ctx.scene.enter).not.toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('should leave scene on error when fetching user details', async () => {
    const error = new Error('Failed to fetch user details')
    mockedGetUserDetails.mockRejectedValue(error)
    ctx.session.mode = ModeEnum.NeuroPhoto
    await checkBalanceScene.enter(ctx as any)
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(ctx.scene.enter).not.toHaveBeenCalled()
  })
})
