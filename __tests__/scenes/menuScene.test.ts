import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { Telegraf, Scenes, Context } from 'telegraf'
import type { Message, User, Update } from '@telegraf/types'
import type { MyContext } from '../../src/interfaces'
import { ModeEnum } from '../../src/interfaces/modes'
import { SubscriptionType } from '../../src/interfaces/subscription.interface'
import { mainMenu } from '@/menu/mainMenu'
import { getTranslation } from '@/core'
import { isRussian } from '@/helpers/language'

// Import the scene and its steps (assuming they are exported like this)
import { menuScene } from '../../src/scenes/menuScene'
// We might need to manually extract or export menuCommandStep and menuNextStep if they aren't exported by default
// For now, let's assume menuScene.enterHandler and menuScene.actionHandler/messageHandler map to these

// --- Import the actual step function ---
import { menuCommandStep, menuNextStep } from '../../src/scenes/menuScene'

// --- Import the actual step functions and levels ---
import { levels as actualLevels } from '../../src/menu/mainMenu'

// Mock dependencies
// Moved variable declaration after potential vi.mock usage if needed by factories
let mockGetUserDetailsSubscription: Mock
let mockMainMenu: Mock
let mockGetTranslation: Mock
let mockIsRussian: Mock
let mockHandleMenu: Mock
let mockHandleTechSupport: Mock
let mockHandleRestartVideoGeneration: Mock
let mockLoggerInfo: Mock
let mockLoggerWarn: Mock
let mockLoggerError: Mock

// Mocks - Factories must return vi.fn() directly to avoid hoisting issues
vi.mock('@/core/supabase/getUserDetailsSubscription', () => ({
  getUserDetailsSubscription: vi.fn(), // Fix: Return vi.fn() directly
}))

// --- Mock @/menu/index, including sendGenericErrorMessage ---
vi.mock('@/menu/index', () => ({
  sendGenericErrorMessage: vi.fn(),
}))

vi.mock('@/menu/mainMenu', () => ({
  mainMenu: vi.fn(),
  levels: {
    // Need to mock levels if used directly by scene or handlers
    100: { title_ru: 'Пополнить баланс', title_en: 'Top Up Balance' },
    101: { title_ru: 'Баланс', title_en: 'Balance' },
    102: { title_ru: 'Пригласить друга', title_en: 'Invite Friend' },
    103: { title_ru: 'Техподдержка', title_en: 'Support' },
    104: { title_ru: 'Главное меню', title_en: 'Main Menu' },
    105: { title_ru: 'Оформить подписку', title_en: 'Subscribe' },
    106: { title_ru: 'Справка', title_en: 'Help' },
    // Add other levels if needed by tests
  },
}))
vi.mock('@/core/supabase/getTranslation', () => ({
  getTranslation: vi.fn(),
}))
vi.mock('@/helpers/language', () => ({
  isRussian: vi.fn(),
}))
vi.mock('@/handlers/handleMenu', () => ({
  handleMenu: vi.fn(),
}))
vi.mock('@/commands/handleTechSupport', () => ({
  handleTechSupport: vi.fn(),
}))
vi.mock('@/handlers/handleVideoRestart', () => ({
  handleRestartVideoGeneration: vi.fn(),
}))
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Helper to create mock context (can be imported from startScene.test or defined here)
// Assuming createMockTelegrafContext is available or defined similarly
import { createMockTelegrafContext } from './startScene.test'

// --- Added logger import for vi.mocked ---
import { logger } from '@/utils/logger'

