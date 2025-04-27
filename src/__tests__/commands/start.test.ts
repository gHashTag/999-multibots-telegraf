import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf } from 'telegraf'
import type { Context } from 'telegraf'
import { SceneContext } from 'telegraf/typings/scenes'
import type { MyContext } from '@/interfaces/telegram-bot.interface'
import { createMockContext } from '../helpers/context'
import { registerCommands } from '@/registerCommands'
// Импортируем нужные значения
import { ModeEnum } from '@/interfaces/context.interface'
import { defaultSession } from '@/store' // Исправленный путь
import { type User } from '@supabase/supabase-js'
import { processStartCommand } from '@/commands/start.command'

// Мокируем зависимости (startMenu больше не нужен)
// vi.mock('@/menu/startMenu', () => ({ startMenu: vi.fn() }));

// Мокируем зависимости
vi.mock('@/utils/logger')

describe('Command: /start (within registerCommands)', () => {
  let bot: Telegraf<MyContext>
  let mockContext: MyContext
  let commandHandler: (ctx: MyContext) => Promise<void>

  beforeEach(() => {
    // Создаем новый экземпляр бота для изоляции
    bot = new Telegraf<MyContext>('fake-token')

    // Мокируем регистрацию команд, чтобы получить обработчик
    const mockBot = {
      ...bot,
      command: vi.fn((commandName, handler) => {
        if (commandName === 'start') {
          commandHandler = handler as (ctx: MyContext) => Promise<void>
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
    mockContext = createMockContext({
      // Начальное состояние сессии не так важно, т.к. оно сбрасывается
      session: { someInitialData: 'test' },
      scene: {
        enter: vi.fn(),
        leave: vi.fn(),
        reenter: vi.fn(),
        // state: {}
      },
    })

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
