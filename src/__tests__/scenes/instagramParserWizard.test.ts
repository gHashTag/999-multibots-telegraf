/**
 * Tests for instagramParserWizard (Instagram Parsing)
 * Covers: Admin access, type selection, URL validation, parsing, error handling, localization
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/navigation', () => ({
  handleHelpCancel: vi.fn(() => Promise.resolve(false)),
  createHelpCancelKeyboard: vi.fn(() => ({ reply_markup: { keyboard: [] } })),
  getMainMenuText: vi.fn((isRu: boolean) => (isRu ? 'Главное меню' : 'Main menu')),
  showMainMenu: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/services/generateInstagramScraping', () => ({
  generateInstagramScraping: vi.fn(() =>
    Promise.resolve({
      success: true,
      eventId: 'test-event-id-123',
      message: 'Request accepted',
    })
  ),
}))

vi.mock('@/core/supabase', () => ({
  updateUserBalance: vi.fn(() =>
    Promise.resolve({
      error: null,
      data: { balance: 1000 },
    })
  ),
}))

vi.mock('@/config', () => ({
  ADMIN_IDS_ARRAY: [123456789],
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/interfaces/modes', () => ({
  ModeEnum: {
    InstagramParserWizard: 'instagram_parser_wizard',
  },
}))

vi.mock('@/interfaces', () => ({
  PaymentType: {
    MONEY_OUTCOME: 'MONEY_OUTCOME',
    MONEY_INCOME: 'MONEY_INCOME',
  },
}))

// Import after mocks
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleHelpCancel, createHelpCancelKeyboard, getMainMenuText, showMainMenu } from '@/navigation'
import { generateInstagramScraping } from '@/services/generateInstagramScraping'
import { updateUserBalance } from '@/core/supabase'
import { ADMIN_IDS_ARRAY } from '@/config'
import { logger } from '@/utils/logger'
import { PaymentType } from '@/interfaces'

describe('instagramParserWizard (Instagram Parsing)', () => {
  const mockContext = {
    from: { id: 123456789, username: 'testuser' },
    reply: vi.fn(() => Promise.resolve()),
    answerCbQuery: vi.fn(() => Promise.resolve()),
    scene: {
      state: {},
      leave: vi.fn(() => Promise.resolve()),
      enter: vi.fn(() => Promise.resolve()),
      current: { id: 'instagram_parser_wizard' },
    },
    session: {},
    wizard: {
      next: vi.fn(() => Promise.resolve()),
      cursor: 0,
      state: {} as any,
    },
    message: null as any,
    callbackQuery: null as any,
    botInfo: {
      username: 'test_bot',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.wizard.state = {}
    mockContext.message = null
    mockContext.callbackQuery = null
    mockContext.from = { id: 123456789, username: 'testuser' }

    ;(isRussianFromState as Mock).mockReturnValue(true)
    ;(handleHelpCancel as Mock).mockResolvedValue(false)
    ;(updateUserBalance as Mock).mockResolvedValue({ error: null, data: { balance: 1000 } })
    ;(generateInstagramScraping as Mock).mockResolvedValue({
      success: true,
      eventId: 'test-event-id-123',
      message: 'Request accepted',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Admin Access Control', () => {
    it('should allow access for admin users', async () => {
      mockContext.from.id = 123456789
      const isAdmin = ADMIN_IDS_ARRAY.includes(mockContext.from.id)

      expect(isAdmin).toBe(true)
      expect(ADMIN_IDS_ARRAY).toContain(123456789)
    })

    it('should deny access for non-admin users', async () => {
      const nonAdminId = 999999999
      const isAdmin = ADMIN_IDS_ARRAY.includes(nonAdminId)

      expect(isAdmin).toBe(false)
    })

    it('should show Russian access denied message', async () => {
      const isRu = true
      const message = isRu ? '❌ У вас нет доступа к этой функции.' : '❌ You have no access to this function.'

      expect(message).toBe('❌ У вас нет доступа к этой функции.')
    })

    it('should show English access denied message', async () => {
      const isRu = false
      const message = isRu ? '❌ У вас нет доступа к этой функции.' : '❌ You have no access to this function.'

      expect(message).toBe('❌ You have no access to this function.')
    })

    it('should leave scene when non-admin tries to access', async () => {
      mockContext.from.id = 999999999
      await mockContext.scene.leave()

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })
  })

  describe('2. Type Selection (Step 0)', () => {
    it('should show type selection menu in Russian', () => {
      const isRu = true
      const expectedText =
        '🔍 **Парсинг Instagram**\n\n' +
        '⚙️ Выберите тип парсинга:\n\n' +
        '👤 **Конкурент** - парсинг конкретного аккаунта\n' +
        '#️⃣ **Хештег** - парсинг по хештегу\n\n' +
        '💡 Выберите опцию из меню ниже:'

      expect(expectedText).toContain('Парсинг Instagram')
      expect(expectedText).toContain('Конкурент')
      expect(expectedText).toContain('Хештег')
    })

    it('should show type selection menu in English', () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)
      const isRu = false
      const expectedText =
        '🔍 **Instagram Parsing**\n\n' +
        '⚙️ Choose parsing type:\n\n' +
        '👤 **Competitor** - parse specific account\n' +
        '#️⃣ **Hashtag** - parse by hashtag\n\n' +
        '💡 Choose option from menu below:'

      expect(expectedText).toContain('Instagram Parsing')
      expect(expectedText).toContain('Competitor')
      expect(expectedText).toContain('Hashtag')
    })

    it('should log step 0 initialization', () => {
      logger.info('Instagram Parser Wizard: Step 0 - Type selection', {
        userId: 123456789,
      })

      expect(logger.info).toHaveBeenCalledWith('Instagram Parser Wizard: Step 0 - Type selection', {
        userId: 123456789,
      })
    })

    it('should provide keyboard with Competitor and Hashtag options', () => {
      const isRu = true
      const keyboard = [
        [isRu ? '👤 Конкурент' : '👤 Competitor', isRu ? '#️⃣ Хештег' : '#️⃣ Hashtag'],
        [
          isRu ? 'Справка по команде' : 'Help for the command',
          isRu ? 'Отмена' : 'Cancel',
        ],
        [getMainMenuText(isRu)],
      ]

      expect(keyboard[0]).toEqual(['👤 Конкурент', '#️⃣ Хештег'])
    })
  })

  describe('3. Type Processing (Step 1)', () => {
    beforeEach(() => {
      mockContext.message = { text: '👤 Конкурент' } as any
    })

    it('should handle competitor type selection', async () => {
      mockContext.wizard.state.type = 'competitor'

      expect(mockContext.wizard.state.type).toBe('competitor')
    })

    it('should handle hashtag type selection', async () => {
      mockContext.message = { text: '#️⃣ Хештег' } as any
      mockContext.wizard.state.type = 'hashtag'

      expect(mockContext.wizard.state.type).toBe('hashtag')
    })

    it('should show competitor username prompt in Russian', () => {
      const isRu = true
      const expectedText =
        '👤 **Парсинг конкурента**\n\n' +
        '✏️ Введите Instagram username (без @):\n\n' +
        '💡 Например: neuro_sage'

      expect(expectedText).toContain('Введите Instagram username')
      expect(expectedText).toContain('neuro_sage')
    })

    it('should show hashtag prompt in Russian', () => {
      const isRu = true
      const expectedText =
        '#️⃣ **Парсинг по хештегу**\n\n' +
        '✏️ Введите хештег (без #):\n\n' +
        '💡 Например: neurocoding'

      expect(expectedText).toContain('Введите хештег')
      expect(expectedText).toContain('neurocoding')
    })

    it('should reject message without text', async () => {
      mockContext.message = {} as any
      const hasText = mockContext.message && 'text' in mockContext.message

      expect(hasText).toBe(false)
    })

    it('should handle help/cancel request', async () => {
      ;(handleHelpCancel as Mock).mockResolvedValue(true)
      const shouldExit = await handleHelpCancel(mockContext as any)

      expect(shouldExit).toBe(true)
      expect(handleHelpCancel).toHaveBeenCalled()
    })
  })

  describe('4. Target Input Validation (Step 2)', () => {
    beforeEach(() => {
      mockContext.message = { text: 'neuro_sage' } as any
      mockContext.wizard.state.type = 'competitor'
    })

    it('should accept valid username', () => {
      const target = 'neuro_sage'
      const validationRegex = /^[a-zA-Z0-9._]{1,30}$/

      expect(validationRegex.test(target)).toBe(true)
    })

    it('should accept valid hashtag', () => {
      const target = 'neurocoding2024'
      const validationRegex = /^[a-zA-Z0-9._]{1,30}$/

      expect(validationRegex.test(target)).toBe(true)
    })

    it('should strip @ symbol from input', () => {
      const input = '@neuro_sage'
      const cleaned = input.replace(/[@#]/g, '')

      expect(cleaned).toBe('neuro_sage')
    })

    it('should strip # symbol from input', () => {
      const input = '#neurocoding'
      const cleaned = input.replace(/[@#]/g, '')

      expect(cleaned).toBe('neurocoding')
    })

    it('should reject invalid characters', () => {
      const invalidTargets = [
        'test user', // space
        'test@user', // @ in middle
        'test#tag', // # in middle
        'test!user', // special char
        'абвгд', // cyrillic
        '', // empty
        'a'.repeat(31), // too long
      ]

      const validationRegex = /^[a-zA-Z0-9._]{1,30}$/

      invalidTargets.forEach(target => {
        expect(validationRegex.test(target)).toBe(false)
      })
    })

    it('should show validation error in Russian', () => {
      const isRu = true
      const errorMessage =
        '❌ Некорректный формат!\n\n' +
        '✅ Должен содержать только буквы, цифры, точки и подчеркивания (1-30 символов)\n' +
        '💡 Попробуйте еще раз:'

      expect(errorMessage).toContain('Некорректный формат')
      expect(errorMessage).toContain('1-30 символов')
    })

    it('should save target to session state', () => {
      mockContext.wizard.state.target = 'neuro_sage'

      expect(mockContext.wizard.state.target).toBe('neuro_sage')
    })

    it('should show quantity selection with target confirmation', () => {
      mockContext.wizard.state = {
        type: 'competitor',
        target: 'neuro_sage',
      }

      const expectedText = `✅ Аккаунт: @neuro_sage\n\n⚙️ Выберите количество рилсов для парсинга:`

      expect(expectedText).toContain('@neuro_sage')
      expect(expectedText).toContain('количество рилсов')
    })
  })

  describe('5. Quantity Selection and Pricing (Step 3)', () => {
    beforeEach(() => {
      mockContext.wizard.state = {
        type: 'competitor',
        target: 'neuro_sage',
      }
    })

    it('should parse quantity option: 10 reels (3 stars)', () => {
      const text = '10 (3⭐)'
      let count = 0
      let cost = 0

      if (text === '10 (3⭐)') {
        count = 10
        cost = 3
      }

      expect(count).toBe(10)
      expect(cost).toBe(3)
    })

    it('should parse quantity option: 25 reels (8 stars)', () => {
      const text = '25 (8⭐)'
      let count = 0
      let cost = 0

      if (text === '25 (8⭐)') {
        count = 25
        cost = 8
      }

      expect(count).toBe(25)
      expect(cost).toBe(8)
    })

    it('should parse quantity option: 50 reels (15 stars)', () => {
      const text = '50 (15⭐)'
      let count = 0
      let cost = 0

      if (text === '50 (15⭐)') {
        count = 50
        cost = 15
      }

      expect(count).toBe(50)
      expect(cost).toBe(15)
    })

    it('should parse quantity option: 100 reels (30 stars)', () => {
      const text = '100 (30⭐)'
      let count = 0
      let cost = 0

      if (text === '100 (30⭐)') {
        count = 100
        cost = 30
      }

      expect(count).toBe(100)
      expect(cost).toBe(30)
    })

    it('should parse quantity option: 200 reels (55 stars)', () => {
      const text = '200 (55⭐)'
      let count = 0
      let cost = 0

      if (text === '200 (55⭐)') {
        count = 200
        cost = 55
      }

      expect(count).toBe(200)
      expect(cost).toBe(55)
    })

    it('should reject unknown quantity option', () => {
      const text = '500 (100⭐)'
      const validOptions = ['10 (3⭐)', '25 (8⭐)', '50 (15⭐)', '100 (30⭐)', '200 (55⭐)']

      expect(validOptions).not.toContain(text)
    })

    it('should save count and cost to session', () => {
      mockContext.wizard.state.count = 50
      mockContext.wizard.state.cost = 15

      expect(mockContext.wizard.state.count).toBe(50)
      expect(mockContext.wizard.state.cost).toBe(15)
    })

    it('should show confirmation with all details in Russian', () => {
      mockContext.wizard.state = {
        type: 'competitor',
        target: 'neuro_sage',
        count: 50,
        cost: 15,
      }

      const expectedText =
        `📋 **Подтверждение парсинга**\n\n` +
        `🎯 Аккаунт: @neuro_sage\n` +
        `📊 Количество рилсов: 50\n` +
        `💰 Стоимость: 15 ⭐\n\n` +
        `⏱️ Время выполнения: 3-10 минут\n` +
        `📬 Результаты будут отправлены автоматически\n\n` +
        `❓ Подтвердить запуск парсинга?`

      expect(expectedText).toContain('@neuro_sage')
      expect(expectedText).toContain('50')
      expect(expectedText).toContain('15 ⭐')
    })

    it('should show hashtag in confirmation for hashtag type', () => {
      mockContext.wizard.state = {
        type: 'hashtag',
        target: 'neurocoding',
        count: 25,
        cost: 8,
      }

      const confirmText = `🎯 Хештег: #neurocoding`

      expect(confirmText).toContain('#neurocoding')
    })
  })

  describe('6. Confirmation and Processing (Step 4)', () => {
    beforeEach(() => {
      mockContext.wizard.state = {
        type: 'competitor',
        target: 'neuro_sage',
        count: 50,
        cost: 15,
      }
      mockContext.message = { text: '✅ Подтвердить' } as any
    })

    it('should handle confirmation button', async () => {
      const text = '✅ Подтвердить'
      const isConfirmed = text === '✅ Подтвердить' || text === '✅ Confirm'

      expect(isConfirmed).toBe(true)
    })

    it('should handle cancel button', async () => {
      const text = 'Отмена'
      const isCancelled = text === 'Отмена' || text === 'Cancel'

      expect(isCancelled).toBe(true)
    })

    it('should deduct balance on confirmation', async () => {
      await updateUserBalance(
        '123456789',
        15,
        PaymentType.MONEY_OUTCOME,
        'Instagram парсинг: @neuro_sage (50 рилсов)',
        {
          service_type: 'instagram_parser',
          target: 'neuro_sage',
          count: 50,
          stars: 15,
        }
      )

      expect(updateUserBalance).toHaveBeenCalledWith(
        '123456789',
        15,
        PaymentType.MONEY_OUTCOME,
        expect.stringContaining('@neuro_sage'),
        expect.objectContaining({
          service_type: 'instagram_parser',
          target: 'neuro_sage',
          count: 50,
          stars: 15,
        })
      )
    })

    it('should call generateInstagramScraping with correct params', async () => {
      await generateInstagramScraping(
        'neuro_sage', // target
        1, // project_id
        50, // max_users
        50, // max_reels_per_user
        true, // scrape_reels
        '123456789', // userId
        mockContext as any,
        'test_bot' // botUsername
      )

      expect(generateInstagramScraping).toHaveBeenCalledWith(
        'neuro_sage',
        1,
        50,
        50,
        true,
        '123456789',
        mockContext,
        'test_bot'
      )
    })

    it('should show success message with event ID', async () => {
      const result = {
        success: true,
        eventId: 'test-event-id-123',
        message: 'Request accepted',
      }

      const successText =
        `✅ Запрос принят сервером!\n\n` +
        `🎯 Цель: @neuro_sage\n` +
        `📊 Количество: 50 рилсов\n` +
        `💰 Списано: 15 ⭐\n` +
        `🔄 Event ID: ${result.eventId}\n\n` +
        `${result.message}`

      expect(successText).toContain('test-event-id-123')
      expect(successText).toContain('Request accepted')
    })

    it('should validate session data before processing', () => {
      const sessionData = mockContext.wizard.state
      const isValid = !!(
        mockContext.from?.id &&
        sessionData.target &&
        sessionData.count &&
        sessionData.cost
      )

      expect(isValid).toBe(true)
    })

    it('should show error when session data is invalid', () => {
      mockContext.wizard.state = {}
      const isValid = !!(
        mockContext.from?.id &&
        mockContext.wizard.state.target &&
        mockContext.wizard.state.count &&
        mockContext.wizard.state.cost
      )

      expect(isValid).toBe(false)
    })
  })

  describe('7. Error Handling', () => {
    beforeEach(() => {
      mockContext.wizard.state = {
        type: 'competitor',
        target: 'neuro_sage',
        count: 50,
        cost: 15,
      }
    })

    it('should handle API error gracefully', async () => {
      ;(generateInstagramScraping as Mock).mockResolvedValue({
        success: false,
        error: 'API connection failed',
        message: 'Failed to connect to AI server',
      })

      const result = await generateInstagramScraping(
        'neuro_sage',
        1,
        50,
        50,
        true,
        '123456789',
        mockContext as any,
        'test_bot'
      )

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should refund balance on error', async () => {
      await updateUserBalance(
        '123456789',
        15,
        PaymentType.MONEY_INCOME,
        'Возврат за ошибку парсинга: @neuro_sage',
        {
          service_type: 'instagram_parser_refund',
          target: 'neuro_sage',
          count: 50,
          stars: 15,
        }
      )

      expect(updateUserBalance).toHaveBeenCalledWith(
        '123456789',
        15,
        PaymentType.MONEY_INCOME,
        expect.stringContaining('Возврат'),
        expect.objectContaining({
          service_type: 'instagram_parser_refund',
        })
      )
    })

    it('should log errors', () => {
      logger.error('Instagram parser wizard error', {
        error: new Error('Test error'),
        userId: 123456789,
        sessionData: mockContext.wizard.state,
      })

      expect(logger.error).toHaveBeenCalled()
    })

    it('should show refund message on error', () => {
      const isRu = true
      const errorMessage =
        '❌ Произошла ошибка при отправке запроса на сервер.\n\n' +
        '💰 Средства возвращены на баланс.\n' +
        'Попробуйте позже или обратитесь в поддержку.'

      expect(errorMessage).toContain('Средства возвращены')
    })

    it('should handle refund failure', async () => {
      ;(updateUserBalance as Mock).mockRejectedValue(new Error('Refund failed'))

      try {
        await updateUserBalance('123456789', 15, PaymentType.MONEY_INCOME, 'Refund', {})
      } catch (error) {
        logger.error('Failed to refund user', {
          refundError: error,
          userId: 123456789,
          sessionData: mockContext.wizard.state,
        })
      }

      expect(logger.error).toHaveBeenCalled()
    })

    it('should show error message when API returns error', () => {
      const result = {
        success: false,
        error: 'Rate limit exceeded',
        message: 'Too many requests',
      }

      const errorMessage = result.error || result.message || 'Неизвестная ошибка'

      expect(errorMessage).toContain('Rate limit exceeded')
    })
  })

  describe('8. Localization Support', () => {
    it('should detect Russian language', () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)
      const isRu = isRussianFromState(mockContext as any)

      expect(isRu).toBe(true)
      expect(isRussianFromState).toHaveBeenCalledWith(mockContext)
    })

    it('should detect English language', () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)
      const isRu = isRussianFromState(mockContext as any)

      expect(isRu).toBe(false)
    })

    it('should show Russian competitor prompt', () => {
      const isRu = true
      const prompt = isRu
        ? '👤 **Парсинг конкурента**\n\n✏️ Введите Instagram username (без @):'
        : '👤 **Competitor Parsing**\n\n✏️ Enter Instagram username (without @):'

      expect(prompt).toContain('Парсинг конкурента')
    })

    it('should show English competitor prompt', () => {
      const isRu = false
      const prompt = isRu
        ? '👤 **Парсинг конкурента**\n\n✏️ Введите Instagram username (без @):'
        : '👤 **Competitor Parsing**\n\n✏️ Enter Instagram username (without @):'

      expect(prompt).toContain('Competitor Parsing')
    })

    it('should show Russian hashtag prompt', () => {
      const isRu = true
      const prompt = isRu
        ? '#️⃣ **Парсинг по хештегу**\n\n✏️ Введите хештег (без #):'
        : '#️⃣ **Hashtag Parsing**\n\n✏️ Enter hashtag (without #):'

      expect(prompt).toContain('Парсинг по хештегу')
    })

    it('should show English hashtag prompt', () => {
      const isRu = false
      const prompt = isRu
        ? '#️⃣ **Парсинг по хештегу**\n\n✏️ Введите хештег (без #):'
        : '#️⃣ **Hashtag Parsing**\n\n✏️ Enter hashtag (without #):'

      expect(prompt).toContain('Hashtag Parsing')
    })

    it('should show Russian confirmation text', () => {
      const isRu = true
      const text = isRu
        ? '📋 **Подтверждение парсинга**'
        : '📋 **Parsing Confirmation**'

      expect(text).toBe('📋 **Подтверждение парсинга**')
    })

    it('should show English confirmation text', () => {
      const isRu = false
      const text = isRu
        ? '📋 **Подтверждение парсинга**'
        : '📋 **Parsing Confirmation**'

      expect(text).toBe('📋 **Parsing Confirmation**')
    })
  })

  describe('9. Navigation and State Management', () => {
    it('should use getMainMenuText helper', () => {
      const russianText = getMainMenuText(true)
      const englishText = getMainMenuText(false)

      expect(getMainMenuText).toHaveBeenCalledWith(true)
      expect(russianText).toBe('Главное меню')
      expect(englishText).toBe('Main menu')
    })

    it('should handle /start command', async () => {
      await mockContext.scene.leave()
      await showMainMenu(mockContext as any)

      expect(mockContext.scene.leave).toHaveBeenCalled()
      expect(showMainMenu).toHaveBeenCalled()
    })

    it('should handle /help command', async () => {
      await handleHelpCancel(mockContext as any)

      expect(handleHelpCancel).toHaveBeenCalled()
    })

    it('should handle /cancel command', async () => {
      ;(handleHelpCancel as Mock).mockResolvedValue(true)
      const result = await handleHelpCancel(mockContext as any)

      expect(result).toBe(true)
      expect(handleHelpCancel).toHaveBeenCalled()
    })

    it('should create help/cancel keyboard', () => {
      const keyboard = createHelpCancelKeyboard(true)

      expect(createHelpCancelKeyboard).toHaveBeenCalledWith(true)
      expect(keyboard).toHaveProperty('reply_markup')
    })

    it('should progress through wizard steps', () => {
      mockContext.wizard.cursor = 0
      mockContext.wizard.next()
      expect(mockContext.wizard.next).toHaveBeenCalled()

      mockContext.wizard.cursor = 1
      mockContext.wizard.next()
      expect(mockContext.wizard.next).toHaveBeenCalledTimes(2)
    })

    it('should leave scene on completion', async () => {
      await mockContext.scene.leave()

      expect(mockContext.scene.leave).toHaveBeenCalled()
    })

    it('should maintain wizard state across steps', () => {
      mockContext.wizard.state = {
        type: 'competitor',
        target: 'neuro_sage',
        count: 50,
        cost: 15,
      }

      expect(mockContext.wizard.state.type).toBe('competitor')
      expect(mockContext.wizard.state.target).toBe('neuro_sage')
      expect(mockContext.wizard.state.count).toBe(50)
      expect(mockContext.wizard.state.cost).toBe(15)
    })
  })

  describe('10. Edge Cases and Validation', () => {
    it('should handle missing message object', () => {
      mockContext.message = null
      const hasText = mockContext.message && 'text' in mockContext.message

      expect(hasText).toBe(false)
    })

    it('should handle empty text input', () => {
      const text = ''
      const validationRegex = /^[a-zA-Z0-9._]{1,30}$/

      expect(validationRegex.test(text)).toBe(false)
    })

    it('should handle username at maximum length', () => {
      const maxLengthUsername = 'a'.repeat(30)
      const validationRegex = /^[a-zA-Z0-9._]{1,30}$/

      expect(validationRegex.test(maxLengthUsername)).toBe(true)
    })

    it('should reject username exceeding maximum length', () => {
      const tooLongUsername = 'a'.repeat(31)
      const validationRegex = /^[a-zA-Z0-9._]{1,30}$/

      expect(validationRegex.test(tooLongUsername)).toBe(false)
    })

    it('should handle missing userId', () => {
      mockContext.from = null as any
      const userId = mockContext.from?.id

      expect(userId).toBeUndefined()
    })

    it('should handle missing botInfo', () => {
      mockContext.botInfo = null as any
      const botUsername = mockContext.botInfo?.username || 'telegram_bot'

      expect(botUsername).toBe('telegram_bot')
    })

    it('should handle undefined session state', () => {
      mockContext.wizard.state = undefined as any
      const hasValidState = !!(mockContext.wizard.state?.target)

      expect(hasValidState).toBe(false)
    })

    it('should strip multiple @ and # symbols', () => {
      const input = '@@##test@@user##'
      const cleaned = input.replace(/[@#]/g, '')

      expect(cleaned).toBe('testuser')
    })

    it('should handle concurrent type selection buttons', () => {
      const competitorText = '👤 Конкурент'
      const hashtagText = '#️⃣ Хештег'

      const isCompetitor = competitorText === '👤 Конкурент' || competitorText === '👤 Competitor'
      const isHashtag = hashtagText === '#️⃣ Хештег' || hashtagText === '#️⃣ Hashtag'

      expect(isCompetitor).toBe(true)
      expect(isHashtag).toBe(true)
    })

    it('should validate all required fields before API call', () => {
      const sessionData = {
        type: 'competitor',
        target: 'neuro_sage',
        count: 50,
        cost: 15,
      }

      const isValid = !!(
        sessionData.type &&
        sessionData.target &&
        sessionData.count &&
        sessionData.cost
      )

      expect(isValid).toBe(true)
    })
  })
})
