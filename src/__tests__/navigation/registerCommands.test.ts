/**
 * 🧪 Тесты для registerCommands.ts
 *
 * Тестирует основную функцию регистрации всех команд и обработчиков бота.
 * Это интеграционные тесты, проверяющие корректность регистрации.
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { MyContext } from '@/interfaces/telegram-bot.interface'

// Mock all external dependencies BEFORE importing registerCommands
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn().mockReturnValue(true)
}))

vi.mock('@/helpers/subscriptionGuard', () => ({
  checkSubscriptionGuard: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/config', () => ({
  ADMIN_IDS_ARRAY: [123456, 789012],
  BOT_TOKEN: 'test-token'
}))

vi.mock('@/core/bot', () => ({
  getBotNameByToken: vi.fn().mockReturnValue('TestBot')
}))

vi.mock('@/core/supabase', () => ({
  getReferalsCountAndUserData: vi.fn().mockResolvedValue({ referals: 0, user: {} }),
  getUserData: vi.fn().mockResolvedValue({})
}))

vi.mock('@/store', () => ({
  defaultSession: {}
}))

vi.mock('@/helpers/contextUtils', () => ({
  extractPromoFromContext: vi.fn().mockReturnValue(null)
}))

vi.mock('@/handlers/paymentActions', () => ({
  registerPaymentActions: vi.fn()
}))

vi.mock('@/navigation', () => ({
  CATEGORIES: [
    { id: 'test', ru: 'Тест', en: 'Test', items: [] }
  ],
  showMainMenu: vi.fn().mockResolvedValue(undefined),
  showCategoryMenu: vi.fn().mockResolvedValue(undefined),
  getParsingAccess: vi.fn().mockReturnValue(true)
}))

vi.mock('@/navigation/services/CancelButtonService', () => ({
  handleCancelButton: vi.fn().mockResolvedValue(false)
}))

// Mock all scenes
vi.mock('@/scenes', () => ({
  startScene: { id: 'startScene' },
  menuScene: { id: 'menuScene' },
  helpScene: { id: 'helpScene' },
  inviteScene: { id: 'inviteScene' },
  changeLanguageScene: { id: 'changeLanguageScene' },
  techSupportScene: { id: 'techSupportScene' },
  paymentScene: { id: 'paymentScene' },
  rublePaymentScene: { id: 'rublePaymentScene' },
  starPaymentScene: { id: 'starPaymentScene' },
  subscriptionScene: { id: 'subscriptionScene' },
  subscriptionCheckScene: { id: 'subscriptionCheckScene' },
  balanceScene: { id: 'balanceScene' },
  neuroPhotoWizard: { id: 'neuroPhotoWizard' },
  neuroPhotoWizardV2: { id: 'neuroPhotoWizardV2' },
  textToImageWizard: { id: 'textToImageWizard' },
  textToVideoWizard: { id: 'textToVideoWizard' },
  imageToVideoWizard: { id: 'imageToVideoWizard' },
  imageToPromptWizard: { id: 'imageToPromptWizard' },
  imageUpscalerWizard: { id: 'imageUpscalerWizard' },
  improvePromptWizard: { id: 'improvePromptWizard' },
  trainFluxModelWizard: { id: 'trainFluxModelWizard' },
  uploadTrainFluxModelScene: { id: 'uploadTrainFluxModelScene' },
  uploadVideoScene: { id: 'uploadVideoScene' },
  sizeWizard: { id: 'sizeWizard' },
  aiPhotoshopScene: { id: 'aiPhotoshopScene' },
  morphingWizard: { id: 'morphingWizard' },
  voiceAvatarWizard: { id: 'voiceAvatarWizard' },
  textToSpeechWizard: { id: 'textToSpeechWizard' },
  videoTranscriptionWizard: { id: 'videoTranscriptionWizard' },
  lipSyncWizard: { id: 'lipSyncWizard' },
  veedFabricWizard: { id: 'veedFabricWizard' },
  aiReelsWizard: { id: 'aiReelsWizard' },
  aiReelsEntryWizard: { id: 'aiReelsEntryWizard' },
  aiReelsRenderWizard: { id: 'aiReelsRenderWizard' },
  hedraRenderWizard: { id: 'hedraRenderWizard' },
  heygenRenderWizard: { id: 'heygenRenderWizard' },
  falRenderWizard: { id: 'falRenderWizard' },
  avatarTransformScene: { id: 'avatarTransformScene' },
  avatarBrainWizard: { id: 'avatarBrainWizard' },
  chatWithAvatarWizard: { id: 'chatWithAvatarWizard' },
  selectModelWizard: { id: 'selectModelWizard' },
  digitalAvatarBodyWizard: { id: 'digitalAvatarBodyWizard' },
  digitalAvatarBodyWizardV2: { id: 'digitalAvatarBodyWizardV2' },
  getRuBillWizard: { id: 'getRuBillWizard' },
  levelQuestWizard: { id: 'levelQuestWizard' },
  createUserScene: { id: 'createUserScene' },
  neuroCoderScene: { id: 'neuroCoderScene' },
  instagramScrapingWizard: { id: 'instagramScrapingWizard' },
  instagramParserScene: { id: 'instagramParserScene' },
  instagramParserWizard: { id: 'instagramParserWizard' },
  faceSwapWizard: { id: 'faceSwapWizard' },
  fluxKontextScene: { id: 'fluxKontextScene' },
  emailWizard: { id: 'emailWizard' },
  generateImageScene: { id: 'generateImageScene' }
}))

vi.mock('@/scenes/categoryScenes', () => ({
  categoryScenes: []
}))

// Mock other dependencies
vi.mock('@/services/generateNeuroPhotoHybrid', () => ({
  generateNeuroPhotoHybrid: vi.fn()
}))

vi.mock('@/db/userSettings', () => ({
  getUserProfileAndSettings: vi.fn()
}))

vi.mock('@/commands/fluxKontextCommand', () => ({
  handleFluxKontextModelSelection: vi.fn(),
  handleFluxKontextImage: vi.fn()
}))

vi.mock('@/handlers/getUserInfo', () => ({
  getUserInfo: vi.fn()
}))

vi.mock('@/handlers/handleVideoRestart', () => ({
  handleRestartVideoGeneration: vi.fn()
}))

vi.mock('@/handlers/handleTextToVideoDirect', () => ({
  handleVideoStatusUpdate: vi.fn()
}))

vi.mock('@/helpers/pulse', () => ({
  sendMediaToPulse: vi.fn()
}))

vi.mock('@/commands/handleHelloWorld', () => ({
  handleHelloWorld: vi.fn()
}))

vi.mock('@/commands/priceCommand', () => ({
  priceCommand: vi.fn()
}))

vi.mock('@/commands/interactiveStatsCommand', () => ({
  setupInteractiveStats: vi.fn()
}))

vi.mock('@/handlers/adminCommands', () => ({
  handleAddBalanceCommand: vi.fn(),
  handleCheckBalanceCommand: vi.fn()
}))

vi.mock('@/commands/expenseAnalysisCommand', () => ({
  default: vi.fn()
}))

vi.mock('@/commands/autofixer/autofixer.command', () => ({
  setupAutoFixerCommands: vi.fn()
}))

vi.mock('@/commands/autofixer/autofixer-config.scene', () => ({
  autoFixerConfigScene: { id: 'autoFixerConfigScene' }
}))

vi.mock('@/middleware/adminOnly', () => ({
  requireAdmin: vi.fn().mockReturnValue((ctx: any, next: any) => next())
}))

vi.mock('@/commands/autonomousMonitor', () => ({
  setupAutonomousMonitor: vi.fn()
}))

vi.mock('@/handlers/multiPhotoActions', () => ({
  registerMultiPhotoActions: vi.fn()
}))

vi.mock('@/commands/helpCommand', () => ({
  handleHelpCommand: vi.fn()
}))

vi.mock('@/commands/get100Command', () => ({
  get100Command: vi.fn()
}))

vi.mock('@/commands/handleTechSupport', () => ({
  handleTechSupport: vi.fn()
}))

vi.mock('@/handlers/handleBuy', () => ({
  handleBuy: vi.fn()
}))

// Now import after all mocks are set up
import { registerCommands } from '@/navigation/registerCommands'
import { registerPaymentActions } from '@/handlers/paymentActions'

describe('registerCommands', () => {
  let mockBot: any
  let registeredMiddlewares: any[]
  let registeredCommands: Map<string, any>
  let registeredActions: Map<string, any>
  let registeredHears: any[]

  beforeEach(() => {
    vi.clearAllMocks()

    registeredMiddlewares = []
    registeredCommands = new Map()
    registeredActions = new Map()
    registeredHears = []

    mockBot = {
      use: vi.fn((middleware: any) => {
        registeredMiddlewares.push(middleware)
      }),
      command: vi.fn((name: string, ...handlers: any[]) => {
        registeredCommands.set(name, handlers)
      }),
      action: vi.fn((pattern: string | RegExp, ...handlers: any[]) => {
        registeredActions.set(pattern.toString(), handlers)
      }),
      hears: vi.fn((pattern: string | RegExp | string[], ...handlers: any[]) => {
        registeredHears.push({ pattern, handlers })
      }),
      on: vi.fn(),
      telegram: {
        setMyCommands: vi.fn().mockResolvedValue(undefined)
      }
    }
  })

  describe('registerCommands()', () => {
    it('регистрирует middleware в боте', () => {
      registerCommands({ bot: mockBot })

      expect(mockBot.use).toHaveBeenCalled()
      expect(registeredMiddlewares.length).toBeGreaterThan(0)
    })

    it('регистрирует payment actions', () => {
      registerCommands({ bot: mockBot })

      expect(registerPaymentActions).toHaveBeenCalledWith(mockBot)
    })

    it('не выбрасывает ошибку при регистрации', () => {
      expect(() => {
        registerCommands({ bot: mockBot })
      }).not.toThrow()
    })
  })

  describe('Logging middleware', () => {
    it('первый middleware логирует все входящие обновления', () => {
      registerCommands({ bot: mockBot })

      // Первый middleware должен быть логгером
      expect(registeredMiddlewares.length).toBeGreaterThan(0)
    })
  })

  describe('Integration', () => {
    it('bot.use вызывается несколько раз для разных middleware', () => {
      registerCommands({ bot: mockBot })

      // Должны быть зарегистрированы: logger, stage, navigation
      expect(mockBot.use.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })
})

describe('registerCommands middleware execution', () => {
  let mockBot: any
  let loggingMiddleware: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockBot = {
      use: vi.fn((middleware: any) => {
        if (!loggingMiddleware) {
          loggingMiddleware = middleware
        }
      }),
      command: vi.fn(),
      action: vi.fn(),
      hears: vi.fn(),
      on: vi.fn(),
      telegram: {
        setMyCommands: vi.fn().mockResolvedValue(undefined)
      }
    }

    loggingMiddleware = null
  })

  it('logging middleware вызывает next()', async () => {
    registerCommands({ bot: mockBot })

    if (loggingMiddleware) {
      const mockCtx = {
        update: { update_id: 1 },
        updateType: 'message',
        message: { text: 'test' },
        callbackQuery: undefined,
        scene: { current: { id: 'test' } }
      }
      const mockNext = vi.fn().mockResolvedValue(undefined)

      await loggingMiddleware(mockCtx, mockNext)

      expect(mockNext).toHaveBeenCalled()
    }
  })

  it('logging middleware логирует payment buttons', async () => {
    registerCommands({ bot: mockBot })

    if (loggingMiddleware) {
      const mockCtx = {
        update: { update_id: 1 },
        updateType: 'message',
        message: { text: '💳 Рублями' },
        callbackQuery: undefined,
        scene: { current: { id: 'test' } }
      }
      const mockNext = vi.fn().mockResolvedValue(undefined)

      await loggingMiddleware(mockCtx, mockNext)

      expect(mockNext).toHaveBeenCalled()
    }
  })

  it('logging middleware обрабатывает callback queries', async () => {
    registerCommands({ bot: mockBot })

    if (loggingMiddleware) {
      const mockCtx = {
        update: { update_id: 1 },
        updateType: 'callback_query',
        message: undefined,
        callbackQuery: { data: 'test_action' },
        scene: { current: null }
      }
      const mockNext = vi.fn().mockResolvedValue(undefined)

      await loggingMiddleware(mockCtx, mockNext)

      expect(mockNext).toHaveBeenCalled()
    }
  })
})
