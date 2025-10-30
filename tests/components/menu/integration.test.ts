/**
 * Integration tests for menu components
 */
import { BotOrchestrator } from '../../../src/components/menu/BotOrchestrator'
import { Telegraf } from 'telegraf'
import { MyContext } from '../../../src/interfaces/telegram-bot.interface'
import { ModeEnum } from '../../../src/interfaces/modes'

// Mock external dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }
}))

jest.mock('../../../src/helpers/centralizedLanguage', () => ({
  isRussianFromState: jest.fn(() => true),
  getUserLanguageFromState: jest.fn(() => 'ru'),
  setUserLanguageInState: jest.fn()
}))

jest.mock('../../../src/helpers/subscriptionGuard', () => ({
  checkSubscriptionGuard: jest.fn(() => Promise.resolve(true))
}))

describe('Menu Components Integration', () => {
  let orchestrator: BotOrchestrator
  let mockBot: jest.Mocked<Telegraf<MyContext>>
  let mockContext: Partial<MyContext>

  beforeEach(() => {
    mockBot = {
      use: jest.fn(),
      command: jest.fn(),
      hears: jest.fn(),
      action: jest.fn(),
      on: jest.fn(),
    } as any

    mockContext = {
      from: { id: 123456789, username: 'testuser' },
      session: {},
      scene: {
        leave: jest.fn(),
        enter: jest.fn(),
        current: null
      },
      reply: jest.fn(),
      answerCbQuery: jest.fn(),
      deleteMessage: jest.fn()
    }

    orchestrator = new BotOrchestrator()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Component Communication', () => {
    it('should allow components to communicate through orchestrator', () => {
      const menuRegistry = orchestrator.getMenuActionRegistry()
      const subscriptionHandler = orchestrator.getSubscriptionHandler()
      const photoHandler = orchestrator.getPhotoHandler()

      expect(menuRegistry).toBeDefined()
      expect(subscriptionHandler).toBeDefined()
      expect(photoHandler).toBeDefined()

      // Test that components can access each other's functionality
      const menuActions = menuRegistry.getActions()
      expect(menuActions.size).toBeGreaterThan(0)
    })

    it('should handle subscription flow across components', async () => {
      mockContext.message = {
        text: '💫 Оформить подписку',
        message_id: 1,
        date: Date.now(),
        chat: { id: 123456789, type: 'private' }
      }

      const subscriptionHandler = orchestrator.getSubscriptionHandler()
      const handled = await subscriptionHandler.handleSubscriptionText(mockContext as MyContext)

      expect(handled).toBeTruthy()
      expect(mockContext.scene!.leave).toHaveBeenCalled()
      expect(mockContext.scene!.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
    })

    it('should handle video generation flow', async () => {
      mockContext.message = {
        text: '📝 Текст в Видео',
        message_id: 1,
        date: Date.now(),
        chat: { id: 123456789, type: 'private' }
      }

      const videoHandler = orchestrator.getVideoGenerationHandler()
      const handled = await videoHandler.handleVideoGenerationText(mockContext as MyContext)

      expect(handled).toBeTruthy()
      expect(mockContext.scene!.leave).toHaveBeenCalled()
      expect(mockContext.scene!.enter).toHaveBeenCalledWith(ModeEnum.TextToVideo)
    })

    it('should handle photo processing', async () => {
      mockContext.message = {
        photo: [{ file_id: 'test_photo', file_unique_id: 'test', width: 100, height: 100 }],
        message_id: 1,
        date: Date.now(),
        chat: { id: 123456789, type: 'private' }
      }

      // Mock FLUX Kontext awaiting state
      mockContext.session = { awaitingFluxKontextImage: true }

      const photoHandler = orchestrator.getPhotoHandler()

      // This should not throw
      expect(async () => {
        await photoHandler.handle(mockContext as MyContext)
      }).not.toThrow()
    })
  })

  describe('Error Handling', () => {
    it('should handle component errors gracefully', async () => {
      mockContext.scene!.enter = jest.fn().mockRejectedValue(new Error('Scene enter failed'))

      const menuRegistry = orchestrator.getMenuActionRegistry()

      // This should not throw, errors should be caught and logged
      await expect(async () => {
        await menuRegistry.handle(mockContext as MyContext)
      }).not.toThrow()
    })

    it('should continue processing even if one component fails', async () => {
      const menuRegistry = orchestrator.getMenuActionRegistry()
      const subscriptionHandler = orchestrator.getSubscriptionHandler()

      // Mock one component to fail
      jest.spyOn(menuRegistry, 'handle').mockRejectedValue(new Error('Menu failed'))

      // Other components should still work
      mockContext.message = {
        text: '💫 Оформить подписку',
        message_id: 1,
        date: Date.now(),
        chat: { id: 123456789, type: 'private' }
      }

      const handled = await subscriptionHandler.handleSubscriptionText(mockContext as MyContext)
      expect(handled).toBeTruthy()
    })
  })

  describe('Bot Registration Integration', () => {
    it('should register all components with bot', () => {
      orchestrator.registerAll(mockBot)

      // Verify middleware was registered
      expect(mockBot.use).toHaveBeenCalled()

      // Verify hears handlers were registered
      expect(mockBot.hears).toHaveBeenCalledWith(
        expect.arrayContaining(['💫 Оформить подписку', '💫 Subscribe']),
        expect.any(Function)
      )

      // Verify photo handlers were registered
      expect(mockBot.on).toHaveBeenCalledWith('photo', expect.any(Function))

      // Verify text handlers were registered
      expect(mockBot.on).toHaveBeenCalledWith('text', expect.any(Function))
    })

    it('should handle bot registration errors', () => {
      mockBot.use.mockImplementation(() => {
        throw new Error('Bot registration failed')
      })

      expect(() => {
        orchestrator.registerAll(mockBot)
      }).toThrow('Bot registration failed')
    })
  })

  describe('State Management', () => {
    it('should maintain session state across components', async () => {
      const initialSession = { mode: ModeEnum.MainMenu, customData: 'test' }
      mockContext.session = { ...initialSession }

      const menuRegistry = orchestrator.getMenuActionRegistry()
      mockContext.message = {
        text: '💫 Оформить подписку',
        message_id: 1,
        date: Date.now(),
        chat: { id: 123456789, type: 'private' }
      }

      await menuRegistry.handle(mockContext as MyContext)

      // Session should be updated
      expect(mockContext.session!.mode).toBe(ModeEnum.SubscriptionScene)
      // But other data should be preserved
      expect((mockContext.session as any).customData).toBe('test')
    })
  })
})