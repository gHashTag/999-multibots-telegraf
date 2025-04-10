import { jest } from '@jest/globals'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'

export const mockBotInstance = {
  telegram: {
    sendMessage: jest.fn(),
    sendVideo: jest.fn(),
    sendPhoto: jest.fn(),
    editMessageText: jest.fn(),
    deleteMessage: jest.fn()
  }
}

export const getMockBot = () => {
  return mockBotInstance as unknown as Telegraf<MyContext>
} 