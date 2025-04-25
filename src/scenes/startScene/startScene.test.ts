import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Composer, Markup } from 'telegraf'
import { MyContext } from '@/interfaces' // Assuming path alias works eventually
// import { startScene } from './index' // Import the scene
// import { getTranslation } from '@/utils/localization'
import { levels } from '@/menu/mainMenu' // Import levels for keyboard check

// Мокируем зависимости ДО импорта сцены
// Мок для getTranslation
const mockGetTranslation = vi.fn()
vi.doMock('@/utils/localization', () => ({
  getTranslation: mockGetTranslation,
}))

vi.mock('@/core/supabase', async importOriginal => {
  const actual = await importOriginal<typeof import('@/core/supabase')>()
  return {
    ...actual, // Keep original functions not mocked
    getUserDetailsSubscription: vi
      .fn()
      .mockResolvedValue({ isExist: true, stars: 100 }), // Assume user exists
    createUser: vi.fn().mockResolvedValue([true]),
    getReferalsCountAndUserData: vi.fn().mockResolvedValue({ count: 0 }),
    getPhotoUrl: vi.fn().mockReturnValue('http://example.com/photo.jpg'),
    // Mock other supabase functions if needed by startScene logic
  }
})
vi.mock('@/core/bot', () => ({
  BOT_URLS: {
    test_bot: 'http://tutorial.example.com', // Add mock URL for the test bot
  },
}))

// Simplified mock context
const createMockContext = (
  initialSession: Partial<MyContext['session']> = {}
): MyContext => {
  const ctx = {
    reply: vi.fn().mockResolvedValue({ message_id: 111 }),
    replyWithHTML: vi.fn().mockResolvedValue({ message_id: 222 }),
    replyWithPhoto: vi.fn().mockResolvedValue({ message_id: 333 }),
    deleteMessage: vi.fn().mockResolvedValue(true),
    answerCbQuery: vi.fn().mockResolvedValue(true),
    scene: {
      enter: vi.fn(),
      leave: vi.fn(),
    },
    session: {
      language: 'ru',
      mode: undefined,
      lastBotMessageId: undefined,
      ...initialSession,
    },
    wizard: {}, // Keep wizard object
    from: {
      id: 987654321,
      is_bot: false,
      first_name: 'StartUser',
      username: 'start_user_test',
      language_code: 'ru',
    },
    chat: {
      id: 123456789,
      type: 'private',
      first_name: 'StartUser',
    },
    botInfo: {
      id: 123,
      is_bot: true,
      first_name: 'Test Bot',
      username: 'test_bot', // Set a username for the bot
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
    },
    telegram: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 444 }), // Mock telegram.sendMessage
    },
    // Add other necessary ctx properties if needed
  } as unknown as MyContext
  return ctx
}

