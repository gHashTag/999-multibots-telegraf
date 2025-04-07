import { Message } from 'telegraf/typings/core/types/typegram'

export const TelegramMock = {
  sendMessage: async (
    chatId: number | string,
    text: string
  ): Promise<Message> => {
    return {
      message_id: 1,
      date: Date.now(),
      chat: {
        id: Number(chatId),
        type: 'private',
        first_name: 'Test',
        last_name: 'User',
        username: 'test_user',
      },
      text: text,
      from: {
        id: 1,
        is_bot: true,
        first_name: 'Test Bot',
        username: 'test_bot',
      },
    }
  },

  editMessageText: async (
    chatId: number | string,
    messageId: number,
    text: string
  ): Promise<Message> => {
    return {
      message_id: messageId,
      date: Date.now(),
      chat: {
        id: Number(chatId),
        type: 'private',
        first_name: 'Test',
        last_name: 'User',
        username: 'test_user',
      },
      text: text,
      from: {
        id: 1,
        is_bot: true,
        first_name: 'Test Bot',
        username: 'test_bot',
      },
    }
  },

  deleteMessage: async (
    chatId: number | string,
    messageId: number
  ): Promise<boolean> => {
    return true
  },
}
