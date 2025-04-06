import { Context } from 'telegraf'
import { Update, User, Message } from 'telegraf/typings/core/types/typegram'

interface MockContextParams {
  from?: {
    id: number
    is_bot?: boolean
    first_name?: string
    last_name?: string
    username?: string
  }
  botInfo?: {
    username: string
  }
}

export const createMockContext = (
  params: MockContextParams
): Partial<Context<Update>> => {
  const mockUser: User = {
    id: params.from?.id || 1,
    is_bot: params.from?.is_bot || false,
    first_name: params.from?.first_name || 'Test User',
    last_name: params.from?.last_name,
    username: params.from?.username,
  }

  const mockMessage: Message.TextMessage = {
    message_id: 1,
    date: Math.floor(Date.now() / 1000),
    chat: {
      id: mockUser.id,
      type: 'private',
      first_name: mockUser.first_name,
      last_name: mockUser.last_name,
      username: mockUser.username,
    },
    text: '',
    from: mockUser,
  }

  return {
    from: mockUser,
    botInfo: {
      id: 1,
      is_bot: true,
      first_name: 'Test Bot',
      username: params.botInfo?.username || 'test_bot',
      can_join_groups: true,
      can_read_all_group_messages: true,
      supports_inline_queries: false,
    },
    reply: async (text: string, extra?: any) => mockMessage,
  }
}
