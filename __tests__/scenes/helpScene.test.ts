import { Composer } from 'telegraf' // Импорт Composer
import { Markup } from 'telegraf'
import { ReplyKeyboardMarkup } from 'telegraf/markup/reply_keyboard_markup' // Import specific keyboard type if needed
import { jest, describe, it, expect, beforeEach } from '@jest/globals' // Импорт Jest

// Мокаем внешние зависимости
jest.mock('@/scenes/levelQuestWizard/handlers', () => ({
  handleLevel1: jest.fn(),
  handleLevel2: jest.fn(),
  handleLevel3: jest.fn(),
  handleLevel4: jest.fn(),
  handleLevel5: jest.fn(),
  handleLevel6: jest.fn(),
  handleLevel7: jest.fn(),
  handleLevel8: jest.fn(),
  handleLevel9: jest.fn(),
  handleLevel10: jest.fn(),
  handleLevel11: jest.fn(),
  handleLevel12: jest.fn(),
  handleLevel13: jest.fn(),
}))
jest.mock('@/menu', () => ({
  mainMenu: jest
    .fn<
      () => Promise<{
        text: string
        reply_markup: ReturnType<typeof Markup.keyboard>
      }>
    >()
    .mockResolvedValue({
      text: 'Help EN',
      reply_markup: Markup.keyboard([['EN']]),
    }),
}))
jest.mock('@/helpers', () => ({ isRussian: jest.fn() }))
jest.mock('@/core/supabase', () => ({ getReferalsCountAndUserData: jest.fn() }))

// import { helpSceneEnterHandler } from '@/scenes/helpScene' // Закомментировано, т.к. нет такого экспорта
import { helpScene } from '../../src/scenes/helpScene'
import makeMockContext from '../utils/mockTelegrafContext'
import { handleLevel1 } from '../../src/scenes/levelQuestWizard/handlers'
import { mainMenu } from '../../src/menu'
import { isRussian } from '../../src/helpers'
import { getReferalsCountAndUserData } from '../../src/core/supabase'
import { MyContext, ModeEnum, MySession } from '../../src/interfaces'
import { Message } from 'telegraf/types' // Import Message type

describe('HelpScene', () => {
  let ctx: MyContext

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext({ update_id: 1 })
    const mockTextMessage: Message.TextMessage = {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private', first_name: 'mock' },
      text: 'mock',
    }
    ctx.reply = jest
      .fn<(...args: any[]) => Promise<Message.TextMessage>>()
      .mockResolvedValue(mockTextMessage)
  })

  it('should send help message in Russian', async () => {
    const ruSession: Partial<MySession> = { mode: ModeEnum.MainMenu }
    ctx = makeMockContext(
      {
        update_id: 1,
        message: {
          from: {
            id: 42,
            language_code: 'ru',
            is_bot: false,
            first_name: 'Test',
          },
          chat: { id: 42, type: 'private', first_name: 'Test' },
          date: 0,
          message_id: 1,
        },
      },
      ruSession
    )
    const mockTextMessage: Message.TextMessage = {
      message_id: 1,
      date: 0,
      chat: { id: 42, type: 'private', first_name: 'mock' },
      text: 'mock',
    }
    ctx.reply = jest
      .fn<(...args: any[]) => Promise<Message.TextMessage>>()
      .mockResolvedValue(mockTextMessage)(isRussian as jest.Mock)
      .mockReturnValue(true)
    const mockedMainMenu = mainMenu as jest.Mock
    mockedMainMenu.mockResolvedValueOnce({
      text: 'Помощь RU',
      reply_markup: Markup.keyboard([['RU']]),
    })

    await helpScene.enter(ctx as any)

    expect(ctx.reply).toHaveBeenCalledWith(
      'Помощь RU',
      Markup.keyboard([['RU']])
    )
  })

  it('should send help message in English', async () => {
    const enSession: Partial<MySession> = { mode: ModeEnum.DigitalAvatarBodyV2 }
    ctx = makeMockContext(
      {
        update_id: 2,
        message: {
          from: {
            id: 43,
            language_code: 'en',
            is_bot: false,
            first_name: 'Test',
          },
          chat: { id: 43, type: 'private', first_name: 'Test' },
          date: 0,
          message_id: 2,
        },
      },
      enSession
    )
    const mockTextMessage: Message.TextMessage = {
      message_id: 2,
      date: 0,
      chat: { id: 43, type: 'private', first_name: 'mock' },
      text: 'mock',
    }
    ctx.reply = jest
      .fn<(...args: any[]) => Promise<Message.TextMessage>>()
      .mockResolvedValue(mockTextMessage)(isRussian as jest.Mock)
      .mockReturnValue(false)
    const mockedMainMenu = mainMenu as jest.Mock
    mockedMainMenu.mockResolvedValueOnce({
      text: 'Help EN',
      reply_markup: Markup.keyboard([['EN']]),
    })

    await helpScene.enter(ctx as any)

    expect(ctx.reply).toHaveBeenCalledWith('Help EN', Markup.keyboard([['EN']]))
  })

  it('should handle error during message sending', async () => {
    const errSession: Partial<MySession> = { mode: ModeEnum.Help }
    ctx = makeMockContext(
      {
        update_id: 3,
        message: {
          from: {
            id: 44,
            language_code: 'en',
            is_bot: false,
            first_name: 'Test',
          },
          chat: { id: 44, type: 'private', first_name: 'Test' },
          date: 0,
          message_id: 3,
        },
      },
      errSession
    )
    const mockTextMessage: Message.TextMessage = {
      message_id: 3,
      date: 0,
      chat: { id: 44, type: 'private', first_name: 'mock' },
      text: 'mock',
    }
    ctx.reply = jest
      .fn<(...args: any[]) => Promise<Message.TextMessage>>()
      .mockResolvedValue(mockTextMessage)(isRussian as jest.Mock)
      .mockReturnValue(false)
    const error = new Error('Send failed')(
      ctx.reply as jest.Mock
    ).mockRejectedValueOnce(error)

    await expect(helpScene.enter(ctx as any)).rejects.toThrow(error)
  })

  it('should handle different modes correctly (RU) and set mode to MainMenu', async () => {
    const modeSession: Partial<MySession> = {
      mode: ModeEnum.DigitalAvatarBodyV2,
    }
    ctx = makeMockContext(
      {
        update_id: 4,
        message: {
          from: {
            id: 45,
            language_code: 'ru',
            is_bot: false,
            first_name: 'Test',
          },
          chat: { id: 45, type: 'private', first_name: 'Test' },
          date: 0,
          message_id: 4,
        },
      },
      modeSession
    )(isRussian as jest.Mock).mockReturnValue(true)

    await helpScene.enter(ctx as any)

    expect(ctx.reply).toHaveBeenCalledWith(
      'Помощь RU',
      Markup.keyboard([['RU']])
    )
  })
})
