/**
 * Тесты для нейрофото-сцены (neuroPhotoWizard)
 */
import { neuroPhotoWizard } from '../../src/scenes/neuroPhotoWizard'
import makeMockContext from '../utils/mockTelegrafContext'
import { Scenes } from 'telegraf'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import {
  MyContext,
  MySession,
  UserModel,
  ModeEnum,
  SubscriptionType,
} from '@/interfaces'
import {
  User,
  Message,
  Chat,
  Update,
} from 'telegraf/typings/core/types/typegram'
import { Markup } from 'telegraf'
import { WizardContextWizard } from 'telegraf/typings/scenes'

// Мокаем зависимости
jest.mock('@/handlers/getUserInfo')
jest.mock('@/core/supabase')
jest.mock('@/services/generateNeuroImage')
jest.mock('@/menu')
jest.mock('@/handlers/handleHelpCancel')
jest.mock('@/handlers')

// Импортируем мокированные версии
import { getUserInfo } from '@/handlers/getUserInfo'
import {
  getLatestUserModel,
  getReferalsCountAndUserData,
} from '@/core/supabase'
import { generateNeuroImage } from '@/services/generateNeuroImage'
import {
  mainMenu,
  sendPhotoDescriptionRequest,
  sendGenericErrorMessage,
} from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { handleMenu } from '@/handlers'

// Типизируем моки (теперь можно использовать импорты)
const typedMockedGetUserInfo = getUserInfo as jest.Mock
const typedMockedGetLatestModel = getLatestUserModel as jest.Mock<
  () => Promise<UserModel | null>
>
const typedMockedGetReferals = getReferalsCountAndUserData as jest.Mock<
  () => Promise<{
    count: number
    level: number
    subscriptionType: SubscriptionType
    userData: any | null
    isExist: boolean
  }>
>
const typedMockedGenerateImage = generateNeuroImage as jest.Mock
const typedMockedMainMenu = mainMenu as jest.Mock
const typedMockedSendDescRequest = sendPhotoDescriptionRequest as jest.Mock
const typedMockedSendGenericError = sendGenericErrorMessage as jest.Mock
const typedMockedHandleHelpCancel = handleHelpCancel as jest.Mock<
  (...args: any[]) => Promise<boolean>
>
const typedMockedHandleMenu = handleMenu as jest.Mock

// Получаем middleware напрямую
const wizardMiddleware = neuroPhotoWizard.middleware()

