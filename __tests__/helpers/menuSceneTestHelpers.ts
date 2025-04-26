import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Markup, Scenes } from 'telegraf'
import type { MyContext } from '../../src/interfaces'
import * as supabaseUtils from '../../src/core/supabase/getUserDetailsSubscription'
import * as referalsUtils from '../../src/core/supabase/getReferalsCountAndUserData'
import { SubscriptionType } from '../../src/interfaces/subscription.interface'
import * as userBalanceUtils from '../../src/core/supabase/getUserBalance'
import type { MockInstance } from 'vitest'
import type { Context, NarrowedContext, Telegraf } from 'telegraf'
import type { Mock } from 'vitest'
import {
  mockGetUserDetailsSubscription,
  mockGetTranslation,
  mockIsRussian,
} from '../mocks/setup'

// Локальное определение типов для замены недоступных импортов
interface Message {
  message_id: number
  text?: string
  from?: {
    id: number
    is_bot: boolean
    first_name: string
    username?: string
  }
  chat: {
    id: number
    first_name?: string
    username?: string
    type: string
  }
  date: number
}

interface Update {
  message?: Message
  callback_query?: {
    id: string
    from: {
      id: number
      is_bot: boolean
      first_name: string
      username?: string
    }
    message?: Message
    data?: string
    chat_instance?: string
  }
}

// Определение недостающего типа
export interface MenuSceneSessionState {
  menuLevel: string
  [key: string]: any
}

/**
 * Мок структура для Markup
 */
export const mockMarkup = {
  reply_markup: {
    inline_keyboard: [
      [{ text: 'Тестовая кнопка', callback_data: 'test_button' }],
    ],
  },
}

/**
 * Мок функция для Markup.inlineKeyboard
 */
export const mockInlineKeyboard = vi.fn().mockImplementation(keyboard => ({
  reply_markup: { inline_keyboard: keyboard },
}))

/**
 * Типы для тестов, имитирующие функции как моки vitest
 */
export type MockFunction = ReturnType<typeof vi.fn>

export type MockWizardContext = {
  scene: {
    enter: MockFunction
    [key: string]: any
  }
  reply: MockFunction
  wizard: {
    next: MockFunction
    selectStep: MockFunction
    [key: string]: any
  }
  state: Record<string, any>
  message: {
    text: string
    chat: { id: number; type: string; first_name: string }
    from: { id: number; is_bot: boolean; first_name: string }
    message_id: number
    date: number
  }
  session: Record<string, any>
  update: Record<string, any>
  telegram: Record<string, any>
  botInfo: Record<string, any>
  [key: string]: any
}

/**
 * Создает и возвращает фиктивные данные о подписке пользователя
 * которые можно настроить для различных тестовых случаев
 */
export const createSubscriptionData = (options = {}) => {
  return {
    isSubscriptionActive: true,
    subscriptionType: SubscriptionType.NEUROTESTER,
    subscriptionStartDate: new Date().toISOString(),
    isExist: true,
    stars: 100,
    level: 1,
    ...options,
  }
}

/**
 * Создает основные моки, используемые во всех тестах menuScene
 */
export function createCommonMocks() {
  // Сбрасываем и настраиваем моки
  mockGetUserDetailsSubscription.mockReset()
  mockGetUserDetailsSubscription.mockResolvedValue({
    isSubscriptionActive: false,
    stars: 0,
    isExist: true,
  })

  mockGetTranslation.mockReset()
  mockGetTranslation.mockImplementation((key, lang) => {
    // Вернем ключ с префиксом языка для простого тестирования
    return `${lang === 'ru' ? 'ru_' : 'en_'}${key}`
  })

  mockIsRussian.mockReset()
  mockIsRussian.mockReturnValue(true)

  return {
    mockGetUserDetailsSubscription,
    mockGetTranslation,
    mockIsRussian,
  }
}

/**
 * Настраивает базовые моки для тестирования menuScene
 */
export function setupBasicMocks() {
  const mocks = createCommonMocks()
  return mocks
}

/**
 * Сбрасывает состояние всех моков перед тестами
 */
export function resetAllMocks() {
  vi.clearAllMocks()
  mockGetUserDetailsSubscription.mockClear()
  mockGetTranslation.mockClear()
  mockIsRussian.mockClear()
}

/**
 * Создает мок-объект контекста Telegraf с необходимыми свойствами
 */
