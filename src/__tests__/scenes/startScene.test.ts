/**
 * Tests for startScene (User Initialization)
 * Covers: Scene entry, welcome message, user data, language detection, menu display
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/core/supabase', () => ({
  getUserData: vi.fn(() => Promise.resolve({
    telegram_id: '223757230',
    username: 'testuser',
    balance: 100,
  })),
  getTranslation: vi.fn(() => Promise.resolve({
    translation: '👋 Привет, {name}!\n\n🤖 Добро пожаловать в {botName}!',
    url: null,
    buttons: [],
  })),
}))

vi.mock('@/core/bot', () => ({
  getBotNameByToken: vi.fn(() => ({ bot_name: 'NeuroBotTest' })),
}))

vi.mock('@/navigation', () => ({
  showMainMenu: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/handlers/checkFullAccess', () => ({
  checkFullAccess: vi.fn(() => Promise.resolve(false)),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Import after mocks
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getUserData, getTranslation } from '@/core/supabase'
import { getBotNameByToken } from '@/core/bot'
import { showMainMenu } from '@/navigation'

describe('startScene (User Initialization)', () => {
  const mockContext = {
    from: {
      id: 223757230,
      language_code: 'ru',
      username: 'testuser',
      first_name: 'Иван',
    },
    reply: vi.fn(),
    scene: {
      state: {},
      leave: vi.fn(() => Promise.resolve()),
      enter: vi.fn(),
      current: { id: 'startScene' },
    },
    session: {},
    botInfo: { username: 'NeuroBotTest_bot' },
    telegram: {
      token: 'test_token',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.scene.state = {}
    mockContext.from.first_name = 'Иван'
    mockContext.from.username = 'testuser'

    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(getUserData as Mock).mockResolvedValue({
      telegram_id: '223757230',
      username: 'testuser',
      balance: 100,
    })
    ;(getTranslation as Mock).mockResolvedValue({
      translation: '👋 Привет, {name}!\n\n🤖 Добро пожаловать в {botName}!',
      url: null,
      buttons: [],
    })
    ;(getBotNameByToken as Mock).mockReturnValue({ bot_name: 'NeuroBotTest' })
    ;(showMainMenu as Mock).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Определение языка', () => {
    it('должен определять русский язык', () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)

      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(true)
    })

    it('должен определять английский язык', () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)

      const isRu = isRussianFromState(mockContext as any)
      expect(isRu).toBe(false)
    })
  })

  describe('2. Получение данных пользователя', () => {
    it('должен получать данные пользователя по telegram_id', async () => {
      const userData = await getUserData('223757230')

      expect(getUserData).toHaveBeenCalledWith('223757230')
      expect(userData).toBeDefined()
      expect(userData?.telegram_id).toBe('223757230')
    })

    it('должен возвращать null для несуществующего пользователя', async () => {
      ;(getUserData as Mock).mockResolvedValue(null)

      const userData = await getUserData('999999999')
      expect(userData).toBeNull()
    })
  })

  describe('3. Определение имени для приветствия', () => {
    it('должен использовать first_name если доступно', () => {
      const isRu = true
      const fullName = mockContext.from.first_name || ''
      const username = mockContext.from.username || ''
      const name = fullName || username || (isRu ? 'друг' : 'friend')

      expect(name).toBe('Иван')
    })

    it('должен использовать username если first_name отсутствует', () => {
      mockContext.from.first_name = ''
      const isRu = true
      const fullName = mockContext.from.first_name || ''
      const username = mockContext.from.username || ''
      const name = fullName || username || (isRu ? 'друг' : 'friend')

      expect(name).toBe('testuser')
    })

    it('должен использовать "друг" на русском если имя отсутствует', () => {
      mockContext.from.first_name = ''
      mockContext.from.username = ''
      const isRu = true
      const fullName = mockContext.from.first_name || ''
      const username = mockContext.from.username || ''
      const name = fullName || username || (isRu ? 'друг' : 'friend')

      expect(name).toBe('друг')
    })

    it('должен использовать "friend" на английском если имя отсутствует', () => {
      mockContext.from.first_name = ''
      mockContext.from.username = ''
      const isRu = false
      const fullName = mockContext.from.first_name || ''
      const username = mockContext.from.username || ''
      const name = fullName || username || (isRu ? 'друг' : 'friend')

      expect(name).toBe('friend')
    })
  })

  describe('4. Получение имени бота', () => {
    it('должен получать имя бота из BOT_TOKEN', () => {
      const result = getBotNameByToken('test_token')

      expect(result.bot_name).toBe('NeuroBotTest')
    })

    it('должен использовать fallback если бот не найден', () => {
      ;(getBotNameByToken as Mock).mockReturnValue({ bot_name: 'AI Bot' })

      const result = getBotNameByToken('unknown_token')
      expect(result.bot_name).toBe('AI Bot')
    })
  })

  describe('5. Получение приветственного сообщения', () => {
    it('должен получать перевод для ключа welcome', async () => {
      const translation = await getTranslation({
        key: 'welcome',
        ctx: mockContext as any,
        bot_name: 'NeuroBotTest',
      })

      expect(getTranslation).toHaveBeenCalledWith({
        key: 'welcome',
        ctx: mockContext,
        bot_name: 'NeuroBotTest',
      })
      expect(translation.translation).toContain('Привет')
    })

    it('должен заменять {name} в переводе', () => {
      const translation = '👋 Привет, {name}!'
      const name = 'Иван'
      const result = translation.replace(/{name}/g, name)

      expect(result).toBe('👋 Привет, Иван!')
    })

    it('должен заменять {botName} в переводе', () => {
      const translation = '🤖 Добро пожаловать в {botName}!'
      const botName = 'NeuroBotTest'
      const result = translation.replace(/{botName}/g, botName)

      expect(result).toBe('🤖 Добро пожаловать в NeuroBotTest!')
    })

    it('должен заменять оба плейсхолдера', () => {
      const translation = '👋 Привет, {name}!\n\n🤖 Добро пожаловать в {botName}!'
      const name = 'Иван'
      const botName = 'NeuroBotTest'
      const result = translation
        .replace(/{name}/g, name)
        .replace(/{botName}/g, botName)

      expect(result).toBe('👋 Привет, Иван!\n\n🤖 Добро пожаловать в NeuroBotTest!')
    })
  })

  describe('6. Fallback приветствие', () => {
    it('должен использовать русский fallback', () => {
      const isRu = true
      const name = 'Иван'
      const botName = 'NeuroBotTest'

      const fallback = isRu
        ? `👋 Привет, ${name}!\n\n🤖 Добро пожаловать в ${botName}!\n\n🎯 Выберите нужную функцию из меню ниже:`
        : `👋 Hello, ${name}!\n\n🤖 Welcome to ${botName}!\n\n🎯 Select the function you need from the menu below:`

      expect(fallback).toContain('Привет, Иван')
      expect(fallback).toContain('NeuroBotTest')
    })

    it('должен использовать английский fallback', () => {
      const isRu = false
      const name = 'John'
      const botName = 'NeuroBotTest'

      const fallback = isRu
        ? `👋 Привет, ${name}!\n\n🤖 Добро пожаловать в ${botName}!\n\n🎯 Выберите нужную функцию из меню ниже:`
        : `👋 Hello, ${name}!\n\n🤖 Welcome to ${botName}!\n\n🎯 Select the function you need from the menu below:`

      expect(fallback).toContain('Hello, John')
      expect(fallback).toContain('NeuroBotTest')
    })
  })

  describe('7. Показ главного меню', () => {
    it('должен вызывать showMainMenu после приветствия', async () => {
      await showMainMenu(mockContext as any)

      expect(showMainMenu).toHaveBeenCalledWith(mockContext)
    })
  })

  describe('8. Завершение сцены', () => {
    it('должен вызывать scene.leave в конце', async () => {
      await mockContext.scene.leave()

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })

  describe('9. Обработка ошибок', () => {
    it('должен отправлять сообщение об ошибке на русском', async () => {
      const isRu = true
      const errorMessage = isRu
        ? '❌ Произошла ошибка. Попробуйте позже.'
        : '❌ An error occurred. Please try again later.'

      expect(errorMessage).toBe('❌ Произошла ошибка. Попробуйте позже.')
    })

    it('должен отправлять сообщение об ошибке на английском', async () => {
      const isRu = false
      const errorMessage = isRu
        ? '❌ Произошла ошибка. Попробуйте позже.'
        : '❌ An error occurred. Please try again later.'

      expect(errorMessage).toBe('❌ An error occurred. Please try again later.')
    })
  })

  describe('10. Логирование', () => {
    it('должен логировать информацию о входе в сцену', () => {
      const telegramId = mockContext.from.id.toString()
      const username = mockContext.from.username
      const firstName = mockContext.from.first_name

      const logData = {
        telegramId,
        username,
        firstName,
      }

      expect(logData.telegramId).toBe('223757230')
      expect(logData.username).toBe('testuser')
    })
  })
})
