/**
 * Unit tests for BotOrchestrator component
 */
import { BotOrchestrator } from '../../../src/components/menu/BotOrchestrator'
import { Telegraf } from 'telegraf'
import { MyContext } from '../../../src/interfaces/telegram-bot.interface'

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }
}))

jest.mock('../../../src/components/menu/MenuActionRegistry')
jest.mock('../../../src/components/menu/SubscriptionHandler')
jest.mock('../../../src/components/menu/PhotoHandler')
jest.mock('../../../src/components/menu/VideoGenerationHandler')
jest.mock('../../../src/components/menu/NavigationHandler')
jest.mock('../../../src/components/menu/CommandRegistry')

describe('BotOrchestrator', () => {
  let orchestrator: BotOrchestrator
  let mockBot: jest.Mocked<Telegraf<MyContext>>

  beforeEach(() => {
    mockBot = {
      use: jest.fn(),
      command: jest.fn(),
      hears: jest.fn(),
      action: jest.fn(),
      on: jest.fn(),
    } as any

    orchestrator = new BotOrchestrator()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize all component handlers', () => {
      expect(orchestrator).toBeInstanceOf(BotOrchestrator)
      expect(orchestrator.getMenuActionRegistry()).toBeDefined()
      expect(orchestrator.getSubscriptionHandler()).toBeDefined()
      expect(orchestrator.getPhotoHandler()).toBeDefined()
      expect(orchestrator.getVideoGenerationHandler()).toBeDefined()
      expect(orchestrator.getNavigationHandler()).toBeDefined()
      expect(orchestrator.getCommandRegistry()).toBeDefined()
    })
  })

  describe('registerAll', () => {
    it('should register all handlers without errors', () => {
      expect(() => {
        orchestrator.registerAll(mockBot)
      }).not.toThrow()

      // Verify middleware registration
      expect(mockBot.use).toHaveBeenCalled()

      // Verify hears handlers registration
      expect(mockBot.hears).toHaveBeenCalled()

      // Verify photo handler registration
      expect(mockBot.on).toHaveBeenCalledWith('photo', expect.any(Function))

      // Verify text handler registration
      expect(mockBot.on).toHaveBeenCalledWith('text', expect.any(Function))
    })

    it('should throw error if registration fails', () => {
      mockBot.use.mockImplementation(() => {
        throw new Error('Registration failed')
      })

      expect(() => {
        orchestrator.registerAll(mockBot)
      }).toThrow('Registration failed')
    })
  })

  describe('component getters', () => {
    it('should return menu action registry', () => {
      const registry = orchestrator.getMenuActionRegistry()
      expect(registry).toBeDefined()
    })

    it('should return subscription handler', () => {
      const handler = orchestrator.getSubscriptionHandler()
      expect(handler).toBeDefined()
    })

    it('should return photo handler', () => {
      const handler = orchestrator.getPhotoHandler()
      expect(handler).toBeDefined()
    })

    it('should return video generation handler', () => {
      const handler = orchestrator.getVideoGenerationHandler()
      expect(handler).toBeDefined()
    })

    it('should return navigation handler', () => {
      const handler = orchestrator.getNavigationHandler()
      expect(handler).toBeDefined()
    })

    it('should return command registry', () => {
      const registry = orchestrator.getCommandRegistry()
      expect(registry).toBeDefined()
    })
  })

  describe('addCustomHandler', () => {
    it('should handle unknown handler types gracefully', () => {
      expect(() => {
        orchestrator.addCustomHandler('unknown', {})
      }).not.toThrow()
    })
  })
})