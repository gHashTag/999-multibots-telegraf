import { expect, afterEach, beforeAll, afterAll, vi } from 'vitest'
import { configDotenv } from 'dotenv'
import * as nodePath from 'node:path'

// Загрузка переменных окружения из .env.test если существует, иначе из .env
configDotenv({ path: '.env.test' })

console.log('--- Mocks setup file loaded ---')

// ВАЖНО: Моки для отсутствующих модулей Telegraf
// @ts-ignore - игнорируем ошибки типов для виртуальных моков
vi.mock('./scenes/index.js', () => ({}), { virtual: true })
// @ts-ignore
vi.mock('telegraf/typings/scenes/index.js', () => ({}), { virtual: true })
// @ts-ignore
vi.mock('telegraf/scenes/index.js', () => ({}), { virtual: true })
// @ts-ignore
vi.mock('telegraf/lib/scenes/index.js', () => ({}), { virtual: true })
// @ts-ignore
vi.mock('telegraf/scenes', () => ({}), { virtual: true })
// @ts-ignore
vi.mock('telegraf/typings/scenes', () => ({}), { virtual: true })
// @ts-ignore
vi.mock('telegraf/lib/scenes', () => ({}), { virtual: true })

// Автоматическая очистка моков после каждого теста
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

// Установка фиктивного времени для всех тестов, чтобы гарантировать детерминированные результаты
// Устанавливаем фиксированную дату: 1 января 2023, 12:00:00
const fixedDate = new Date('2023-01-01T12:00:00Z')
beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(fixedDate)
})

// Восстановление реального времени после всех тестов
afterAll(() => {
  vi.useRealTimers()
})

// Скрываем предупреждения от консоли во время тестов
console.warn = vi.fn()
console.error = vi.fn()

// Расширенные матчеры для expect
expect.extend({
  toBeTypeOf(received, expected) {
    const receivedType = typeof received
    const pass = receivedType === expected

    return {
      pass,
      message: () =>
        `expected ${received} to be of type ${expected} but got ${receivedType}`,
    }
  },
})

// Устанавливаем переменные окружения для тестов, если они не определены
if (!process.env.ADMIN_IDS) {
  process.env.ADMIN_IDS = '144022504,1254048880,352374518,1852726961'
}
console.log(
  '[CONFIG] Parsed ADMIN_IDS_ARRAY:',
  process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim()))
)

// Мокаем внешние модули
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('mocked file content'),
  }
})

vi.mock('node:path', async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    join: vi.fn((...args) => args.join('/')),
    resolve: vi.fn((...args) => args.join('/')),
    dirname: vi.fn(path => path.split('/').slice(0, -1).join('/')),
    basename: vi.fn(path => path.split('/').pop()),
  }
})

// Mocks для telegraf
vi.mock('telegraf', async () => {
  const actual = await vi.importActual('telegraf')

  // Создаем мок для Markup
  const MockMarkup = {
    keyboard: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    oneTime: vi.fn().mockReturnThis(),
    removeKeyboard: vi.fn().mockReturnThis(),
    inlineKeyboard: vi.fn().mockReturnThis(),
    forceReply: vi.fn().mockReturnThis(),
    selective: vi.fn().mockReturnThis(),
  }

  return {
    ...actual,
    Markup: MockMarkup,
    Scenes: {
      BaseScene: vi.fn().mockImplementation(() => {
        return {
          enter: vi.fn(),
          leave: vi.fn(),
          action: vi.fn(),
          hears: vi.fn(),
          command: vi.fn(),
          on: vi.fn(),
        }
      }),
      Stage: vi.fn().mockImplementation(() => {
        return {
          register: vi.fn(),
          middleware: vi.fn(),
        }
      }),
      SceneContextScene: vi.fn().mockImplementation(() => {
        return {
          enter: vi.fn(),
          leave: vi.fn(),
        }
      }),
    },
    Context: vi.fn().mockImplementation(() => {
      return {
        reply: vi.fn(),
        replyWithMarkdown: vi.fn(),
        editMessageText: vi.fn(),
        editMessageReplyMarkup: vi.fn(),
        answerCbQuery: vi.fn(),
        scene: {
          enter: vi.fn(),
          leave: vi.fn(),
          reenter: vi.fn(),
        },
        from: {
          id: '123456789',
          username: 'testuser',
        },
      }
    }),
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

// Мок для supabase
vi.mock('@/core/supabase', () => {
  return {
    supabase: {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      rpc: vi.fn().mockReturnThis(),
      data: null,
      error: null,
    },
  }
})

// Мок для функций суперабазы
vi.mock('@/core/supabase/getUserDetailsSubscription', () => {
  return {
    getUserDetailsSubscription: vi.fn(),
  }
})

vi.mock('@/core/supabase/getUserBalance', () => {
  return {
    getUserBalance: vi.fn(),
    invalidateBalanceCache: vi.fn(),
  }
})
