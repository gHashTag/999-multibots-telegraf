import { Telegraf } from 'telegraf'

export const getMockBot = () => {
  const mockBot = {
    telegram: {
      sendMessage: jest.fn().mockResolvedValue(true),
      sendVideo: jest.fn().mockResolvedValue(true),
      sendPhoto: jest.fn().mockResolvedValue(true),
    },
  }
  return mockBot as unknown as Telegraf
}

export const mockBot = getMockBot()