describe('menuScene', () => {
  let mockCtx: MyContext
  // Remove scene variable if not used directly
  // let scene: Scenes.WizardScene<MyContext>

  beforeEach(async () => {
    // Make beforeEach async if imports are awaited
    vi.clearAllMocks()

    // Import necessary modules AFTER mocks are set up
    const userDetailsModule = await import(
      '@/core/supabase/getUserDetailsSubscription'
    )
    const mainMenuModule = await import('@/menu/mainMenu')
    const translationModule = await import('@/core/supabase/getTranslation')
    const languageModule = await import('@/helpers/language')
    const loggerModule = await import('@/utils/logger') // Logger module imported here
    const handleMenuModule = await import('@/handlers/handleMenu')
    const techSupportModule = await import('@/commands/handleTechSupport')
    const videoRestartModule = await import('@/handlers/handleVideoRestart')

    // Assign mocked functions to variables
    mockGetUserDetailsSubscription =
      userDetailsModule.getUserDetailsSubscription as Mock
    mockMainMenu = mainMenuModule.mainMenu as Mock
    mockGetTranslation = translationModule.getTranslation as Mock
    mockIsRussian = languageModule.isRussian as Mock
    mockHandleMenu = handleMenuModule.handleMenu as Mock
    mockHandleTechSupport = techSupportModule.handleTechSupport as Mock
    mockHandleRestartVideoGeneration =
      videoRestartModule.handleRestartVideoGeneration as Mock
    mockLoggerInfo = loggerModule.logger.info as Mock // Assign directly from imported module
    mockLoggerWarn = loggerModule.logger.warn as Mock // Assign directly from imported module
    mockLoggerError = loggerModule.logger.error as Mock // Assign directly from imported module

    // Setup default mock implementations AFTER assigning variables
    mockGetUserDetailsSubscription.mockResolvedValue({
      isExist: true,
      subscriptionType: SubscriptionType.NEUROPHOTO, // Default for tests
      stars: 100,
    })
    mockIsRussian.mockReturnValue(false) // Default to English
    mockGetTranslation.mockResolvedValue({
      translation: 'Default Menu Text',
      url: null,
    })
    mockMainMenu.mockResolvedValue({
      // mainMenu is already assigned the mock fn
      reply_markup: { keyboard: [[{ text: 'DefaultButton' }]] },
    })

    // --- Removed redundant vi.mocked and Object.assign calls ---
    // const loggerMock = vi.mocked(loggerModule.logger) // Corrected, but assignment already done
    // Object.assign(mockLoggerInfo, loggerMock.info) // Redundant
    // Object.assign(mockLoggerWarn, loggerMock.warn) // Redundant
    // Object.assign(mockLoggerError, loggerMock.error) // Redundant

    // const mainMenuMock = vi.mocked(mainMenuModule.mainMenu) // Corrected, but assignment already done
    // Object.assign(mockMainMenu, mainMenuMock.mainMenu) // Redundant

    mockCtx = createMockTelegrafContext({
      // Correct: Nest the scene methods within the scene object
      scene: {
        scene: {
          enter: vi.fn(),
        },
      },
      from: { id: 123, username: 'testuser', language_code: 'ru' },
      message: { text: 'MenuButton' },
      // Overrides for the specific test can be set here, but usually done in the 'it' block
      // but it's better to set them per test case for clarity
    })
  })

  it('should setup basic mocks', () => {
    expect(mockCtx).toBeDefined()
    expect(mockGetUserDetailsSubscription).toBeDefined()
  })

  // Тест 1: Вход в меню (Подписка NEUROBASE/RU)
  it('should handle entering the menu for a user with NEUROBASE subscription (RU)', async () => {
    // Arrange
    const mockTelegramId = '12345RU'
    // --- Pass from and chat data during context creation ---
    mockCtx = createMockTelegrafContext({
      from: { id: 12345, language_code: 'ru' },
      chat: { id: 12345, type: 'private' },
      // Include scene/wizard/session defaults again or ensure they are correctly passed
      scene: {
        enter: vi.fn(),
        leave: vi.fn(),
        reenter: vi.fn(),
        state: {},
      },
      wizard: {
        next: vi.fn(),
        back: vi.fn(),
        state: {},
        step: undefined,
        cursor: 0,
        selectStep: vi.fn(),
      },
      session: { __scenes: { cursor: 0 } }, // Added cursor: 0
      botInfo: { username: 'test_menu_bot' } as any,
    })

    // --- Remove direct assignment to readonly properties ---
    // mockCtx.from = { ...mockCtx.from, id: 12345, language_code: 'ru' }
    // mockCtx.chat = { id: 12345, type: 'private' }

    const userDetails = {
      isExist: true,
      subscriptionType: SubscriptionType.NEUROBASE,
      stars: 500,
    }
    // --- Change mock implementation for clarity ---
    // mockGetUserDetailsSubscription.mockResolvedValue(userDetails)
    mockGetUserDetailsSubscription.mockImplementation(async (id: string) => {
      console.log(
        `[TEST MOCK] getUserDetailsSubscription called with ID: ${id}`
      )
      return Promise.resolve(userDetails) // Return the predefined userDetails object
    })

    mockIsRussian.mockReturnValue(true)

    const translationResult = {
      translation: 'Русский текст меню с URL',
      url: 'http://example.com/photo.jpg',
    }
    mockGetTranslation.mockResolvedValue(translationResult)

    const generatedKeyboard = {
      reply_markup: { keyboard: [[{ text: 'Клавиатура NEUROBASE' }]] },
    }
    mockMainMenu.mockResolvedValue(generatedKeyboard) // mainMenu теперь async

    // --- Add a microtask delay to potentially resolve async mock timing issues ---
    await Promise.resolve()

    // Act
    // --- Correctly call the imported step function ---
    await menuCommandStep(mockCtx) // Corrected: Pass only mockCtx

    // Assert
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith(
      mockCtx.from.id.toString()
    )
    expect(mockIsRussian).toHaveBeenCalledWith(mockCtx)
    expect(mockGetTranslation).toHaveBeenCalledWith({
      key: 'menu', // Ожидаем ключ 'menu' для NEUROBASE
      ctx: mockCtx,
      bot_name: 'test_menu_bot',
    })
    expect(mockMainMenu).toHaveBeenCalledWith({
      isRu: true,
      subscription: SubscriptionType.NEUROBASE,
      ctx: mockCtx,
    })
    // Ожидаем вызов replyWithPhoto, так как URL есть
    expect(mockCtx.replyWithPhoto).toHaveBeenCalledWith(translationResult.url, {
      caption: translationResult.translation,
      reply_markup: generatedKeyboard.reply_markup,
    })
    expect(mockCtx.reply).not.toHaveBeenCalled() // Обычный reply не должен вызываться
    expect(mockCtx.wizard.next).toHaveBeenCalled()
  })

  // TODO: Add Test 2: Вход в меню (Подписка NEUROPHOTO/EN)
  // TODO: Add Test 3: Обработка кнопки "Справка"
  // TODO: Add Test 4: Обработка функциональной кнопки (передача в handleMenu)

  it('should enter help_scene when Help button is pressed', async () => {
    // Arrange
    const mockSceneEnter = vi.fn()
    const mockIsRussianFn = vi.fn().mockReturnValue(false) // Mock isRussian specifically for this test

    mockCtx = createMockTelegrafContext({
      // Pass required scene, wizard, session structure
      scene: {
        scene: {
          enter: mockSceneEnter, // Use the specific mock
          leave: vi.fn(),
          reenter: vi.fn(),
          state: {},
        },
      },
      wizard: {
        next: vi.fn(),
        back: vi.fn(),
        state: {},
        step: undefined,
        cursor: 0,
        selectStep: vi.fn(),
      },
      session: { __scenes: { cursor: 0 } },
      // Set user/message for the test case
      from: { id: 123, username: 'testuser', language_code: 'en' }, // English user
      // Use actual button text from mocked levels
      message: { text: actualLevels[106].title_en },
      botInfo: { username: 'test_menu_bot' } as any,
    })

    // Override the specific mock for isRussian used within this test scope
    mockIsRussian.mockImplementation(mockIsRussianFn)

    // Act: Call the handler for the next step
    await menuNextStep(mockCtx)

    // Assert
    expect(mockIsRussianFn).toHaveBeenCalledWith(mockCtx) // Check if isRussian was called
    expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.Help) // Check if scene.enter was called with Help mode
  })
})
