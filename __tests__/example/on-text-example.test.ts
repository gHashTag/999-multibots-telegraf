import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf, type Context } from 'telegraf'
import { registerExampleOnText } from './on-text-example'
import type { Update, Message, User } from '@telegraf/types'

describe('Example: On Text Reply', () => {
  let bot: Telegraf<Context>
  let mockContext: Context

  const mockBotInfo: User = {
    id: 1,
    is_bot: true,
    first_name: 'TestBot',
    username: 'test_bot',
  }

  beforeEach(() => {
    bot = new Telegraf<Context>('fake-token-on-text-example')

    vi.spyOn(bot.telegram, 'callApi').mockImplementation(async method => {
      if (method === 'getMe') {
        return mockBotInfo
      }
      console.warn(`Unhandled API call in mock: ${method}`)
      return {}
    })

    registerExampleOnText(bot)

    mockContext = {
      update: {
        update_id: 3,
        message: {
          /* ... message details ... */
        },
      } as Update.MessageUpdate,
      telegram: bot.telegram,
      botInfo: mockBotInfo,
      message: {
        message_id: 400,
        date: Date.now(),
        chat: { id: 67890, type: 'private' },
        text: 'some random text',
      } as Message.TextMessage,
      reply: vi.fn(),
      state: {},
    } as Context

    mockContext.update = {
      update_id: 3,
      message: mockContext.message,
    } as Update.MessageUpdate

    vi.clearAllMocks()(
      mockContext.reply as ReturnType<typeof vi.fn>
    ).mockClear()
    vi.spyOn(bot.telegram, 'callApi').mockClear()
  })

  it('should call ctx.reply with "Text received" when bot handles a text message update', async () => {
    await bot.handleUpdate(mockContext.update)

    expect(mockContext.reply).toHaveBeenCalledTimes(1)
    expect(mockContext.reply).toHaveBeenCalledWith('Text received')
  })
})
