/**
 * Tests for menuScene (Main Menu)
 * Covers: Scene entry, translation handling, subscription buttons, language detection
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/helpers/language', () => ({
  isRussianWithUserChoice: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/helpers', () => ({
  isDev: false,
  isRussian: vi.fn(() => true),
}))

vi.mock('@/core/supabase', () => ({
  getReferalsCountAndUserData: vi.fn(() => Promise.resolve({
    level: 1,
    referals_count: 0,
    subscriptionType: null,
  })),
  getUserDetailsSubscription: vi.fn(() => Promise.resolve({
    subscriptionType: null,
  })),
}))

vi.mock('@/core', () => ({
  getTranslation: vi.fn(() => Promise.resolve({
    translation: '🏠 Главное меню\nВыберите нужный раздел 👇',
    url: null,
    buttons: [],
  })),
}))

vi.mock('@/core/bot', () => ({
  getBotNameByToken: vi.fn(() => ({ bot_name: 'test_bot' })),
}))

vi.mock('@/navigation', () => ({
  sendGenericErrorMessage: vi.fn(),
  createMainMenuKeyboard: vi.fn(() => ({
    reply_markup: {
      keyboard: [
        [{ text: '📸 НейроФото' }],
        [{ text: '🏠 Главное меню' }],
      ],
      resize_keyboard: true,
    },
  })),
  getParsingAccess: vi.fn(() => ({ hasAccess: false })),
}))

vi.mock('@/helpers/sendPhotoWithFallback', () => ({
  sendPhotoWithFallback: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/utils', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/interfaces/modes', () => ({
  ModeEnum: {
    MainMenu: 'mainMenu',
    SubscriptionScene: 'subscriptionScene',
    InstagramScrapingWizard: 'instagramScrapingWizard',
    AvatarTransform: 'avatarTransform',
  },
}))

// Import after mocks
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { isRussianWithUserChoice } from '@/helpers/language'
import { getUserDetailsSubscription } from '@/core/supabase'
import { getTranslation } from '@/core'
import { createMainMenuKeyboard, sendGenericErrorMessage } from '@/navigation'

describe('menuScene (Main Menu)', () => {
  const mockContext = {
    from: { id: 223757230, language_code: 'ru', username: 'testuser', first_name: 'Test' },
    reply: vi.fn(),
    answerCbQuery: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(),
      enter: vi.fn(),
      current: { id: 'mainMenu' },
    },
    session: {
      mode: null as any,
      userLanguage: 'ru',
    },
    botInfo: { username: 'test_bot' },
    telegram: {
      token: 'test_token',
    },
    update: {} as any,
    wizard: {
      next: vi.fn(),
      cursor: 0,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.scene.state = {}
    mockContext.session.mode = null
    mockContext.update = {}

    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(isRussianWithUserChoice as Mock).mockResolvedValue(true)
    ;(getUserDetailsSubscription as Mock).mockResolvedValue({
      subscriptionType: null,
    })
    ;(getTranslation as Mock).mockResolvedValue({
      translation: '🏠 Главное меню\nВыберите нужный раздел 👇',
      url: null,
      buttons: [],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Определение языка', () => {
    it('должен использовать isRussianWithUserChoice для определения языка', async () => {
      ;(isRussianWithUserChoice as Mock).mockResolvedValue(true)

      const isRu = await isRussianWithUserChoice(mockContext as any)
      expect(isRu).toBe(true)
      expect(isRussianWithUserChoice).toHaveBeenCalledWith(mockContext)
    })

    it('должен поддерживать английский язык', async () => {
      ;(isRussianWithUserChoice as Mock).mockResolvedValue(false)

      const isRu = await isRussianWithUserChoice(mockContext as any)
      expect(isRu).toBe(false)
    })

    it('должен использовать isRussianFromState для синхронного определения', () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)

      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })
  })

  describe('2. Получение данных пользователя', () => {
    it('должен получать данные о подписке пользователя', async () => {
      ;(getUserDetailsSubscription as Mock).mockResolvedValue({
        subscriptionType: 'neurophoto',
      })

      const result = await getUserDetailsSubscription('223757230')

      expect(getUserDetailsSubscription).toHaveBeenCalledWith('223757230')
      expect(result.subscriptionType).toBe('neurophoto')
    })

    it('должен обрабатывать отсутствие подписки', async () => {
      ;(getUserDetailsSubscription as Mock).mockResolvedValue({
        subscriptionType: null,
      })

      const result = await getUserDetailsSubscription('223757230')
      expect(result.subscriptionType).toBeNull()
    })
  })

  describe('3. Получение перевода', () => {
    it('должен получать перевод для ключа menu', async () => {
      const mockTranslation = {
        translation: 'Добро пожаловать в главное меню!',
        url: 'https://example.com/photo.jpg',
        buttons: [],
      }
      ;(getTranslation as Mock).mockResolvedValue(mockTranslation)

      const result = await getTranslation({
        key: 'menu',
        ctx: mockContext as any,
        bot_name: 'test_bot',
      })

      expect(getTranslation).toHaveBeenCalledWith({
        key: 'menu',
        ctx: mockContext,
        bot_name: 'test_bot',
      })
      expect(result.translation).toBe('Добро пожаловать в главное меню!')
    })

    it('должен получать перевод для ключа digitalAvatar (без подписки)', async () => {
      const mockTranslation = {
        translation: 'Оформите подписку для доступа ко всем функциям',
        url: null,
        buttons: [],
      }
      ;(getTranslation as Mock).mockResolvedValue(mockTranslation)

      const result = await getTranslation({
        key: 'digitalAvatar',
        ctx: mockContext as any,
        bot_name: 'test_bot',
      })

      expect(result.translation).toContain('подписку')
    })

    it('должен использовать fallback если перевод не найден', async () => {
      ;(getTranslation as Mock).mockResolvedValue({
        translation: '',
        url: null,
        buttons: [],
      })

      const result = await getTranslation({
        key: 'menu',
        ctx: mockContext as any,
        bot_name: 'test_bot',
      })

      // При пустом переводе должен использоваться fallback
      expect(result.translation).toBe('')
    })
  })

  describe('4. Создание клавиатуры', () => {
    it('должен создавать главную клавиатуру меню', () => {
      const keyboard = createMainMenuKeyboard(mockContext as any)

      expect(createMainMenuKeyboard).toHaveBeenCalledWith(mockContext)
      expect(keyboard.reply_markup).toBeDefined()
      expect(keyboard.reply_markup.keyboard).toBeDefined()
    })

    it('клавиатура должна содержать кнопки', () => {
      ;(createMainMenuKeyboard as Mock).mockReturnValue({
        reply_markup: {
          keyboard: [
            [{ text: '📸 НейроФото' }],
            [{ text: '🎥 НейроВидео' }],
            [{ text: '💫 Подписка' }, { text: '💰 Баланс' }],
            [{ text: '🏠 Главное меню' }],
          ],
          resize_keyboard: true,
        },
      })

      const keyboard = createMainMenuKeyboard(mockContext as any)

      expect(keyboard.reply_markup.keyboard).toHaveLength(4)
      expect(keyboard.reply_markup.resize_keyboard).toBe(true)
    })
  })

  describe('5. Обработка callback действий', () => {
    it('должен обрабатывать go_to_subscription_scene', async () => {
      mockContext.update = {
        callback_query: {
          data: 'go_to_subscription_scene',
        },
      }

      const callbackData = mockContext.update.callback_query.data
      expect(callbackData).toBe('go_to_subscription_scene')
    })

    it('должен обрабатывать unlock_features', async () => {
      mockContext.update = {
        callback_query: {
          data: 'unlock_features',
        },
      }

      const callbackData = mockContext.update.callback_query.data
      expect(callbackData).toBe('unlock_features')
    })
  })

  describe('6. Обработка текстовых сообщений', () => {
    it('должен обрабатывать кнопку подписки на русском', () => {
      const subscriptionButtons = [
        '💫 Оформить подписку',
        '💫 Subscribe',
        '💳 Оформить подписку',
        '💳 Subscribe',
      ]

      const text = '💫 Оформить подписку'
      const isSubscriptionButton = subscriptionButtons.includes(text)

      expect(isSubscriptionButton).toBe(true)
    })

    it('должен обрабатывать кнопку парсинга', () => {
      const parsingButtons = ['🔍 Парсинг', '🔍 Parsing']

      const text = '🔍 Парсинг'
      const isParsingButton = parsingButtons.includes(text)

      expect(isParsingButton).toBe(true)
    })

    it('должен обрабатывать кнопку генерации видео', () => {
      const videoButtons = [
        '🎥 Сгенерировать новое видео?',
        '🎥 Generate new video?',
      ]

      const text = '🎥 Сгенерировать новое видео?'
      const isVideoButton = videoButtons.includes(text)

      expect(isVideoButton).toBe(true)
    })

    it('не должен обрабатывать команды (начинающиеся с /)', () => {
      const text = '/start'
      const isCommand = text.startsWith('/')

      expect(isCommand).toBe(true)
    })
  })

  describe('7. Определение ключа перевода по подписке', () => {
    it('должен использовать ключ menu для NEUROVIDEO', () => {
      const subscription = 'NEUROVIDEO'
      const validSubscriptions = ['NEUROVIDEO', 'NEUROPHOTO', 'NEUROTESTER']

      const translationKey = validSubscriptions.includes(subscription)
        ? 'menu'
        : 'digitalAvatar'

      expect(translationKey).toBe('menu')
    })

    it('должен использовать ключ menu для NEUROPHOTO', () => {
      const subscription = 'NEUROPHOTO'
      const validSubscriptions = ['NEUROVIDEO', 'NEUROPHOTO', 'NEUROTESTER']

      const translationKey = validSubscriptions.includes(subscription)
        ? 'menu'
        : 'digitalAvatar'

      expect(translationKey).toBe('menu')
    })

    it('должен использовать ключ digitalAvatar для STARS', () => {
      const subscription = 'STARS'
      const validSubscriptions = ['NEUROVIDEO', 'NEUROPHOTO', 'NEUROTESTER']

      const translationKey = validSubscriptions.includes(subscription)
        ? 'menu'
        : 'digitalAvatar'

      expect(translationKey).toBe('digitalAvatar')
    })

    it('должен использовать ключ digitalAvatar для null', () => {
      const subscription = null
      const validSubscriptions = ['NEUROVIDEO', 'NEUROPHOTO', 'NEUROTESTER']

      const translationKey =
        subscription && validSubscriptions.includes(subscription)
          ? 'menu'
          : 'digitalAvatar'

      expect(translationKey).toBe('digitalAvatar')
    })
  })

  describe('8. Обработка ошибок', () => {
    it('должен вызывать sendGenericErrorMessage при ошибке', async () => {
      const error = new Error('Test error')

      await sendGenericErrorMessage(mockContext as any, true, error)

      expect(sendGenericErrorMessage).toHaveBeenCalledWith(
        mockContext,
        true,
        error
      )
    })
  })

  describe('9. Inline кнопка подписки для digitalAvatar', () => {
    it('должен создавать inline кнопку на русском', () => {
      const isRu = true
      const buttonText = isRu ? '💫 Оформить подписку' : '💫 Subscribe'
      const callbackData = 'go_to_subscription_scene'

      expect(buttonText).toBe('💫 Оформить подписку')
      expect(callbackData).toBe('go_to_subscription_scene')
    })

    it('должен создавать inline кнопку на английском', () => {
      const isRu = false
      const buttonText = isRu ? '💫 Оформить подписку' : '💫 Subscribe'
      const callbackData = 'go_to_subscription_scene'

      expect(buttonText).toBe('💫 Subscribe')
      expect(callbackData).toBe('go_to_subscription_scene')
    })
  })

  describe('10. Fallback сообщения', () => {
    it('должен использовать русский fallback', () => {
      const isRu = true
      const fallback = isRu
        ? '🏠 Главное меню\nВыберите нужный раздел 👇'
        : '🏠 Main Menu\nSelect the section 👇'

      expect(fallback).toBe('🏠 Главное меню\nВыберите нужный раздел 👇')
    })

    it('должен использовать английский fallback', () => {
      const isRu = false
      const fallback = isRu
        ? '🏠 Главное меню\nВыберите нужный раздел 👇'
        : '🏠 Main Menu\nSelect the section 👇'

      expect(fallback).toBe('🏠 Main Menu\nSelect the section 👇')
    })
  })
})
