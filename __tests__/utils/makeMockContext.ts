/**
 * Утилита для создания моков контекста Telegraf
 * для тестирования сцен и обработчиков
 */

import { Context } from 'telegraf'
import {
  Update,
  Message,
  User,
  Chat,
  CallbackQuery,
  PreCheckoutQuery,
  InlineQuery,
} from 'telegraf/types'
import { MyContext, MySession } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'

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
 * Создает базовый мок-контекст Telegraf для тестирования
 */
export function makeMockContext(
  update: Partial<Update> & {
    message?: Partial<Message.TextMessage>
    callback_query?: Partial<CallbackQuery>
    inline_query?: Partial<InlineQuery>
    pre_checkout_query?: Partial<PreCheckoutQuery>
  } = {},
  sessionData: Partial<MySession> = {}
): MyContext & DebugExtension {
  const mockTelegram = {
    token: 'mock_token',
    callApi: jest.fn().mockResolvedValue({ ok: true }),
    sendMessage: jest.fn().mockResolvedValue({}),
    sendChatAction: jest.fn().mockResolvedValue({}),
    getFileLink: jest.fn().mockResolvedValue({ href: 'http://example.com/file' }),
    getFile: jest.fn().mockResolvedValue({ file_id: 'test-file-id', file_path: 'path/to/file', file_size: 1000 }),
  }

  const debug = {
    currentScene: '',
    replies: [] as DebugReply[],
    replyMessages: () =>
      debug.replies.map(reply => reply.message).filter(Boolean),
  }

  const defaultFrom: User = {
    id: 1,
    is_bot: false,
    first_name: 'Test',
    username: 'testuser',
    language_code: 'ru',
  }
  const defaultChat: Chat.PrivateChat = {
    id: 1,
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
          text: 'test message',
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

  // Базовая сессия, необходимая для большинства тестов
  const defaultSession: Partial<MySession> = {
    cursor: 0,
    images: [],
    __scenes: {
      current: '',
      state: { step: 0 },
      cursor: 0
    },
    balance: 500,
    targetUserId: '1',
    subscription: null,
    mode: ModeEnum.MainMenu,
  }

  // Объединяем базовую сессию с переданными данными сессии
  const session = {
    ...defaultSession,
    ...sessionData
  }

  // Создаем mocked context объект
  const ctx = {
    update: fullUpdate,
    from: from,
    chat: chat,
    session: session,
    telegram: mockTelegram,
    scene: {
      enter: jest.fn().mockResolvedValue({}),
      leave: jest.fn().mockResolvedValue({}),
      reenter: jest.fn().mockResolvedValue({}),
      session: { state: { step: 0 } }
    },
    debug,
    reply: jest.fn().mockResolvedValue({}),
    replyWithPhoto: jest.fn().mockResolvedValue({}),
    replyWithInvoice: jest.fn().mockResolvedValue({}),
    answerCbQuery: jest.fn().mockResolvedValue({}),
    answerPreCheckoutQuery: jest.fn().mockResolvedValue({}),
    match: jest.fn(),
    message: message,
    callback_query: callbackQuery,
  } as unknown as MyContext & DebugExtension

  // Добавляем wizard с self-reference на ctx
  const wizardState = { step: 0 };
  const wizard = {
    next: jest.fn(),
    back: jest.fn(),
    cursor: 0,
    steps: [],
    step: jest.fn(),
    selectStep: jest.fn(),
  };
  
  // Создаем свойства через Object.defineProperty для wizard
  Object.defineProperty(wizard, 'ctx', {
    get: () => ctx,
    configurable: true
  });
  
  Object.defineProperty(wizard, 'state', {
    get: () => wizardState,
    set: (val) => Object.assign(wizardState, val),
    configurable: true
  });
  
  // Присваиваем wizard к контексту
  ctx.wizard = wizard as any;

  return ctx
}

/**
 * Создает мок-контекст специально для wizard-сцен
 */
export function makeWizardMockContext(
  update: Partial<Update> = {},
  sessionData: Partial<MySession> = {},
  wizardState: Record<string, any> = { step: 0 }
): MyContext & DebugExtension {
  const ctx = makeMockContext(update, sessionData)
  
  // Обновляем state в wizard через setter
  Object.assign(ctx.wizard.state, wizardState)
  
  return ctx
}

export default makeMockContext
