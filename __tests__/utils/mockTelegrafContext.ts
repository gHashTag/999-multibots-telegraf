/**
 * Утилита для создания моков контекста Telegraf
 * для тестирования сцен
 */

import { Context, Telegraf } from 'telegraf'
import {
  Update,
  Message,
  User,
  Chat,
  CallbackQuery,
  PreCheckoutQuery,
  InlineQuery,
} from 'telegraf/typings/core/types/typegram'
import { MyContext, MySession } from '../../src/interfaces'

// Тип для дебаг-ответов
type DebugReply = {
  message?: any
  type?: string
  url?: any
  caption?: string
  extra?: any
}

// Добавляем расширение интерфейса для дебага
export interface DebugExtension {
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
 * @param {Object} sessionData - Начальные данные для ctx.session
 * @param {Object} contextExtra - Дополнительные атрибуты для контекста
 * @returns {MyContext & DebugExtension} - Моковый контекст Telegraf
 */
export function makeMockContext(
  update: Partial<Update> & {
    message?: Partial<Message.TextMessage>
    callback_query?: Partial<CallbackQuery>
    inline_query?: Partial<InlineQuery>
    pre_checkout_query?: Partial<PreCheckoutQuery>
  } = {},
  sessionData: Partial<MySession> = {},
  contextExtra: Partial<MyContext> = {}
): MyContext & DebugExtension {
  const mockTelegram = {
    token: 'mock_token',
    callApi: jest.fn((method, data) => Promise.resolve({ ok: true })),
    sendMessage: jest.fn(() => Promise.resolve()),
    sendChatAction: jest.fn(() => Promise.resolve()),
  }

  const debug = {
    currentScene: '',
    replies: [] as DebugReply[],
    replyMessages: () =>
      debug.replies.map(reply => reply.message).filter(Boolean),
  }

  const defaultFrom: User = {
    id: 12345,
    is_bot: false,
    first_name: 'Test',
    username: 'testuser',
    language_code: 'ru',
  }
  const defaultChat: Chat.PrivateChat = {
    id: 12345,
    type: 'private',
    first_name: 'Test',
    username: 'testuser',
  }

  const messageUpdate =
    'message' in update && update.message
      ? ({
          message_id: 1,
          date: Date.now() / 1000,
          chat: update.message.chat ?? defaultChat,
          from: update.message.from ?? defaultFrom,
          text: '',
          ...update.message,
        } as Message.TextMessage)
      : undefined

  const fullUpdate: Update = {
    update_id: update.update_id ?? 1,
    ...(messageUpdate && { message: messageUpdate }),
    ...('callback_query' in update &&
      update.callback_query && {
        callback_query: update.callback_query as CallbackQuery,
      }),
    ...('inline_query' in update &&
      update.inline_query && {
        inline_query: update.inline_query as InlineQuery,
      }),
    ...('pre_checkout_query' in update &&
      update.pre_checkout_query && {
        pre_checkout_query: update.pre_checkout_query as PreCheckoutQuery,
      }),
  }

  let from: User | undefined = undefined
  let chat: Chat | undefined = undefined
  let message: Message.TextMessage | undefined = undefined
  let callbackQuery: CallbackQuery | undefined = undefined

  if ('message' in fullUpdate && fullUpdate.message) {
    message = fullUpdate.message as Message.TextMessage
    from = message.from
    chat = message.chat
  } else if ('callback_query' in fullUpdate && fullUpdate.callback_query) {
    callbackQuery = fullUpdate.callback_query
    from = callbackQuery.from
    if (callbackQuery.message) {
      chat = callbackQuery.message.chat
    }
  }

  from = from ?? defaultFrom
  chat = chat ?? defaultChat

  const ctx = {
    update: fullUpdate,
    from: from,
    chat: chat,
    session: sessionData,
    telegram: mockTelegram,
    wizard: {
      next: jest.fn(),
      back: jest.fn(),
      steps: [],
      cursor: 0,
      state: {},
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
      reenter: jest.fn(() => Promise.resolve()),
      session: { state: {} },
    },
    debug,
    reply: jest.fn((message, extra = undefined) => {
      debug.replies.push({ message, extra })
      return Promise.resolve()
    }) as jest.Mock,
    replyWithPhoto: jest.fn((url: any, extra: any = undefined) => {
      debug.replies.push({
        type: 'photo',
        url,
        caption: extra?.caption || '',
        extra,
      })
      return Promise.resolve()
    }) as jest.Mock,
    replyWithInvoice: jest.fn((invoice: any) => {
      debug.replies.push({ type: 'invoice', message: invoice })
      return Promise.resolve()
    }) as jest.Mock,
    answerCbQuery: jest.fn(() => Promise.resolve()) as jest.Mock,
    answerPreCheckoutQuery: jest.fn(() => Promise.resolve()) as jest.Mock,
    match: jest.fn((pattern: string | RegExp) => {
      let matchResult: RegExpExecArray | string[] | null = null
      if (typeof pattern === 'string') {
        if (message?.text && message.text.includes(pattern)) {
          matchResult = [message.text, pattern]
        }
      } else if (message?.text) {
        matchResult = pattern.exec(message.text)
      }
      ;(ctx as any).match = matchResult
      return undefined
    }),
    message: message,
    callback_query: callbackQuery,
    ...contextExtra,
  } as unknown as MyContext & DebugExtension

  return ctx
}

export default makeMockContext