describe('neuroPhotoWizard', () => {
  let ctx: MyContext
  const mockNext = jest.fn<() => Promise<void>>()
  const mockUserModel: UserModel = {
    model_name: 'test-model',
    model_url: 'placeholder/placeholder:placeholder',
    trigger_word: 'tw',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockNext.mockClear()
    typedMockedMainMenu.mockResolvedValue({
      text: 'Menu',
      reply_markup: Markup.keyboard([]),
    })

    ctx = makeMockContext(
      { update_id: 1 },
      { userModel: mockUserModel, targetUserId: 't1' }
    )
    const mockTextMessage: Message.TextMessage = {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private', first_name: 'mock' },
      text: 'mock',
    }
    ctx.reply = jest
      .fn<(...args: any[]) => Promise<Message.TextMessage>>()
      .mockResolvedValue(mockTextMessage)
    ctx.scene.enter = jest
      .fn<(...args: any[]) => Promise<unknown>>()
      .mockResolvedValue(true)
    ctx.scene.leave = jest
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined)
    ctx.wizard.next = jest
      .fn<() => WizardContextWizard<MyContext>>()
      .mockReturnValue({ cursor: 1 } as any)
    ctx.wizard.back = jest
      .fn<() => WizardContextWizard<MyContext>>()
      .mockReturnValue({ cursor: -1 } as any)
    ctx.wizard.cursor = 0
  })

  it('Шаг 0: должна выйти, если нет обученной модели', async () => {
    typedMockedGetUserInfo.mockReturnValue({ userId: 'u1', telegramId: 't1' })
    typedMockedGetLatestModel.mockResolvedValueOnce(null)
    typedMockedGetReferals.mockResolvedValueOnce({
      count: 0,
      level: 1,
      subscriptionType: SubscriptionType.STARS,
      userData: null,
      isExist: true,
    })

    ctx.wizard.cursor = 0
    await wizardMiddleware(ctx, mockNext)

    expect(typedMockedGetLatestModel).toHaveBeenCalledWith('t1')
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('Шаг 0: должна запросить описание и перейти к следующему шагу', async () => {
    typedMockedGetUserInfo.mockReturnValue({ userId: 'u2', telegramId: 't2' })
    typedMockedGetLatestModel.mockResolvedValueOnce(mockUserModel)
    typedMockedGetReferals.mockResolvedValueOnce({
      count: 5,
      level: 2,
      subscriptionType: SubscriptionType.NEUROBASE,
      userData: null,
      isExist: true,
    })
    typedMockedHandleHelpCancel.mockResolvedValueOnce(false)
    ctx = makeMockContext(
      { update_id: 2 },
      { userModel: mockUserModel, targetUserId: 't2' }
    )
    const mockTextMessage: Message.TextMessage = {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private', first_name: 'mock' },
      text: 'mock',
    }
    ctx.reply = jest
      .fn<(...args: any[]) => Promise<Message.TextMessage>>()
      .mockResolvedValue(mockTextMessage)
    ctx.scene.enter = jest
      .fn<(...args: any[]) => Promise<unknown>>()
      .mockResolvedValue(true)
    ctx.scene.leave = jest
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined)
    ctx.wizard.next = jest
      .fn<() => WizardContextWizard<MyContext>>()
      .mockReturnValue({ cursor: 1 } as any)
    ctx.wizard.back = jest
      .fn<() => WizardContextWizard<MyContext>>()
      .mockReturnValue({ cursor: -1 } as any)
    ctx.wizard.cursor = 0

    await wizardMiddleware(ctx, mockNext)

    expect(typedMockedGetLatestModel).toHaveBeenCalledWith('t2')
    expect(typedMockedSendDescRequest).toHaveBeenCalledWith(
      ctx,
      true,
      ModeEnum.NeuroPhoto
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  // --- Тест Шага 1 --- (Примерно)
  it('Шаг 1: генерит изображение и переходит к следующему шагу', async () => {
    const mockUserFrom = {
      id: 1,
      is_bot: false,
      first_name: 'TestUser',
      language_code: 'ru',
    }
    ctx = makeMockContext(
      {
        update_id: 4,
        message: {
          text: 'hello',
          from: mockUserFrom,
          chat: { id: 1, type: 'private', first_name: 'User' },
          date: 0,
          message_id: 1,
        },
      },
      { userModel: mockUserModel, targetUserId: 't4', prompt: 'hello' }
    )
    const mockTextMessage: Message.TextMessage = {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private', first_name: 'mock' },
      text: 'mock',
    }
    ctx.reply = jest
      .fn<(...args: any[]) => Promise<Message.TextMessage>>()
      .mockResolvedValue(mockTextMessage)
    ctx.scene.enter = jest
      .fn<(...args: any[]) => Promise<unknown>>()
      .mockResolvedValue(true)
    ctx.scene.leave = jest
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined)
    ctx.wizard.next = jest
      .fn<() => WizardContextWizard<MyContext>>()
      .mockReturnValue({ cursor: 1 } as any)
    ctx.wizard.back = jest
      .fn<() => WizardContextWizard<MyContext>>()
      .mockReturnValue({ cursor: -1 } as any)
    ctx.wizard.cursor = 1

    typedMockedHandleHelpCancel.mockResolvedValueOnce(false)
    await wizardMiddleware(ctx, mockNext)

    expect(typedMockedGenerateImage).toHaveBeenCalled()
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  // --- Тест Шага 2 --- (Примерно)
  it('Шаг 2: переходит в improvePromptWizard на кнопку улучшить', async () => {
    const improvePromptText = '⬆️ Улучшить промпт'
    const mockUserFrom2 = {
      id: 1,
      is_bot: false,
      first_name: 'TestUser',
      language_code: 'ru',
    }
    ctx = makeMockContext(
      {
        update_id: 5,
        message: {
          text: improvePromptText,
          from: mockUserFrom2,
          chat: { id: 1, type: 'private', first_name: 'User' },
          date: 0,
          message_id: 2,
        },
      },
      { userModel: mockUserModel, targetUserId: 't5' }
    )
    const mockTextMessage: Message.TextMessage = {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private', first_name: 'mock' },
      text: 'mock',
    }
    ctx.reply = jest
      .fn<(...args: any[]) => Promise<Message.TextMessage>>()
      .mockResolvedValue(mockTextMessage)
    ctx.scene.enter = jest
      .fn<(...args: any[]) => Promise<unknown>>()
      .mockResolvedValue(true)
    ctx.scene.leave = jest
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined)
    ctx.wizard.next = jest
      .fn<() => WizardContextWizard<MyContext>>()
      .mockReturnValue({ cursor: 1 } as any)
    ctx.wizard.back = jest
      .fn<() => WizardContextWizard<MyContext>>()
      .mockReturnValue({ cursor: -1 } as any)
    ctx.wizard.cursor = 2

    await wizardMiddleware(ctx, mockNext)
    expect(ctx.scene.enter).toHaveBeenCalledWith('improvePromptWizard')
  })
})
