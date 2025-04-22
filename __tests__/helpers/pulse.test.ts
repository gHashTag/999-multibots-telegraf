import makeMockContext from '../utils/mockTelegrafContext'
import { pulse } from '@/helpers/pulse'
import { MyContext } from '@/interfaces'
import { Message } from 'telegraf/types'

describe('pulse', () => {
  let ctx: MyContext
  let logError: jest.SpyInstance
  const prompt = 'test prompt'
  const command = 'CMD'
  const base64Image =
    'data:image/png;base64,' + Buffer.from('IMG').toString('base64')

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    const mockPhotoMessage: Message.PhotoMessage = {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private', first_name: 'Mock' },
      photo: [{ file_id: 'f1', file_unique_id: 'u1', width: 10, height: 10 }],
    }
    const mockTextMessage: Message.TextMessage = {
      message_id: 2,
      date: 0,
      chat: { id: 1, type: 'private', first_name: 'Mock' },
      text: 'mock',
    }
    ctx.telegram.sendPhoto = jest.fn().mockResolvedValue(mockPhotoMessage)
    ctx.telegram.sendMessage = jest.fn().mockResolvedValue(mockTextMessage)
    logError = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('does nothing in development mode', async () => {
    process.env.NODE_ENV = 'development'
    const telegram_id = ctx.from.id.toString()
    const username = ctx.from.username
    const is_ru = ctx.from.language_code === 'ru'
    const bot_name = ctx.botInfo.username
    await pulse(
      base64Image,
      prompt,
      command,
      telegram_id,
      username,
      is_ru,
      bot_name
    )
    expect(ctx.telegram.sendPhoto).not.toHaveBeenCalled()
    expect(ctx.telegram.sendMessage).not.toHaveBeenCalled()
  })

  it('sends photo for valid image in production mode', async () => {
    process.env.NODE_ENV = 'production'
    const telegram_id = ctx.from.id.toString()
    const username = ctx.from.username
    const is_ru = ctx.from.language_code === 'ru'
    const bot_name = ctx.botInfo.username
    await pulse(
      base64Image,
      prompt,
      command,
      telegram_id,
      username,
      is_ru,
      bot_name
    )
    const chatId = '-4166575919'
    expect(ctx.telegram.sendPhoto).toHaveBeenCalledTimes(1)
    const [sentChatId, photo, opts] = (ctx.telegram.sendPhoto as jest.Mock).mock
      .calls[0]
    expect(sentChatId).toBe(chatId)
    expect(photo).toHaveProperty('source')
    expect(opts).toHaveProperty('caption')
    expect(opts.caption).toContain('test prompt')
    expect(opts.caption).toContain('Команда: CMD')
  })

  it('sends message for null image in production mode', async () => {
    process.env.NODE_ENV = 'production'
    const telegram_id = ctx.from.id.toString()
    const username = ctx.from.username
    const is_ru = ctx.from.language_code === 'ru'
    const bot_name = ctx.botInfo.username
    await pulse(null, prompt, command, telegram_id, username, is_ru, bot_name)
    const chatId = '-4166575919'
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('использовал команду: CMD')
    )
  })

  it('retries sending photo on migrate_to_chat_id error', async () => {
    process.env.NODE_ENV = 'production'
    const error: any = {
      response: { parameters: { migrate_to_chat_id: 'newChat' } },
    }
    let call = 0
    ctx.telegram.sendPhoto = jest.fn().mockImplementation(async () => {
      if (call++ === 0) throw error
      const mockPhotoMessageRetry: Message.PhotoMessage = {
        message_id: 3,
        date: 0,
        chat: { id: 1, type: 'private', first_name: 'Mock' },
        photo: [{ file_id: 'f2', file_unique_id: 'u2', width: 10, height: 10 }],
      }
      return mockPhotoMessageRetry
    })
    const telegram_id = ctx.from.id.toString()
    const username = ctx.from.username
    const is_ru = ctx.from.language_code === 'ru'
    const bot_name = ctx.botInfo.username
    await pulse(
      base64Image,
      prompt,
      command,
      telegram_id,
      username,
      is_ru,
      bot_name
    )
    expect(ctx.telegram.sendPhoto).toHaveBeenCalledTimes(2)
  })

  it('throws error when send without migrate_to_chat_id fails', async () => {
    process.env.NODE_ENV = 'production'
    const err = new Error('sendfail')
    ctx.telegram.sendMessage = jest.fn().mockRejectedValue(err)
    const telegram_id = ctx.from.id.toString()
    const username = ctx.from.username
    const is_ru = ctx.from.language_code === 'ru'
    const bot_name = ctx.botInfo.username
    await pulse(null, prompt, command, telegram_id, username, is_ru, bot_name)
    expect(logError).toHaveBeenCalled()
  })
})
