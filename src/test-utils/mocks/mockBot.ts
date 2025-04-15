import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import mockApi from '@/test-utils/core/mock'

/**
 * Мок-бот для тестирования
 */
export const mockBot = {
  telegram: {
    sendMessage: mockApi.create(),
    sendPhoto: mockApi.create(),
    sendVideo: mockApi.create(),
    sendDocument: mockApi.create(),
    sendAudio: mockApi.create(),
    answerCallbackQuery: mockApi.create(),
    deleteMessage: mockApi.create(),
    editMessageText: mockApi.create(),
    editMessageReplyMarkup: mockApi.create(),
  },
} as unknown as Telegraf<MyContext>
