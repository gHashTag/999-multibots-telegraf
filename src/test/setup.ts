import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { supabase } from '../core/supabase'
import 'vitest-mock-extended'
// Импортируем тип напрямую
import type { MyContext } from '../interfaces/telegram-bot.interface'
// import type { Middleware } from 'telegraf/typings/composer'
import type { MySession } from '../interfaces/telegram-bot.interface'

// Мок для fetch
global.fetch = vi.fn()

// Глобальный мок для supabase
vi.mock('../core/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: null,
            error: null,
          })),
          data: null,
          error: null,
        })),
        data: null,
        error: null,
      })),
      insert: vi.fn(() => ({
        select: vi.fn(),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(),
        })),
      })),
    })),
    rpc: vi.fn(() => ({
      data: null,
      error: null,
    })),
  },
}))

const defaultBotName = 'neuroblogger_bot'

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue('mocked file content'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mocking telegraf
vi.mock('telegraf', async () => {
  // Используем контекст и другие нужные части из оригинального модуля
  const originalModule = await vi.importActual('telegraf')
  
  return {
    ...(originalModule as any),
    // Переопределяем только то, что нам нужно мокнуть
    Markup: {
      keyboard: vi.fn((buttons) => ({
        keyboard: buttons,
        resize_keyboard: true,
        one_time_keyboard: false,
      })),
      inlineKeyboard: vi.fn(rows => ({ inline_keyboard: rows })),
      button: vi.fn((text, data) => ({ text, callback_data: data })),
      callbackButton: vi.fn((text, data) => ({ text, callback_data: data })),
      urlButton: vi.fn((text, url) => ({ text, url })),
      removeKeyboard: vi.fn(() => ({ remove_keyboard: true })),
      resize: vi.fn(obj => {
        if (obj && typeof obj === 'object') {
          return { ...obj, resize_keyboard: true }
        }
        return { resize_keyboard: true }
      }),
      extra: vi.fn(),
      oneTime: vi.fn(obj => {
        if (obj && typeof obj === 'object') {
          return { ...obj, one_time_keyboard: true }
        }
        return { one_time_keyboard: true }
      }),
      selective: vi.fn(obj => {
        if (obj && typeof obj === 'object') {
          return { ...obj, selective: true }
        }
        return { selective: true }
      }),
    },
    Scenes: {
      BaseScene: vi.fn().mockImplementation(function (sceneId: string) {
        this.id = sceneId
        this.enter = vi.fn().mockReturnThis()
        this.leave = vi.fn().mockReturnThis()
        this.use = vi.fn().mockReturnThis()
        this.action = vi.fn().mockReturnThis()
        this.command = vi.fn().mockReturnThis()
        this.hears = vi.fn().mockReturnThis()
        return this
      }),
      Stage: vi.fn().mockImplementation(function (scenes: any[], options: any) {
        this.scenes = scenes
        this.options = options
        this.register = vi.fn().mockReturnThis()
        this.middleware = vi.fn().mockReturnThis()
        this.enter = vi.fn().mockReturnThis()
        this.leave = vi.fn().mockReturnThis()
        return this
      }),
      WizardScene: vi.fn().mockImplementation(function (sceneId: string, ...steps: any[]) {
        this.id = sceneId
        this.steps = steps
        this.enter = vi.fn().mockReturnThis()
        this.leave = vi.fn().mockReturnThis()
        this.use = vi.fn().mockReturnThis()
        this.action = vi.fn().mockReturnThis()
        this.command = vi.fn().mockReturnThis()
        this.hears = vi.fn().mockReturnThis()
        return this
      }),
      session: {
        SceneSession: vi.fn(),
        SceneContext: vi.fn(),
      },
    },
    Context: vi.fn().mockImplementation(function (update: any, telegram: any, options: any) {
      this.update = update
      this.telegram = telegram
      this.options = options
      this.telegram_id = update?.message?.from?.id || update?.callback_query?.from?.id
      this.from = update?.message?.from || update?.callback_query?.from
      this.chat = update?.message?.chat || update?.callback_query?.message?.chat
      this.message = update?.message || update?.callback_query?.message
      
      this.reply = vi.fn().mockResolvedValue({ message_id: 123 })
      this.replyWithHTML = vi.fn().mockResolvedValue({ message_id: 123 })
      this.replyWithPhoto = vi.fn().mockResolvedValue({ message_id: 123 })
      this.replyWithVideo = vi.fn().mockResolvedValue({ message_id: 123 })
      this.replyWithAudio = vi.fn().mockResolvedValue({ message_id: 123 })
      this.replyWithDocument = vi.fn().mockResolvedValue({ message_id: 123 })
      this.replyWithMarkdownV2 = vi.fn().mockResolvedValue({ message_id: 123 })
      this.replyWithSticker = vi.fn().mockResolvedValue({ message_id: 123 })
      this.replyWithVoice = vi.fn().mockResolvedValue({ message_id: 123 })
      this.answerCbQuery = vi.fn().mockResolvedValue(true)
      this.editMessageText = vi.fn().mockResolvedValue({ message_id: 123 })
      this.editMessageCaption = vi.fn().mockResolvedValue({ message_id: 123 })
      this.editMessageReplyMarkup = vi.fn().mockResolvedValue({ message_id: 123 })
      this.scene = {
        enter: vi.fn().mockResolvedValue(true),
        leave: vi.fn().mockResolvedValue(true),
        reenter: vi.fn().mockResolvedValue(true),
      }
      return this
    }),
    session: vi.fn().mockReturnValue((ctx: any, next: Function) => next()),
    Telegraf: vi.fn().mockImplementation(function (token: string) {
      this.token = token
      this.use = vi.fn().mockReturnThis()
      this.start = vi.fn().mockReturnThis()
      this.help = vi.fn().mockReturnThis()
      this.settings = vi.fn().mockReturnThis()
      this.command = vi.fn().mockReturnThis()
      this.hears = vi.fn().mockReturnThis()
      this.action = vi.fn().mockReturnThis()
      this.launch = vi.fn().mockResolvedValue(true)
      this.stop = vi.fn().mockResolvedValue(true)
      this.telegram = {
        setMyCommands: vi.fn().mockResolvedValue(true),
      }
      return this
    }),
  }
})

// Создаем мок для нашего логгера
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Мок для getUserDetailsSubscription
vi.mock('../core/supabase/getUserDetailsSubscription', () => ({
  getUserDetailsSubscription: vi.fn().mockResolvedValue({
    isSubscriptionActive: false,
    subscriptionType: null,
    stars: 0,
    isExist: true,
  }),
}))

// Мок для getUserBalance
vi.mock('../core/supabase/getUserBalance', () => ({
  getUserBalance: vi.fn().mockResolvedValue(0),
  invalidateBalanceCache: vi.fn(),
}))

// Мок для работы с суапейбейс
vi.mock('../core/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      match: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn(),
      data: [],
      error: null,
      count: vi.fn().mockReturnThis(),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}))

