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
vi.mock('telegraf', async importOriginal => {
  const original = await importOriginal<typeof import('telegraf')>()

  // Максимально упрощенный мок Markup
  const mockMarkup = {
    keyboard: vi.fn(buttons => {
      // Просто возвращаем объект с методом resize
      const keyboardInstance = {
        buttons: buttons,
        resize: vi.fn(() => keyboardInstance), // resize возвращает сам себя
        // Добавим другие методы цепочки, если они точно нужны
        oneTime: vi.fn(() => keyboardInstance),
        selective: vi.fn(() => keyboardInstance),
      }
      return keyboardInstance
    }),
    // ... остальные моки Markup ...
    inlineKeyboard: vi.fn(buttons => ({ buttons })),
    button: {
      callback: vi.fn((text, data) => ({ text, data, type: 'callback' })),
      url: vi.fn((text, url) => ({ text, url, type: 'url' })),
    },
    removeKeyboard: vi.fn(),
    forceReply: vi.fn(),
  }

  const mockBot = vi.fn(() => ({
    use: vi.fn(),
    command: vi.fn(),
    action: vi.fn(),
    on: vi.fn(),
    hears: vi.fn(),
    catch: vi.fn(),
    launch: vi.fn(),
    stop: vi.fn(),
    telegram: {
      sendMessage: vi.fn(),
      // ... другие методы API Telegram
    },
    context: {},
    options: {},
    handleUpdate: vi.fn(),
  }))

  const mockStage = vi.fn(() => ({
    middleware: vi.fn(() => (ctx, next) => next()),
    register: vi.fn(),
  }))

  const mockBaseScene = vi.fn(() => ({
    enter: vi.fn(),
    leave: vi.fn(),
    command: vi.fn(),
    action: vi.fn(),
    on: vi.fn(),
    hears: vi.fn(),
    use: vi.fn(),
    middleware: vi.fn(() => (ctx, next) => next()), // Базовый middleware
  }))

  const mockWizardScene = {
    steps: [],
    enter: vi.fn((...fns) => {
      mockWizardScene.enterHandler = fns[fns.length - 1]
      return mockWizardScene
    }),
    leave: vi.fn((...fns) => {
      mockWizardScene.leaveHandler = fns[fns.length - 1]
      return mockWizardScene
    }),
    action: vi.fn(() => mockWizardScene),
    on: vi.fn(() => mockWizardScene),
    hears: vi.fn(() => mockWizardScene),
    command: vi.fn(() => mockWizardScene),
    use: vi.fn(() => mockWizardScene),
    middleware: vi.fn(() => (ctx, next) => {
      // Простая имитация middleware сцены
      if (ctx.scene && ctx.scene.current === id) {
        // Логика обработки шагов волшебника (если нужно)
      }
      return next()
    }),
    enterHandler: null,
    leaveHandler: null,
  }

  // Добавляем методы-пустышки для других возможных вызовов
  ;[
    'start',
    'enter',
    'leave',
    'command',
    'action',
    'on',
    'hears',
    'use',
  ].forEach(method => {
    if (!mockWizardScene[method]) {
      mockWizardScene[method] = vi.fn(() => mockWizardScene)
    }
  })

  return {
    ...original,
    Telegraf: vi.fn().mockImplementation(() => mockBot),
    Markup: mockMarkup,
    session: vi.fn(),
    Scenes: {
      Stage: vi.fn().mockImplementation(() => mockStage),
      BaseScene: vi.fn().mockImplementation(() => mockBaseScene),
      WizardScene: vi.fn().mockImplementation((id, ...steps) => ({
        ...mockWizardScene,
        id,
        steps,
      })),
    },
    Composer: { compose: vi.fn() },
    Input: original.Input,
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
