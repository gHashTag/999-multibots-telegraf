/**
 * Утилита для создания моков контекста Telegraf
 * для тестирования сцен
 */

import { MyContext } from '../../src/interfaces'
import { jest } from '@jest/globals'

// Тип для дебаг-ответов
type DebugReply = {
  message?: any
  type?: string
  url?: any
  caption?: string
  extra?: any
}

// Добавляем расширение интерфейса для дебага
interface DebugExtension {
  debug: {
    currentScene: string
    replies: DebugReply[]
    replyMessages: () => Array<any>
  }
}

/**
 * Создает мок-объект контекста Telegraf для тестирования сцен
 *
 * @param {Object} update - Мок-объект обновления от Telegram
 * @param {Object} contextExtra - Дополнительные атрибуты для контекста
 * @returns {MyContext & DebugExtension} - Моковый контекст Telegraf
 */
export function makeMockContext(
  update = {},
  contextExtra = {}
): MyContext & DebugExtension {
  const mockTelegram = {
    token: 'mock_token',
    callApi: jest.fn((method, data) => {
      console.log(`Вызов Telegram API: ${method}`, data)
      return Promise.resolve({ ok: true })
    }),
  }

  const debug = {
    currentScene: '',
    replies: [] as DebugReply[],
    replyMessages: () =>
      debug.replies.map(reply => reply.message).filter(Boolean),
  }

  const ctx = {
    telegram: mockTelegram,
    session: {
      data: '',
    },
    from: {
      id: 12345,
      language_code: 'ru',
    },
    wizard: {
      next: jest.fn(),
      cursor: 0,
    },
    scene: {
      enter: jest.fn((sceneName: string) => {
        debug.currentScene = sceneName
        return Promise.resolve()
      }),
      leave: jest.fn(() => {
        debug.currentScene = ''
        return Promise.resolve()
      }),
    },
    debug,
    reply: jest.fn((message, extra = undefined) => {
      debug.replies.push({ message, extra })
      return Promise.resolve()
    }),
    replyWithPhoto: jest.fn((url: any, extra: any = undefined) => {
      debug.replies.push({
        type: 'photo',
        url,
        caption: extra?.caption || '',
        extra,
      })
      return Promise.resolve()
    }),
    ...contextExtra,
  } as unknown as MyContext & DebugExtension

  return ctx
}

export default makeMockContext
