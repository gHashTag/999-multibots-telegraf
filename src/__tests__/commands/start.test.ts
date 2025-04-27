import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf } from 'telegraf'
import { Scenes } from 'telegraf'
import type { Context } from 'telegraf'
import type { MyContext } from '@/interfaces/telegram-bot.interface'
import { createMockContext } from '../helpers/context'
import { registerCommands } from '@/registerCommands'
// Импортируем нужные значения
import { ModeEnum } from '@/interfaces/context.interface'
import { defaultSession } from '@/store' // Исправленный путь
import { type User } from '@supabase/supabase-js'
import { processStartCommand } from '@/commands/start.command'
import { startMenu } from '@/menu/startMenu'

// Мокируем зависимости (startMenu больше не нужен)
// vi.mock('@/menu/startMenu', () => ({ startMenu: vi.fn() }));

// Мокируем зависимости
vi.mock('@/utils/logger')

// Определение типа для контекста сцены с использованием Scenes
type MockSceneContext = Scenes.SceneContext<Scenes.SceneSessionData> & {
  wizard: {
    state: any
    cursor: number
    steps: any[]
    selectStep: (index: number) => Promise<void>
  }
}

// Тип для полного контекста, включая сцены
type MockContext = MyContext & { scene: Scenes.SceneContext } // Упрощаем, если не нужен wizard

describe('Command: /start (within registerCommands)', () => {
  let bot: Telegraf<MockContext>
  let mockContext: MockContext
  let commandHandler: (ctx: MockContext) => Promise<void>

  beforeEach(() => {
    // Создаем новый экземпляр бота для изоляции
    bot = new Telegraf<MockContext>('fake-token')

    // Мокируем регистрацию команд, чтобы получить обработчик
    const mockBot = {
      ...bot,
      command: vi.fn((commandName, handler) => {
        if (commandName === 'start') {
          commandHandler = handler as (ctx: MockContext) => Promise<void>
        }
      }),
      // Добавим мок для use, если он используется в registerCommands
      use: vi.fn(),
      hears: vi.fn(),
      action: vi.fn(),
      on: vi.fn(),
      // ...другие методы, если нужны
    }

    // Вызываем функцию регистрации команд
    registerCommands(mockBot as any)

    // Создаем мок контекста со шпионами для scene
    mockContext = {
      from: { id: 123, first_name: 'Test', is_bot: false, language_code: 'en' },
      chat: { id: 456, type: 'private' },
      message: {
        message_id: 1,
        date: Date.now() / 1000,
        text: '/start',
      },
      telegram: {
        sendMessage: vi.fn(),
        sendChatAction: vi.fn(),
      },
      reply: vi.fn(),
      scene: {
        // Мок сцены
        enter: vi.fn(),
        leave: vi.fn(),
        reenter: vi.fn(),
        session: {
          __scenes: {},
        } as Scenes.SceneSessionData, // Используем Scenes.SceneSessionData
        current: undefined,
        ctx: {} as Scenes.SceneContext, // Используем Scenes.SceneContext
      },
      session: defaultSession(), // Используем дефолтную сессию
      i18n: {
        locale: vi.fn(() => 'en'),
        t: vi.fn(key => key), // Простой мок для i18n.t
      },
      botInfo: {
        id: 1,
        is_bot: true,
        first_name: 'TestBot',
        username: 'testbot',
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
      },
      // Добавляем недостающие или опциональные свойства, если они используются в startCommandHandler
      messageId: 1,
      state: {},
    } as unknown as MockContext // Используем as unknown as MockContext для гибкости

    // Очищаем моки перед каждым тестом
    vi.clearAllMocks()
  })

  it('should reset session, leave current scene and enter CreateUserScene', async () => {
    // Проверяем, что обработчик был найден
    expect(commandHandler).toBeDefined()
    if (!commandHandler) return // Для type safety

    // Вызываем обработчик команды /start
    await commandHandler(mockContext)

    // Проверяем, что сессия была сброшена
    // Важно: defaultSession должен быть импортирован и доступен
    expect(mockContext.session).toEqual(defaultSession)

    // Проверяем, что был вызван выход из сцены
    expect(mockContext.scene.leave).toHaveBeenCalledTimes(1)

    // Проверяем, что был вызван вход в сцену CreateUserScene
    expect(mockContext.scene.enter).toHaveBeenCalledTimes(1)
    expect(mockContext.scene.enter).toHaveBeenCalledWith(
      ModeEnum.CreateUserScene
    )

    // Убедимся, что reply не вызывался
    expect(mockContext.reply).not.toHaveBeenCalled()
  })

  // TODO: Добавить другие тесты для start.command, если есть ветвления логики
  // Например, проверка вызова сцены, разные ответы в зависимости от языка и т.д.
})
