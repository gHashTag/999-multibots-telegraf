import makeMockContext from '../utils/mockTelegrafContext'
import { defaultSession } from '@/store'

// Mock dependencies
jest.mock('@/commands/priceCommand', () => ({ priceCommand: jest.fn() }))
import { priceCommand } from '@/commands/priceCommand'
import { levels } from '@/menu/mainMenu'
import handleMenu from '@/handlers/handleMenu'

// Мокаем зависимости
jest.mock('@/logger')
jest.mock('@/helpers')
jest.mock('@/handlers/handlePriceCommand')

import { logger } from '@/logger'
import { MyContext } from '@/interfaces'
import { ModeEnum, PlatformEnum } from '@/enums'

// Создаем мок контекст для тестов
const createMockContext = (overrides = {}) => {
  return {
    from: {
      id: 12345,
      is_bot: false,
      first_name: 'Test',
      username: 'testuser',
      language_code: 'ru',
    },
    chat: { id: 12345, type: 'private', first_name: 'Test', username: 'testuser' },
    message: {
      text: '',
      message_id: 1,
      date: Date.now(),
      chat: { id: 12345, type: 'private', first_name: 'Test', username: 'testuser' },
    },
    session: {
      cursor: 0,
      images: [],
      targetUserId: '12345',
      isRu: true,
      mode: null,
      platform: null,
      userModel: null,
    },
    reply: jest.fn(),
    scene: {
      enter: jest.fn(),
      leave: jest.fn(),
    },
    ...overrides,
  } as unknown as MyContext
}

// Типизируем моки
const mockedLogger = jest.mocked(logger)
const mockedPriceCommand = jest.mocked(priceCommand)

describe('handleMenu', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    // initialize session and scene
    ctx.session = { ...defaultSession }
    ctx.scene.enter = jest.fn(() => Promise.resolve())
  })

  it('handles subscription button in Russian', async () => {
    const text = levels[0].title_ru
    const testCtx = makeMockContext({
      message: {
        text,
        from: {
          id: 1,
          language_code: 'ru',
          is_bot: false,
          first_name: 'TestRu',
        },
      },
    } as any)
    testCtx.session = { ...defaultSession }
    testCtx.scene.enter = ctx.scene.enter

    await handleMenu(testCtx as any)
    expect(testCtx.session.mode).toBe('subscribe')
    expect(testCtx.scene.enter).toHaveBeenCalledWith('subscriptionScene')
  })

  it('handles subscription button in English', async () => {
    const text = levels[0].title_en
    const testCtx = makeMockContext({
      message: {
        text,
        from: {
          id: 2,
          language_code: 'en',
          is_bot: false,
          first_name: 'TestEn',
        },
      },
    } as any)
    testCtx.session = { ...defaultSession }
    testCtx.scene.enter = ctx.scene.enter

    await handleMenu(testCtx as any)
    expect(testCtx.session.mode).toBe('subscribe')
    expect(testCtx.scene.enter).toHaveBeenCalledWith('subscriptionScene')
  })

  it('handles slash price command', async () => {
    const text = '/price'
    const testCtx = makeMockContext({
      message: {
        text,
        from: {
          id: 3,
          language_code: 'en',
          is_bot: false,
          first_name: 'TestEn',
        },
      },
    } as any)
    testCtx.session = { ...defaultSession }
    testCtx.scene.enter = ctx.scene.enter

    await handleMenu(testCtx as any)
    expect(testCtx.session.mode).toBe('price')
    expect(priceCommand).toHaveBeenCalledWith(testCtx)
  })

  it('does nothing for unknown text', async () => {
    const text = 'unknown'
    const testCtx = makeMockContext({
      message: {
        text,
        from: {
          id: 4,
          language_code: 'ru',
          is_bot: false,
          first_name: 'TestRu',
        },
      },
    } as any)
    testCtx.session = { ...defaultSession }
    testCtx.scene.enter = ctx.scene.enter

    await handleMenu(testCtx as any)
    expect(testCtx.session.mode).toBeUndefined()
    expect(testCtx.scene.enter).not.toHaveBeenCalled()
  })

  it('должен перенаправить пользователя в главное меню по команде "Начать"', async () => {
    // Arrange
    const ctx = createMockContext({
      message: { text: levels[104].ru }
    })

    // Act
    await handleMenu(ctx)

    // Assert
    expect(ctx.session.mode).toBe(ModeEnum.MainMenu)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('[handleMenu] Переход к главному меню')
      })
    )
  })

  it('должен перенаправить пользователя в сцену приглашения по команде "/invite"', async () => {
    // Arrange
    const ctx = createMockContext({
      message: { text: '/invite' }
    })

    // Act
    await handleMenu(ctx)

    // Assert
    expect(ctx.session.mode).toBe(ModeEnum.Invite)
    expect(ctx.scene.enter).toHaveBeenCalledWith('inviteScene')
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('[handleMenu] Переход к приглашению друга')
      })
    )
  })

  it('должен вызвать priceCommand по команде "/price"', async () => {
    // Arrange
    const ctx = createMockContext({
      message: { text: '/price' }
    })

    // Act
    await handleMenu(ctx)

    // Assert
    expect(mockedPriceCommand).toHaveBeenCalledWith(ctx)
  })

  it('должен перенаправить пользователя в главное меню по команде "/start"', async () => {
    // Arrange
    const ctx = createMockContext({
      message: { text: '/start' }
    })

    // Act
    await handleMenu(ctx)

    // Assert
    expect(ctx.session.mode).toBe(ModeEnum.MainMenu)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
  })

  it('должен перенаправить пользователя в главное меню по команде "/menu"', async () => {
    // Arrange
    const ctx = createMockContext({
      message: { text: '/menu' }
    })

    // Act
    await handleMenu(ctx)

    // Assert
    expect(ctx.session.mode).toBe(ModeEnum.MainMenu)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
  })

  it('должен установить платформу в Telegram', async () => {
    // Arrange
    const ctx = createMockContext({
      message: { text: '/menu' },
      session: {
        cursor: 0,
        images: [],
        targetUserId: '12345',
        platform: null,
      },
    })

    // Act
    await handleMenu(ctx)

    // Assert
    expect(ctx.session.platform).toBe(PlatformEnum.Telegram)
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('[handleMenu] Определена платформа')
      })
    )
  })

  it('должен перенаправить в главное меню по умолчанию для неизвестных команд', async () => {
    // Arrange
    const ctx = createMockContext({
      message: { text: 'неизвестная_команда' }
    })

    // Act
    await handleMenu(ctx)

    // Assert
    expect(ctx.session.mode).toBe(ModeEnum.MainMenu)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('[handleMenu] Показываем главное меню по умолчанию')
      })
    )
  })

  it('должен обрабатывать ошибки и логировать их', async () => {
    // Arrange
    const ctx = createMockContext()
    const error = new Error('Test error')
    ctx.scene.enter = jest.fn().mockRejectedValue(error)

    // Act
    await handleMenu(ctx)

    // Assert
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('[handleMenu] Ошибка при обработке меню'),
        error,
      })
    )
  })
})
