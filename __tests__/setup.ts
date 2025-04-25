console.log('--- Mocks setup file loaded ---')

// Импортируем vitest и утилиты
import { vi } from 'vitest'
import dotenv from 'dotenv'
import * as nodePath from 'node:path'

try {
  // Загружаем переменные окружения из .env файла
  dotenv.config({ path: nodePath.join(process.cwd(), '.env') })
  console.log('--- Debugging .env loading --- ')
  console.log('[CONFIG] Current Working Directory:', process.cwd())
  console.log('[CONFIG] Attempting to load primary env file from:', nodePath.join(process.cwd(), '.env'))
  console.log('[CONFIG] .env file found and loaded successfully.')
  console.log('[CONFIG] isDev flag set to:', process.env.NODE_ENV === 'development')
  console.log('[CONFIG] NODE_ENV is set to:', process.env.NODE_ENV)
  console.log('--- End Debugging .env loading --- ')
} catch (error) {
  console.error('[CONFIG] Error loading .env file:', error.message)
}

// Устанавливаем переменные окружения для тестов, если они не определены
if (!process.env.ADMIN_IDS) {
  process.env.ADMIN_IDS = '144022504,1254048880,352374518,1852726961'
}
console.log('[CONFIG] Parsed ADMIN_IDS_ARRAY:', process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())))

// Мокаем внешние модули
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('mocked file content'),
}))

vi.mock('node:path', () => ({
  join: vi.fn((...args) => args.join('/')),
  resolve: vi.fn((...args) => args.join('/')),
  dirname: vi.fn(path => path.split('/').slice(0, -1).join('/')),
  basename: vi.fn(path => path.split('/').pop()),
}))

// Мок для telegraf
vi.mock('telegraf', () => {
  // Создаем мок класса Telegraf
  class TelegrafMock {
    use: any;
    launch: any;
    telegram: any;
    start: any;
    command: any;
    action: any;
    hears: any;
    on: any;
    stop: any;

    constructor() {
      this.use = vi.fn().mockReturnThis()
      this.launch = vi.fn().mockResolvedValue(undefined)
      this.telegram = {
        sendMessage: vi.fn().mockResolvedValue({}),
        sendPhoto: vi.fn().mockResolvedValue({}),
        sendDocument: vi.fn().mockResolvedValue({}),
        sendMediaGroup: vi.fn().mockResolvedValue({}),
        setChatMenuButton: vi.fn().mockResolvedValue({}),
        setMyCommands: vi.fn().mockResolvedValue({}),
      }
      this.start = vi.fn().mockReturnThis()
      this.command = vi.fn().mockReturnThis()
      this.action = vi.fn().mockReturnThis()
      this.hears = vi.fn().mockReturnThis()
      this.on = vi.fn().mockReturnThis()
      this.stop = vi.fn().mockResolvedValue(undefined)
    }
  }
  
  // Мок для класса Context
  class ContextMock {
    session: any;
    scene: any;
    reply: any;
    replyWithHTML: any;
    replyWithPhoto: any;
    replyWithMediaGroup: any;
    deleteMessage: any;
    editMessageText: any;
    editMessageReplyMarkup: any;
    from: any;
    chat: any;
    callbackQuery: any;

    constructor() {
      this.session = {}
      this.scene = {
        enter: vi.fn().mockResolvedValue(undefined),
        leave: vi.fn().mockResolvedValue(undefined),
        state: {},
      }
      this.reply = vi.fn().mockResolvedValue({})
      this.replyWithHTML = vi.fn().mockResolvedValue({})
      this.replyWithPhoto = vi.fn().mockResolvedValue({})
      this.replyWithMediaGroup = vi.fn().mockResolvedValue({})
      this.deleteMessage = vi.fn().mockResolvedValue(true)
      this.editMessageText = vi.fn().mockResolvedValue({})
      this.editMessageReplyMarkup = vi.fn().mockResolvedValue({})
      this.from = { id: 123456789, username: 'testuser' }
      this.chat = { id: 123456789, type: 'private' }
      this.callbackQuery = null
    }
  }

  return {
    Telegraf: TelegrafMock,
    Context: ContextMock,
    Markup: {
      inlineKeyboard: vi.fn().mockReturnValue({ reply_markup: { inline_keyboard: [] } }),
      keyboard: vi.fn().mockReturnValue({ reply_markup: { keyboard: [] } }),
      removeKeyboard: vi.fn().mockReturnValue({ reply_markup: { remove_keyboard: true } }),
    },
    Scenes: {
      Stage: vi.fn().mockImplementation(() => ({
        register: vi.fn().mockReturnThis(),
        middleware: vi.fn().mockReturnValue(() => {}),
      })),
      BaseScene: vi.fn().mockImplementation((name) => ({
        name,
        enter: vi.fn().mockReturnThis(),
        leave: vi.fn().mockReturnThis(),
        action: vi.fn().mockReturnThis(),
        command: vi.fn().mockReturnThis(),
        hears: vi.fn().mockReturnThis(),
        on: vi.fn().mockReturnThis(),
      })),
    },
    Composer: vi.fn().mockImplementation(() => ({
      use: vi.fn().mockReturnThis(),
      action: vi.fn().mockReturnThis(),
      command: vi.fn().mockReturnThis(),
      hears: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
    })),
    session: vi.fn().mockReturnValue(() => {}),
  }
})

// Мокаем logger, чтобы он не спамил в тестах
vi.mock('@/utils/logger', () => {
  return {
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    securityLogger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    logSecurityEvent: vi.fn(),
  }
}) 