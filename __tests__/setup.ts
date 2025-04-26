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
  console.log(
    '[CONFIG] Attempting to load primary env file from:',
    nodePath.join(process.cwd(), '.env')
  )
  console.log('[CONFIG] .env file found and loaded successfully.')
  console.log(
    '[CONFIG] isDev flag set to:',
    process.env.NODE_ENV === 'development'
  )
  console.log('[CONFIG] NODE_ENV is set to:', process.env.NODE_ENV)
  console.log('--- End Debugging .env loading --- ')
} catch (error) {
  console.error('[CONFIG] Error loading .env file:', error.message)
}

// Устанавливаем переменные окружения для тестов, если они не определены
if (!process.env.ADMIN_IDS) {
  process.env.ADMIN_IDS = '144022504,1254048880,352374518,1852726961'
}
console.log(
  '[CONFIG] Parsed ADMIN_IDS_ARRAY:',
  process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim()))
)

// Мокаем внешние модули
// Исправленный мок для node:fs с использованием importOriginal
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal() // Импортируем оригинальный модуль
  return {
    ...(actual as object), // Распространяем все экспорты оригинала
    // Переопределяем только нужные функции моками
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('mocked file content'),
    // Добавляем моки для асинхронных версий, если они используются где-то еще
    promises: {
      ...(actual as any).promises, // Сохраняем оригинальные промисы, если есть
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue('mocked file content'),
      unlink: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined), // Добавляем мок для rm
    },
  }
})

// Мок для node:path (исправлено для включения default export)
vi.mock('node:path', async importOriginal => {
  try {
    const actual = await importOriginal()
    return {
      ...(actual as any), // Включаем все оригинальные экспорты (включая default)
      // Переопределяем нужные функции моками
      join: vi.fn((...args) => args.join('/')),
      resolve: vi.fn((...args) => args.join('/')),
      dirname: vi.fn(path => path.split('/').slice(0, -1).join('/')),
      basename: vi.fn(path => path.split('/').pop()),
    }
  } catch (e) {
    // Fallback, если importOriginal не сработает (маловероятно для встроенных модулей)
    console.error('Failed to mock node:path', e)
    return {}
  }
})

// Мок для @telegraf/types (добавлено)
vi.mock('@telegraf/types', async importOriginal => {
  // Пытаемся импортировать настоящий модуль для получения типов, если это возможно
  // или используем наш мок файл как fallback
  try {
    // Пытаемся вернуть оригинальный модуль, если он существует
    const originalModule = await importOriginal()
    // Убеждаемся, что возвращаем объект
    return typeof originalModule === 'object' && originalModule !== null
      ? originalModule
      : { default: originalModule }
  } catch (e) {
    // Если оригинальный модуль не найден (как в нашем случае в тестах),
    // используем наш файл с моками
    // Важно: Vitest может автоматически мокать экспорт по умолчанию,
    // поэтому возвращаем объект со всеми именованными экспортами из нашего мока.
    // Если typegram.mock.ts экспортирует интерфейсы, они будут доступны.
    console.log('--- Mocking @telegraf/types with mock file ---') // Log for debugging
    return await vi.importActual('../__tests__/mocks/typegram.mock.ts') // Используем '../' т.к. setup.ts в __tests__
  }
})

// Мок для telegraf
vi.mock('telegraf', () => {
  // --- Определяем классы сцен прямо здесь ---
  class BaseSceneMock {
    id: string
    options: any
    constructor(id: string, options: any = {}) {
      this.id = id
      this.options = options
    }
    enter = vi.fn().mockReturnThis()
    leave = vi.fn().mockReturnThis()
    hears = vi.fn().mockReturnThis()
    action = vi.fn().mockReturnThis()
    on = vi.fn().mockReturnThis()
    command = vi.fn().mockReturnThis()
    use = vi.fn().mockReturnThis()
  }

  class WizardSceneMock extends BaseSceneMock {
    steps: any[]
    constructor(id: string, ...steps: any[]) {
      super(id)
      this.steps = steps
    }
    middleware() {
      return this.steps
    }
  }
  // --- Конец определения классов сцен ---

  // Создаем мок класса Telegraf
  class TelegrafMock {
    use: any
    launch: any
    telegram: any
    start: any
    command: any
    action: any
    hears: any
    on: any
    stop: any

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
    session: any
    scene: any
    reply: any
    replyWithHTML: any
    replyWithPhoto: any
    replyWithMediaGroup: any
    deleteMessage: any
    editMessageText: any
    editMessageReplyMarkup: any
    from: any
    chat: any
    callbackQuery: any

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
      inlineKeyboard: vi
        .fn()
        .mockReturnValue({ reply_markup: { inline_keyboard: [] } }),
      keyboard: vi.fn().mockReturnValue({ reply_markup: { keyboard: [] } }),
      removeKeyboard: vi
        .fn()
        .mockReturnValue({ reply_markup: { remove_keyboard: true } }),
    },
    Scenes: {
      Stage: vi.fn().mockImplementation(() => ({
        register: vi.fn().mockReturnThis(),
        middleware: vi.fn().mockReturnValue(() => {}),
        enter: vi.fn(() => (ctx: any) => ctx.scene?.enter()),
        leave: vi.fn(() => (ctx: any) => ctx.scene?.leave()),
      })),
      BaseScene: BaseSceneMock,
      WizardScene: WizardSceneMock,
      SceneContext: vi.fn(),
      SceneContextScene: vi.fn(),
      WizardContext: vi.fn(),
      WizardContextWizard: vi.fn(),
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

// ---- Определяем и экспортируем моки для импорта в тестах ----

// Supabase mocks
export const mockGetUserDetailsSubscription = vi.fn()
export const mockCreateUser = vi.fn()
export const mockGetReferalsCountAndUserData = vi.fn()
export const mockCheckReferralLink = vi.fn() // Добавляем мок для проверки реферальной ссылки

// Utils/Helpers mocks
export const mockGetTranslation = vi.fn()
export const mockIsRussian = vi.fn()
export const mockGetPhotoUrl = vi.fn()

// Menu mocks
export const mockMainMenu = vi.fn() // Мок для функции генерации главного меню

// Bot/API mocks
export const mockCallApi = vi.fn() // Мок для вызова внешнего API
export const mockReply = vi.fn()
export const mockReplyWithPhoto = vi.fn()
export const mockSendMessage = vi.fn()

// Logger mocks (экспортируем отдельные моки для удобства)
export const mockLoggerInfo = vi.fn()
export const mockLoggerWarn = vi.fn()
export const mockLoggerError = vi.fn()

// Мокаем logger, чтобы он НЕ СПАМИЛ в тестах И ЧТОБЫ ИСПОЛЬЗОВАЛИСЬ НАШИ ЭКСПОРТЫ
vi.mock('@/utils/logger', () => {
  return {
    logger: {
      info: mockLoggerInfo, // Используем экспортированный мок
      error: mockLoggerError, // Используем экспортированный мок
      warn: mockLoggerWarn, // Используем экспортированный мок
      debug: vi.fn(), // Оставляем debug как есть или тоже экспортируем, если нужно
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