// Мок для getBotNameFromContext
vi.mock('../utils/getBotNameFromContext', () => ({
  getBotNameFromContext: vi.fn().mockReturnValue(defaultBotName),
}))

// Мок для работы с переводами
vi.mock('../locales', () => ({
  t: vi.fn((key: string) => {
    // Простая имитация системы переводов, возвращает ключ, если нет заданного перевода
    const translations: Record<string, string> = {
      'menu.welcome': 'Добро пожаловать в меню',
      'menu.buttons.images': 'Изображения',
      'menu.buttons.videos': 'Видео',
      'menu.buttons.voice': 'Голос',
      'menu.buttons.settings': 'Настройки',
      'menu.buttons.help': 'Помощь',
      'menu.buttons.balance': 'Баланс',
      'start.welcome': 'Добро пожаловать!',
      'help.text': 'Справка по боту',
    }
    return translations[key] || key
  }),
  localeMap: {
    ru: 'ru-RU',
    en: 'en-US',
  },
}))

// Настраиваем моки и сбрасываем их перед каждым тестом
beforeAll(() => {
  // Подавляем console.error и console.warn в тестах
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  // Глобальные моки для date, timeouts, и прочих неподконтрольных функций
  vi.useFakeTimers()

  // Устанавливаем постоянную дату для всех тестов
  vi.setSystemTime(new Date('2025-01-01T12:00:00Z'))
})