describe('startScene', () => {
  let ctx: MyContext
  let startSceneInstance: (typeof import('./index'))['startScene'] // Тип для динамического импорта

  beforeEach(async () => {
    // Сбрасываем моки перед каждым тестом
    vi.clearAllMocks()
    mockGetTranslation.mockClear()
    mockGetTranslation.mockResolvedValue({
      translation: 'Fallback text',
      url: '',
    }) // Reset mock behavior

    // Динамически импортируем сцену ПОСЛЕ установки моков
    const sceneModule = await import('./index')
    startSceneInstance = sceneModule.startScene

    ctx = createMockContext()
  })

  it('should enter the scene, show welcome text and tutorial message with keyboard', async () => {
    // Arrange: Устанавливаем специфичное поведение мока для этого теста
    mockGetTranslation.mockResolvedValueOnce({
      translation: 'Actual welcome text [ru]',
      url: '', // No photo for this test case
    })
    // Используем динамически импортированную сцену
    const scene = startSceneInstance

    // Act: Simulate entering the scene by invoking its first step handler
    if (scene.steps && scene.steps[0]) {
      const next = vi.fn().mockResolvedValue(undefined)
      await scene.steps[0](ctx, next)
      // Добавляем ожидание следующего тика!
      await new Promise(resolve => setTimeout(resolve, 0))
    } else {
      throw new Error('Could not find the first step handler for startScene.')
    }

    // Assert: Check the actual calls made by the scene
    expect(mockGetTranslation).toHaveBeenCalledWith({
      key: 'start',
      ctx,
      bot_name: 'test_bot',
    })

    // Check that text reply was called (since url was empty)
    expect(ctx.reply).toHaveBeenCalledWith('Actual welcome text [ru]', {
      parse_mode: 'Markdown',
    })
    expect(ctx.replyWithPhoto).not.toHaveBeenCalled()

    // Check for the tutorial message
    const expectedTutorialText = `🎬 Посмотрите [видео-инструкцию](http://tutorial.example.com), как создавать нейрофото в этом боте.\n\nВ этом видео вы научитесь тренировать свою модель (Цифровое тело аватара), создавать фотографии и получать prompt из любого фото, которым вы вдохновились.`
    const expectedKeyboard = Markup.keyboard([
      Markup.button.text(levels[105].title_ru),
      Markup.button.text(levels[103].title_ru),
    ]).resize()

    expect(ctx.reply).toHaveBeenCalledWith(expectedTutorialText, {
      parse_mode: 'Markdown',
      reply_markup: expectedKeyboard.reply_markup,
    })
    expect(ctx.reply).toHaveBeenCalledTimes(2)
  })

  it('should show welcome photo if URL is provided', async () => {
    // Arrange: Override mock for getTranslation for this specific test
    mockGetTranslation.mockResolvedValueOnce({
      translation: 'Welcome caption [ru]',
      url: 'http://welcome.photo/img.jpg',
    })
    const scene = startSceneInstance

    // Act: Simulate entering the scene
    if (scene.steps && scene.steps[0]) {
      const next = vi.fn().mockResolvedValue(undefined)
      await scene.steps[0](ctx, next)
      // Добавляем ожидание следующего тика!
      await new Promise(resolve => setTimeout(resolve, 0))
    } else {
      throw new Error('Could not find the first step handler for startScene.')
    }

    // Assert: Check photo reply
    expect(mockGetTranslation).toHaveBeenCalledWith({
      key: 'start',
      ctx,
      bot_name: 'test_bot',
    })
    expect(ctx.replyWithPhoto).toHaveBeenCalledWith(
      'http://welcome.photo/img.jpg',
      { caption: 'Welcome caption [ru]' }
    )
    expect(ctx.reply).toHaveBeenCalledTimes(1) // Only tutorial reply
  })

  it('should handle error when getting translation fails', async () => {
    // Arrange: Mock getTranslation to reject
    mockGetTranslation.mockRejectedValueOnce(new Error('Translation failed'))
    const scene = startSceneInstance

    // Act: Simulate entering the scene
    if (scene.steps && scene.steps[0]) {
      const next = vi.fn().mockResolvedValue(undefined)
      await scene.steps[0](ctx, next)
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    // Assert: Check error handling
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('произошла ошибка'),
      {
        parse_mode: 'Markdown',
      }
    )
  })

  it('should create new user if not exists', async () => {
    // Arrange: Mock user as not existing
    const { getUserDetailsSubscription } = await import('@/core/supabase')
    ;(getUserDetailsSubscription as jest.Mock).mockResolvedValueOnce({
      isExist: false,
      stars: 0,
    })

    const scene = startSceneInstance

    // Act: Simulate entering the scene
    if (scene.steps && scene.steps[0]) {
      const next = vi.fn().mockResolvedValue(undefined)
      await scene.steps[0](ctx, next)
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    // Assert: Check user creation
    const { createUser } = await import('@/core/supabase')
    expect(createUser).toHaveBeenCalledWith({
      telegram_id: ctx.from?.id.toString(),
      username: ctx.from?.username,
      first_name: ctx.from?.first_name,
      language_code: ctx.from?.language_code,
    })
  })

  it('should handle different languages correctly', async () => {
    // Arrange: Set different language
    ctx.session.language = 'en'
    mockGetTranslation.mockResolvedValueOnce({
      translation: 'Actual welcome text [en]',
      url: '',
    })

    const scene = startSceneInstance

    // Act: Simulate entering the scene
    if (scene.steps && scene.steps[0]) {
      const next = vi.fn().mockResolvedValue(undefined)
      await scene.steps[0](ctx, next)
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    // Assert: Check translation call with correct language
    expect(mockGetTranslation).toHaveBeenCalledWith({
      key: 'start',
      ctx: expect.objectContaining({ session: { language: 'en' } }),
      bot_name: 'test_bot',
    })
    expect(ctx.reply).toHaveBeenCalledWith('Actual welcome text [en]', {
      parse_mode: 'Markdown',
    })
  })

  it('should show different menu for subscribed users', async () => {
    // Arrange: Mock user as subscribed
    const { getUserDetailsSubscription } = await import('@/core/supabase')
    ;(getUserDetailsSubscription as jest.Mock).mockResolvedValueOnce({
      isExist: true,
      stars: 100,
      isSubscriptionActive: true,
      subscriptionType: 'NEUROPHOTO',
    })

    const scene = startSceneInstance

    // Act: Simulate entering the scene
    if (scene.steps && scene.steps[0]) {
      const next = vi.fn().mockResolvedValue(undefined)
      await scene.steps[0](ctx, next)
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    // Assert: Check menu contains subscription options
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('NEUROPHOTO'),
      expect.anything()
    )
  })

  it('should handle referral link if provided', async () => {
    // Arrange: Set referral in context
    ctx.session.referral = 'test_referral'
    const { createUser } = await import('@/core/supabase')

    // Act: Simulate entering the scene
    if (startSceneInstance.steps && startSceneInstance.steps[0]) {
      const next = vi.fn().mockResolvedValue(undefined)
      await startSceneInstance.steps[0](ctx, next)
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    // Assert: Check referral was passed to createUser
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        referral: 'test_referral',
      })
    )
  })

  it('should handle empty response from Supabase', async () => {
    // Arrange: Mock empty response
    const { getUserDetailsSubscription } = await import('@/core/supabase')
    ;(getUserDetailsSubscription as jest.Mock).mockResolvedValueOnce(null)

    // Act: Simulate entering the scene
    if (startSceneInstance.steps && startSceneInstance.steps[0]) {
      const next = vi.fn().mockResolvedValue(undefined)
      await startSceneInstance.steps[0](ctx, next)
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    // Assert: Check error handling
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('произошла ошибка'),
      { parse_mode: 'Markdown' }
    )
  })

  it('should properly format markdown in tutorial message', async () => {
    // Act: Simulate entering the scene
    if (startSceneInstance.steps && startSceneInstance.steps[0]) {
      const next = vi.fn().mockResolvedValue(undefined)
      await startSceneInstance.steps[0](ctx, next)
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    // Assert: Check markdown formatting
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('[видео-инструкция]'),
      expect.objectContaining({
        parse_mode: 'Markdown',
      })
    )
  })
})
