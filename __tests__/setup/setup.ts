import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { supabase } from '../../src/core/supabase'

// Мок для fetch
global.fetch = vi.fn()

// Глобальный мок для supabase
vi.mock('../../src/core/supabase', () => ({
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

// Mock for missing telegraf files
vi.mock('telegraf/typings/scenes', () => ({
  default: {},
}))

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

// Mock for telegraf
vi.mock('telegraf', () => {
  const TelegrafMock = vi.fn().mockImplementation(function (token) {
    this.token = token
    this.use = vi.fn()
    this.start = vi.fn()
    this.help = vi.fn()
    this.on = vi.fn()
    this.hears = vi.fn()
    this.command = vi.fn()
    this.action = vi.fn()
    this.launch = vi.fn()
    this.telegram = {
      sendMessage: vi.fn(),
      sendPhoto: vi.fn(),
      sendVideo: vi.fn(),
      sendAudio: vi.fn(),
      sendDocument: vi.fn(),
      sendAnimation: vi.fn(),
      sendSticker: vi.fn(),
      sendVoice: vi.fn(),
      sendVideoNote: vi.fn(),
      sendMediaGroup: vi.fn(),
      sendLocation: vi.fn(),
      sendVenue: vi.fn(),
      sendContact: vi.fn(),
      sendPoll: vi.fn(),
      sendDice: vi.fn(),
      sendChatAction: vi.fn(),
      getUserProfilePhotos: vi.fn(),
      getFile: vi.fn(),
      kickChatMember: vi.fn(),
      unbanChatMember: vi.fn(),
      restrictChatMember: vi.fn(),
      promoteChatMember: vi.fn(),
      setChatAdministratorCustomTitle: vi.fn(),
      setChatPermissions: vi.fn(),
      exportChatInviteLink: vi.fn(),
      setChatPhoto: vi.fn(),
      deleteChatPhoto: vi.fn(),
      setChatTitle: vi.fn(),
      setChatDescription: vi.fn(),
      pinChatMessage: vi.fn(),
      unpinChatMessage: vi.fn(),
      unpinAllChatMessages: vi.fn(),
      leaveChat: vi.fn(),
      getChat: vi.fn(),
      getChatAdministrators: vi.fn(),
      getChatMembersCount: vi.fn(),
      getChatMember: vi.fn(),
      setChatStickerSet: vi.fn(),
      deleteChatStickerSet: vi.fn(),
      answerCallbackQuery: vi.fn(),
      editMessageText: vi.fn(),
      editMessageCaption: vi.fn(),
      editMessageMedia: vi.fn(),
      editMessageReplyMarkup: vi.fn(),
      stopPoll: vi.fn(),
      deleteMessage: vi.fn(),
      sendInvoice: vi.fn(),
      answerShippingQuery: vi.fn(),
      answerPreCheckoutQuery: vi.fn(),
      setPassportDataErrors: vi.fn(),
      sendGame: vi.fn(),
      setGameScore: vi.fn(),
      getGameHighScores: vi.fn(),
    }
    return this
  })

  return {
    Telegraf: TelegrafMock,
    Markup: {
      keyboard: vi.fn().mockReturnThis(),
      inlineKeyboard: vi.fn().mockReturnThis(),
      button: vi.fn().mockReturnThis(),
      callbackButton: vi.fn().mockReturnThis(),
      urlButton: vi.fn().mockReturnThis(),
      removeKeyboard: vi.fn().mockReturnThis(),
      resize: vi.fn().mockReturnThis(),
      extra: vi.fn().mockReturnThis(),
      oneTime: vi.fn().mockReturnThis(),
      selective: vi.fn().mockReturnThis(),
    },
    Scenes: {
      BaseScene: vi.fn(function (sceneId) {
        this.id = sceneId
        this.enter = vi.fn()
        this.leave = vi.fn()
        this.use = vi.fn()
        this.start = vi.fn()
        this.help = vi.fn()
        this.on = vi.fn()
        this.hears = vi.fn()
        this.command = vi.fn()
        this.action = vi.fn()
        return this
      }),
      Stage: vi.fn(function (scenes, options) {
        this.scenes = scenes
        this.options = options
        this.register = vi.fn()
        this.middleware = vi.fn()
        return this
      }),
    },
    Composer: vi.fn(function () {
      this.use = vi.fn()
      this.start = vi.fn()
      this.help = vi.fn()
      this.on = vi.fn()
      this.hears = vi.fn()
      this.command = vi.fn()
      this.action = vi.fn()
      return this
    }),
    Context: vi.fn(function () {
      this.reply = vi.fn()
      this.replyWithHTML = vi.fn()
      this.replyWithMarkdown = vi.fn()
      this.replyWithPhoto = vi.fn()
      this.replyWithVideo = vi.fn()
      this.replyWithAudio = vi.fn()
      this.replyWithDocument = vi.fn()
      this.replyWithAnimation = vi.fn()
      this.replyWithSticker = vi.fn()
      this.replyWithVoice = vi.fn()
      this.replyWithVideoNote = vi.fn()
      this.replyWithMediaGroup = vi.fn()
      this.replyWithLocation = vi.fn()
      this.replyWithVenue = vi.fn()
      this.replyWithContact = vi.fn()
      this.replyWithPoll = vi.fn()
      this.replyWithDice = vi.fn()
      this.replyWithChatAction = vi.fn()
      this.editMessageText = vi.fn()
      this.editMessageCaption = vi.fn()
      this.editMessageMedia = vi.fn()
      this.editMessageReplyMarkup = vi.fn()
      this.deleteMessage = vi.fn()
      this.pinChatMessage = vi.fn()
      this.unpinChatMessage = vi.fn()
      this.leaveChat = vi.fn()
      this.getChat = vi.fn()
      this.getChatAdministrators = vi.fn()
      this.getChatMembersCount = vi.fn()
      this.getChatMember = vi.fn()
      this.setChatStickerSet = vi.fn()
      this.deleteChatStickerSet = vi.fn()
      this.answerCallbackQuery = vi.fn()
      this.answerInlineQuery = vi.fn()
      this.scene = {
        enter: vi.fn(),
        leave: vi.fn(),
        reenter: vi.fn(),
      }
      this.wizard = {
        next: vi.fn(),
        back: vi.fn(),
        selectStep: vi.fn(),
      }
      return this
    }),
  }
})

// Mock for node-telegram-bot-api which might be used internally by telegraf
vi.mock('node-telegram-bot-api', () => ({
  default: class {},
}))

// Mock for core modules that might be imported but missing
vi.mock('@/core/supabase/getUserDetailsSubscription', () => ({
  getUserDetailsSubscription: vi.fn(),
}))

vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: vi.fn(),
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

// Создаем глобальный мок для Telegraf
vi.mock('telegraf', async () => {
  const actual = await vi.importActual('telegraf');
  return {
    ...actual,
    Markup: {
      keyboard: (...args: any[]) => ({
        resize: () => ({ oneTime: () => ({ extra: 'mocked-markup' }) }),
      }),
      inlineKeyboard: (...args: any[]) => ({ extra: 'mocked-inline-markup' }),
      removeKeyboard: () => ({ extra: 'mocked-remove-keyboard' }),
    },
    Input: {
      text: () => 'mocked-text-input',
      location: () => 'mocked-location-input',
      photo: () => 'mocked-photo-input',
      video: () => 'mocked-video-input',
      videoNote: () => 'mocked-videoNote-input',
      document: () => 'mocked-document-input',
    },
    deunionize: (ctx: any) => ctx,
  };
}); 