beforeEach(() => {
  // Сбрасываем мок для fetch перед каждым тестом
  vi.mocked(global.fetch).mockReset()

  // Настраиваем базовый ответ для fetch, который можно переопределить в тестах
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    json: async () => ({}),
    text: async () => '',
    headers: new Headers(),
    status: 200,
    statusText: 'OK',
    clone: () => ({ json: async () => ({}) }) as Response,
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    redirected: false,
    type: 'basic',
    url: '',
  } as Response)

  // Сбрасываем все моки перед каждым тестом
  vi.clearAllMocks()
})

afterEach(() => {
  // Проверяем, что все таймеры были вызваны
  vi.runOnlyPendingTimers()
  vi.clearAllTimers()
})

afterAll(() => {
  // Восстанавливаем реальные функции после всех тестов
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// Устанавливаем Node.js переменные окружения для тестов
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://test-supabase-url.co'
process.env.SUPABASE_KEY = 'test-supabase-key'
process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token'
process.env.BOT_SERVER_HOST = 'localhost'
process.env.PORT = '3000'
process.env.MODE = 'polling'
process.env.API_URL = 'http://localhost:3001'
process.env.BASE_URL = 'http://localhost:3001'

// Добавляем поддержку для работы с Buffer в тестах
globalThis.Buffer = globalThis.Buffer || Buffer

// ВАЖНО: Сначала мокаем все модули Telegraf перед импортами
// Специальный мок для решения проблемы с импортом './scenes/index.js'
vi.mock('./scenes/index.js', () => ({
  default: {},
}))

// Мок для telegraf/typings/core/types/typegram
vi.mock('telegraf/typings/core/types/typegram', () => ({
  default: {},
}))

// Mock for missing telegraf files
vi.mock('telegraf/typings/scenes', () => ({
  default: {},
}))

// Мок для telegraf/typings/scenes/index.js
vi.mock('telegraf/typings/scenes/index.js', () => ({
  default: {},
}))

// Добавляем дополнительные мокинги проблемных модулей для telegraf
vi.mock('telegraf/scenes', () => ({
  default: {},
}))

vi.mock('telegraf/scenes/index.js', () => ({
  default: {},
}))

vi.mock('telegraf/lib/scenes.js', () => ({
  default: {},
}))

vi.mock('telegraf/lib/scenes/index.js', () => ({
  default: {},
}))

// Global mock for Telegraf
vi.mock('telegraf/typings/scenes/context', () => ({}))

// Mock for the sceneIds constant that is being imported in the test
vi.mock('@/constants/scenes', () => ({
  sceneIds: {
    START: 'start',
    MENU: 'menu',
    HELP: 'help',
    BALANCE: 'balance',
    PAYMENT: 'payment',
    STAR_PAYMENT: 'starPayment',
    RUBLE_PAYMENT: 'rublePayment',
    SETTINGS: 'settings',
    REFERRAL: 'referral',
    NEUROBLOGS_WIZARD: 'neuroblogsWizard',
    NEUROBLOGS_PROMPT_WIZARD: 'neuroblogsPromptWizard',
    REFERRAL_WITHDRAWAL: 'referralWithdrawal',
    NEURO_GYM_WIZARD: 'neuroGymWizard',
    NEURO_PHOTO_WIZARD: 'neuroPhotoWizard',
    NEURO_VOICE_WIZARD: 'neuroVoiceWizard',
    IMAGE_TO_VIDEO_WIZARD: 'imageToVideoWizard',
    TEXT_TO_VIDEO_WIZARD: 'textToVideoWizard',
    TEXT_TO_VOICE_WIZARD: 'textToVoiceWizard',
    SUBSCRIPTION_INFO: 'subscriptionInfo',
  },
}))

// Mock for node-telegram-bot-api which might be used internally by telegraf
vi.mock('node-telegram-bot-api', () => ({
  default: class {},
}))

// Suppress console warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {})

// Мокаем глобальные объекты, которые могут потребоваться для тестов
global.Response = vi.fn() as any
global.Request = vi.fn() as any

// Создаем заглушки для консольных методов, чтобы уменьшить вывод при тестировании
console.log = vi.fn()
console.error = vi.fn()
console.warn = vi.fn()
console.info = vi.fn()

// Мокаем переменные окружения для тестов
process.env.VITEST = 'true'

// Настройка глобальных моков и утилит для тестов
// global.vi = vi;

// Настраиваем автоматический сброс моков после каждого теста
beforeEach(() => {
  vi.resetAllMocks();
  vi.clearAllMocks();
});

// Отключаем логирование во время тестов для более чистого вывода
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Мок для axios
vi.mock('axios', () => {
  return {
    default: {
      post: vi.fn().mockResolvedValue({ data: {} }),
      get: vi.fn().mockResolvedValue({ data: {} }),
    },
  }
})

// Мок для логгера
vi.mock('@/utils/logger', () => {
  return {
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  }
})

// Экспортируем вспомогательные функции для тестов

/**
 * Создает базовый мок контекста для тестов сцен Telegram
 */
export function createMockContext(overrides: Partial<MyContext> = {}): MyContext {
  const defaultSession: MySession = {
    index: 0,
    step: 0,
    status: '',
    data: {},
    params: {},
    lastCommand: '',
    __scenes: {
      current: '',
      state: {},
    },
  }

  const defaultContext: MyContext = {
    telegram_id: '123456789',
    from: { id: 123456789, is_bot: false, first_name: 'Test', language_code: 'ru' },
    chat: { id: 123456789, type: 'private', first_name: 'Test' },
    message: {
      message_id: 1,
      date: 1672531200, // 2023-01-01
      chat: { id: 123456789, type: 'private', first_name: 'Test' },
      from: { id: 123456789, is_bot: false, first_name: 'Test', language_code: 'ru' },
      text: 'Test message',
    },
    scene: {
      enter: vi.fn().mockResolvedValue(true),
      leave: vi.fn().mockResolvedValue(true),
      reenter: vi.fn().mockResolvedValue(true),
    },
    session: defaultSession,
    reply: vi.fn().mockResolvedValue({ message_id: 123 }),
    replyWithHTML: vi.fn().mockResolvedValue({ message_id: 123 }),
    replyWithPhoto: vi.fn().mockResolvedValue({ message_id: 123 }),
    replyWithVideo: vi.fn().mockResolvedValue({ message_id: 123 }),
    replyWithAudio: vi.fn().mockResolvedValue({ message_id: 123 }),
    replyWithDocument: vi.fn().mockResolvedValue({ message_id: 123 }),
    replyWithMarkdownV2: vi.fn().mockResolvedValue({ message_id: 123 }),
    replyWithSticker: vi.fn().mockResolvedValue({ message_id: 123 }),
    replyWithVoice: vi.fn().mockResolvedValue({ message_id: 123 }),
    answerCbQuery: vi.fn().mockResolvedValue(true),
    editMessageText: vi.fn().mockResolvedValue({ message_id: 123 }),
    editMessageCaption: vi.fn().mockResolvedValue({ message_id: 123 }),
    editMessageReplyMarkup: vi.fn().mockResolvedValue({ message_id: 123 }),
    ...overrides,
  }

  return defaultContext as MyContext
}

// Определяем тип Middleware для тестов, так как не можем импортировать его из telegraf
type Middleware<T> = (ctx: T, next: () => Promise<void>) => Promise<void>;

/**
 * Создает мок middleware для тестов
 */
export const createMockMiddleware = (): Middleware<MyContext> => {
  return async (ctx, next) => {
    await next()
    return
  }
}

export {}
