import mock from '@/test-utils/core/mock'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'

export const mockBotInstance = {
  telegram: {
    sendMessage: mock.create(),
    sendVideo: mock.create(),
    sendPhoto: mock.create(),
    editMessageText: mock.create(),
    deleteMessage: mock.create()
  }
}

export const getMockBot = () => {
  return mockBotInstance as unknown as Telegraf<MyContext>
}
/**
 * Мок-объект телеграм-бота для тестирования Inngest функций
 */
export class MockTelegram {
  token = 'mock-token'
  sentMessages: Array<{
    chatId: string | number
    text: string
    options?: any
  }> = []

  async sendMessage(
    chatId: string | number,
    text: string,
    options?: any
  ): Promise<any> {
    console.log('🤖 Мок-бот отправляет сообщение:', {
      description: 'Mock bot sending message',
      chatId,
      text,
      options,
    })
    this.sentMessages.push({ chatId, text, options })
    return { message_id: Date.now(), chat: { id: chatId }, text }
  }

  async sendPhoto(
    chatId: string | number,
    photo: any,
    options?: any
  ): Promise<any> {
    console.log('🤖 Мок-бот отправляет фото:', {
      description: 'Mock bot sending photo',
      chatId,
      photoType: typeof photo,
      options,
    })
    return { message_id: Date.now(), chat: { id: chatId } }
  }

  async deleteMessage(
    chatId: string | number,
    messageId: number
  ): Promise<boolean> {
    console.log('🤖 Мок-бот удаляет сообщение:', {
      description: 'Mock bot deleting message',
      chatId,
      messageId,
    })
    return true
  }
}

/**
 * Мок-класс Telegraf для тестирования
 */
export class MockTelegraf {
  telegram: MockTelegram

  constructor(token?: string) {
    this.telegram = new MockTelegram()
    if (token) {
      this.telegram.token = token
    }
  }

  // Добавляем методы для имитации API Telegraf
  launch(): Promise<void> {
    console.log('🚀 Мок-бот запущен', { description: 'Mock bot launched' })
    return Promise.resolve()
  }

  stop(): Promise<void> {
    console.log('🛑 Мок-бот остановлен', { description: 'Mock bot stopped' })
    return Promise.resolve()
  }
}

/**
 * Создает мок-бот для тестирования
 */
export function createMockBot(token?: string): MockTelegraf {
  return new MockTelegraf(token)
}
