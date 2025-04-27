import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf } from 'telegraf'
import type { SceneContext, SceneSessionData } from 'telegraf/typings/scenes'
import { registerExampleCommand } from './command-scene-entry-example'

// Определяем тип контекста локально для теста
interface MyExampleContext extends Context {
  scene: SceneContext<SceneSessionData>
}

// Мокируем зависимости (если есть, например, logger)
// vi.mock('@/utils/logger');

describe('Example: Command Scene Entry', () => {
  let bot: Telegraf<MyExampleContext>
  let mockContext: MyExampleContext
  let commandHandler: (ctx: MyExampleContext) => Promise<void>

  beforeEach(() => {
    // Создаем новый экземпляр бота
    bot = new Telegraf<MyExampleContext>('fake-token-example')

    // Используем шпиона для метода command, чтобы захватить обработчик
    const commandSpy = vi.spyOn(bot, 'command')

    // Регистрируем команду
    registerExampleCommand(bot)

    // Находим и сохраняем обработчик для команды 'example'
    const callArgs = commandSpy.mock.calls.find(call => call[0] === 'example')
    if (callArgs && typeof callArgs[1] === 'function') {
      commandHandler = callArgs[1] as (ctx: MyExampleContext) => Promise<void>
    } else {
      throw new Error('Handler for /example command not registered')
    }

    // Создаем мок контекста с моками для сцен
    mockContext = {
      // Минимальные необходимые свойства контекста
      botInfo: { id: 1, username: 'testbot', is_bot: true, first_name: 'Test' },
      chat: { id: 123, type: 'private' },
      message: {
        message_id: 1,
        date: Date.now(),
        chat: { id: 123, type: 'private' },
        text: '/example',
      },
      scene: {
        enter: vi.fn(),
        leave: vi.fn(),
        reenter: vi.fn(),
        state: {}, // Добавляем state
        session: {
          // Добавляем session внутри scene для полноты
          __scenes: {},
        },
      },
      // Можно добавить мок для reply, если он используется в реальной логике
      reply: vi.fn(),
      // ... другие свойства контекста по мере необходимости
    } as unknown as MyExampleContext // Используем as unknown для упрощения

    // Очищаем моки шпионов перед каждым тестом
    vi.clearAllMocks()
    commandSpy.mockClear() // Очищаем шпиона command
  })

  it('should call scene.leave() and scene.enter() with correct scene ID', async () => {
    expect(commandHandler).toBeDefined()
    if (!commandHandler) return // Type guard

    // Вызываем захваченный обработчик команды
    await commandHandler(mockContext)

    // Проверяем вызов scene.leave()
    expect(mockContext.scene.leave).toHaveBeenCalledTimes(1)

    // Проверяем вызов scene.enter() с правильным ID сцены
    expect(mockContext.scene.enter).toHaveBeenCalledTimes(1)
    expect(mockContext.scene.enter).toHaveBeenCalledWith('TARGET_SCENE') // Используем строковое значение из Enum

    // Проверяем, что reply не вызывался (если он не ожидается)
    expect(mockContext.reply).not.toHaveBeenCalled()
  })

  // Можно добавить другие тесты, например, на обработку ошибок, если она есть в примере
})