export function createMockContext(
  overrides: Partial<MyContext> = {},
  sessionData: Partial<Scenes.SceneSessionData> = {},
  menuSceneState: Partial<MenuSceneSessionState> = {}
): MyContext {
  // Создаем базовый мок-объект
  const mockSession = {
    menuLevel: '0',
    ...menuSceneState,
  }

  const mockSceneContext = {
    scene: {
      enter: vi.fn(),
      reenter: vi.fn(),
      leave: vi.fn(),
      state: {
        menuLevel: '0',
        ...menuSceneState,
      },
    },
    session: {
      __scenes: {
        state: {
          menuLevel: '0',
          ...menuSceneState,
        },
        ...sessionData,
      },
    },
  }

  const mockMessageContext = {
    from: {
      id: 123456789,
      first_name: 'Test',
      last_name: 'User',
      is_bot: false,
      username: 'testuser',
    },
    message: {
      message_id: 1,
      from: {
        id: 123456789,
        first_name: 'Test',
        last_name: 'User',
        is_bot: false,
        username: 'testuser',
      },
      chat: {
        id: 123456789,
        first_name: 'Test',
        last_name: 'User',
        type: 'private',
        username: 'testuser',
      },
      date: 1234567890,
      text: '',
    },
    chat: {
      id: 123456789,
      first_name: 'Test',
      last_name: 'User',
      type: 'private',
      username: 'testuser',
    },
  }

  const mockTelegrafContext = {
    telegram: {
      sendMessage: vi.fn().mockResolvedValue({}),
      sendPhoto: vi.fn().mockResolvedValue({}),
      answerCallbackQuery: vi.fn().mockResolvedValue(true),
      editMessageText: vi.fn().mockResolvedValue({}),
      editMessageReplyMarkup: vi.fn().mockResolvedValue({}),
      sendChatAction: vi.fn().mockResolvedValue(true),
      getFileLink: vi.fn().mockResolvedValue('https://mock-file-link.com'),
      callApi: vi.fn().mockResolvedValue({}),
    },
    webhookReply: false,
    answerCbQuery: vi.fn().mockResolvedValue(true),
    reply: vi.fn().mockResolvedValue({}),
    getChat: vi.fn().mockResolvedValue({}),
    replyWithPhoto: vi.fn().mockResolvedValue({}),
    replyWithHTML: vi.fn().mockResolvedValue({}),
    deleteMessage: vi.fn().mockResolvedValue(true),
    editMessageText: vi.fn().mockResolvedValue({}),
    editMessageCaption: vi.fn().mockResolvedValue({}),
    editMessageReplyMarkup: vi.fn().mockResolvedValue({}),
    editMessageMedia: vi.fn().mockResolvedValue({}),
    setChatMenuButton: vi.fn().mockResolvedValue(true),
    replyWithChatAction: vi.fn().mockResolvedValue(true),
    sendChatAction: vi.fn().mockResolvedValue(true),
    replyWithMediaGroup: vi.fn().mockResolvedValue([]),
    replyWithDocument: vi.fn().mockResolvedValue({}),
    replyWithAnimation: vi.fn().mockResolvedValue({}),
    replyWithMarkdown: vi.fn().mockResolvedValue({}),
    replyWithSticker: vi.fn().mockResolvedValue({}),
    replyWithAudio: vi.fn().mockResolvedValue({}),
    replyWithVideo: vi.fn().mockResolvedValue({}),
    replyWithVideoNote: vi.fn().mockResolvedValue({}),
    replyWithVoice: vi.fn().mockResolvedValue({}),
    replyWithPoll: vi.fn().mockResolvedValue({}),
    replyWithQuiz: vi.fn().mockResolvedValue({}),
    replyWithLocation: vi.fn().mockResolvedValue({}),
    replyWithVenue: vi.fn().mockResolvedValue({}),
    replyWithContact: vi.fn().mockResolvedValue({}),
    replyWithGame: vi.fn().mockResolvedValue({}),
    replyWithMarkdownV2: vi.fn().mockResolvedValue({}),
    replyWithInvoice: vi.fn().mockResolvedValue({}),
    pinChatMessage: vi.fn().mockResolvedValue(true),
    unpinChatMessage: vi.fn().mockResolvedValue(true),
    unpinAllChatMessages: vi.fn().mockResolvedValue(true),
    leaveChat: vi.fn().mockResolvedValue(true),
    callbackQuery: {
      id: 'mock-callback-id',
      from: {
        id: 123456789,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
      },
      message: {
        message_id: 1,
        from: {
          id: 123456789,
          is_bot: false,
          first_name: 'Telegram Bot',
          username: 'tgbot',
        },
        chat: {
          id: 123456789,
          first_name: 'Test',
          username: 'testuser',
          type: 'private',
        },
        date: 1609459200,
        text: 'Test message',
      },
      chat_instance: 'mock-chat-instance',
      data: '',
    },
  }

  // Объединяем все моки в один контекст
  const ctx = {
    ...mockSceneContext,
    ...mockMessageContext,
    ...mockTelegrafContext,
    ...overrides,
  } as unknown as MyContext

  return ctx
}

// Функция для создания контекста с callback_query
export function createCallbackContext(data: string): MyContext {
  const ctx = createMockContext()
  ctx.update = {
    callback_query: {
      data,
      message: {
        message_id: 1,
      },
    },
  } as any
  return ctx
}

// Функция для создания контекста с текстовым сообщением
export function createTextContext(text: string): MyContext {
  const ctx = createMockContext()
  ctx.update = {
    message: {
      text,
      message_id: 1,
    },
  } as any
  return ctx
}

// Мок для Markup из Telegraf
export const MockMarkup = {
  inlineKeyboard: vi.fn().mockReturnValue({
    resize: vi.fn().mockReturnThis(),
    oneTime: vi.fn().mockReturnThis(),
    extra: vi.fn().mockReturnThis(),
  }),
  keyboard: vi.fn().mockReturnValue({
    resize: vi.fn().mockReturnThis(),
    oneTime: vi.fn().mockReturnThis(),
    extra: vi.fn().mockReturnThis(),
  }),
  removeKeyboard: vi.fn().mockReturnValue({
    resize: vi.fn().mockReturnThis(),
    oneTime: vi.fn().mockReturnThis(),
    extra: vi.fn().mockReturnThis(),
  }),
  forceReply: vi.fn().mockReturnValue({
    resize: vi.fn().mockReturnThis(),
    oneTime: vi.fn().mockReturnThis(),
    extra: vi.fn().mockReturnThis(),
  }),
}
