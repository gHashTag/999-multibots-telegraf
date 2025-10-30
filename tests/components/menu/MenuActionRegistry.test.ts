/**
 * Unit tests for MenuActionRegistry component
 */
import { MenuActionRegistry } from '../../../src/components/menu/MenuActionRegistry'
import { MyContext } from '../../../src/interfaces/telegram-bot.interface'
import { ModeEnum } from '../../../src/interfaces/modes'

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }
}))

jest.mock('../../../src/helpers/centralizedLanguage', () => ({
  isRussianFromState: jest.fn(() => true)
}))

jest.mock('../../../src/helpers/subscriptionGuard', () => ({
  checkSubscriptionGuard: jest.fn(() => Promise.resolve(true))
}))

describe('MenuActionRegistry', () => {
  let registry: MenuActionRegistry
  let mockContext: Partial<MyContext>

  beforeEach(() => {
    registry = new MenuActionRegistry()

    mockContext = {
      from: { id: 123456789 },
      message: {
        text: '💫 Оформить подписку',
        message_id: 1,
        date: Date.now(),
        chat: { id: 123456789, type: 'private' }
      },
      session: {},
      scene: {
        leave: jest.fn(),
        enter: jest.fn(),
        current: null
      },
      reply: jest.fn()
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('handle', () => {
    it('should handle subscription button correctly', async () => {
      await registry.handle(mockContext as MyContext)

      expect(mockContext.scene!.leave).toHaveBeenCalled()
      expect(mockContext.scene!.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
      expect(mockContext.session!.mode).toBe(ModeEnum.SubscriptionScene)
    })

    it('should handle new neurophoto prompt', async () => {
      mockContext.message = {
        text: '🆕 Новый промпт',
        message_id: 1,
        date: Date.now(),
        chat: { id: 123456789, type: 'private' }
      }

      await registry.handle(mockContext as MyContext)

      expect(mockContext.scene!.leave).toHaveBeenCalled()
      expect(mockContext.scene!.enter).toHaveBeenCalledWith(ModeEnum.CheckBalanceScene)
      expect(mockContext.session!.mode).toBe(ModeEnum.NeuroPhoto)
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Начинаем создание нового нейрофото')
      )
    })

    it('should handle text-to-video creation', async () => {
      mockContext.message = {
        text: '✨ Создать еще (Текст в Видео)',
        message_id: 1,
        date: Date.now(),
        chat: { id: 123456789, type: 'private' }
      }

      await registry.handle(mockContext as MyContext)

      expect(mockContext.scene!.leave).toHaveBeenCalled()
      expect(mockContext.scene!.enter).toHaveBeenCalledWith(ModeEnum.TextToVideo)
      expect(mockContext.session!.mode).toBe(ModeEnum.TextToVideo)
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('Создаем новое видео из текста')
      )
    })

    it('should skip processing for non-text messages', async () => {
      mockContext.message = {
        photo: [{ file_id: 'test', file_unique_id: 'test', width: 100, height: 100 }],
        message_id: 1,
        date: Date.now(),
        chat: { id: 123456789, type: 'private' }
      }

      await registry.handle(mockContext as MyContext)

      expect(mockContext.scene!.leave).not.toHaveBeenCalled()
      expect(mockContext.scene!.enter).not.toHaveBeenCalled()
    })

    it('should skip processing for empty text', async () => {
      mockContext.message = {
        text: '',
        message_id: 1,
        date: Date.now(),
        chat: { id: 123456789, type: 'private' }
      }

      await registry.handle(mockContext as MyContext)

      expect(mockContext.scene!.leave).not.toHaveBeenCalled()
      expect(mockContext.scene!.enter).not.toHaveBeenCalled()
    })

    it('should handle unmatched text gracefully', async () => {
      mockContext.message = {
        text: 'Random unmatched text',
        message_id: 1,
        date: Date.now(),
        chat: { id: 123456789, type: 'private' }
      }

      await registry.handle(mockContext as MyContext)

      expect(mockContext.scene!.leave).not.toHaveBeenCalled()
      expect(mockContext.scene!.enter).not.toHaveBeenCalled()
    })
  })

  describe('getActions', () => {
    it('should return all registered actions', () => {
      const actions = registry.getActions()

      expect(actions.size).toBeGreaterThan(0)
      expect(actions.has('subscription')).toBeTruthy()
      expect(actions.has('new_neurophoto_prompt')).toBeTruthy()
      expect(actions.has('create_more_text_to_video')).toBeTruthy()
    })
  })

  describe('registerAction', () => {
    it('should allow registering new actions', () => {
      const customAction = {
        titles: {
          ru: 'Тестовая кнопка',
          en: 'Test button'
        },
        handler: jest.fn()
      }

      registry.registerAction('test_action', customAction)
      const actions = registry.getActions()

      expect(actions.has('test_action')).toBeTruthy()
      expect(actions.get('test_action')).toEqual(customAction)
    })
  })
})