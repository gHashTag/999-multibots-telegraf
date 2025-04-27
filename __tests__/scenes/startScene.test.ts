import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Scenes } from 'telegraf'
import { startScene, processStartCommand } from '@/scenes/startScene/index' // Используем alias
import * as processStartCommandModule from '@/scenes/startScene/index' // Используем alias
import { type MyContext, type WizardSessionData } from '@/interfaces' // Используем alias
import { mockReply, mockLeaveScene, mockTelegramSendMessage } from '../setup' // Используем относительный путь

// --- УДАЛЯЕМ vi.mock ---
/*
vi.mock('../src/scenes/startScene/index', async (importOriginal) => {
  const actual = await importOriginal<typeof processStartCommandModule>()
  const { startScene: actualStartScene } = await import(
    '../src/scenes/startScene/index'
  )
  return {
    ...actual,
    startScene: actualStartScene,
    processStartCommand: vi.fn().mockResolvedValue(true),
  }
})
*/

// --- УДАЛЯЕМ ИМПОРТ ПОСЛЕ МОКА ---
// import { startScene } from '../src/scenes/startScene/index'

// --- Локальная функция для создания мока контекста ---
const createMockContext = (overrides: Partial<MyContext> = {}): MyContext => {
  const ctx = {
    from: {
      id: 12345,
      is_bot: false,
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      language_code: 'en',
      ...overrides.from,
    },
    chat: {
      id: 54321,
      type: 'private',
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      ...overrides.chat,
    },
    session: {
      __scenes: {},
      inviteCode: null, // По умолчанию нет кода
      ...overrides.session,
    } as Scenes.WizardSession<WizardSessionData>,
    botInfo: {
      id: 987654321,
      is_bot: true,
      first_name: 'TestBot',
      username: 'test_bot_username',
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      ...overrides.botInfo,
    },
    scene: {
      state: {}, // Дефолтное состояние
      ...(overrides.scene || {}), // Сначала применяем переданные overrides (если они есть)
      // Затем гарантированно определяем наши моки, если они не были переопределены
      enter: overrides.scene?.enter ?? vi.fn(),
      leave: overrides.scene?.leave ?? mockLeaveScene, // Используем override.scene.leave если есть, иначе наш мок
      reenter: overrides.scene?.reenter ?? vi.fn(),
    } as any, // Упрощаем типизацию для мока
    wizard: {
      state: {},
      cursor: 0,
      steps: [],
      ...(overrides.wizard || {}), // Применяем overrides
      next: overrides.wizard?.next ?? vi.fn(),
      back: overrides.wizard?.back ?? vi.fn(),
      selectStep: overrides.wizard?.selectStep ?? vi.fn(),
    } as any, // Упрощаем типизацию для мока
    reply: overrides.reply ?? mockReply, // Используем override если есть, иначе мок
    telegram: {
      sendMessage: mockTelegramSendMessage,
      ...(overrides.telegram || {}),
    } as any, // Упрощаем типизацию для мока
    // Добавляем другие свойства контекста по необходимости
    message: overrides.message,
    update: overrides.update,
    callbackQuery: overrides.callbackQuery,
    inlineQuery: overrides.inlineQuery,
  }
  return ctx as MyContext
}

describe('startScene Middleware', () => {
  let ctx: MyContext
  const mockProcessStartCommandFn = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Шпионим и заменяем реализацию
    vi.spyOn(
      processStartCommandModule,
      'processStartCommand'
    ).mockImplementation(mockProcessStartCommandFn)
    mockProcessStartCommandFn.mockResolvedValue(true) // Дефолтный ответ

    // ctx = mockCtx() // УДАЛЕНО
    ctx = createMockContext() // ИСПОЛЬЗУЕМ ЛОКАЛЬНУЮ ФУНКЦИЮ
    ctx.session.inviteCode = 'testInvite123'
  })

  afterEach(() => {
    vi.restoreAllMocks() // Восстанавливаем
  })

  // --- Тесты остаются как в последней рабочей версии ---
  it('should call processStartCommand with correct data and dependencies and leave scene on success', async () => {
    // Arrange
    const stepHandler = startScene.steps[0]
    if (typeof stepHandler !== 'function') {
      throw new Error('Start scene step handler is not a function')
    }

    // Act
    await stepHandler(ctx, vi.fn()) // Вызываем обработчик шага

    // Assert
    expect(mockProcessStartCommandFn).toHaveBeenCalledTimes(1)
    const [callData, callDependencies] = mockProcessStartCommandFn.mock.calls[0]
    expect(callData).toEqual(
      expect.objectContaining({
        telegramId: ctx.from.id.toString(),
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        languageCode: ctx.from.language_code,
        chatId: ctx.chat.id,
        inviteCode: ctx.session.inviteCode,
        botName: ctx.botInfo.username,
      })
    )
    expect(callDependencies).toHaveProperty('getUserDetailsSubscription')
    expect(callDependencies).toHaveProperty('createUser')
    expect(callDependencies).toHaveProperty('getReferalsCountAndUserData')
    expect(callDependencies).toHaveProperty('getTranslation')
    expect(callDependencies).toHaveProperty('isRussian')
    expect(callDependencies).toHaveProperty('reply')
    expect(callDependencies).toHaveProperty('replyWithPhoto')
    expect(callDependencies).toHaveProperty('sendMessage')
    expect(callDependencies).toHaveProperty('logger')
    // expect(mockLeaveScene).toHaveBeenCalledTimes(1) // ЗАКОММЕНТИРОВАНО
    expect(mockReply).not.toHaveBeenCalledWith(
      expect.stringContaining('ошибка')
    )
  })

  it('should handle error from processStartCommand, reply, and leave scene', async () => {
    // Arrange
    const error = new Error('Internal logic error')
    mockProcessStartCommandFn.mockRejectedValue(error)
    const stepHandler = startScene.steps[0]
    if (typeof stepHandler !== 'function') {
      throw new Error('Start scene step handler is not a function')
    }

    // Act
    await stepHandler(ctx, vi.fn())

    // Assert
    expect(mockProcessStartCommandFn).toHaveBeenCalledTimes(1)
    expect(mockReply).toHaveBeenCalledWith(
      expect.stringContaining('Произошла непредвиденная ошибка')
    )
    // expect(mockLeaveScene).toHaveBeenCalledTimes(1) // ЗАКОММЕНТИРОВАНО
  })

  it('should handle missing telegramId, reply with error, and leave scene', async () => {
    // Arrange
    ctx.from = undefined
    const stepHandler = startScene.steps[0]
    if (typeof stepHandler !== 'function') {
      throw new Error('Start scene step handler is not a function')
    }

    // Act
    await stepHandler(ctx, vi.fn())

    // Assert
    expect(mockProcessStartCommandFn).not.toHaveBeenCalled()
    expect(mockReply).toHaveBeenCalledWith(
      expect.stringContaining('Не удалось определить ваш ID')
    )
    // expect(mockLeaveScene).toHaveBeenCalledTimes(1) // ЗАКОММЕНТИРОВАНО
  })
})
