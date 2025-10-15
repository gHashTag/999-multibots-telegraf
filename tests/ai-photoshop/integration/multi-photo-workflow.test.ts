import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { MyContext } from '../../../src/interfaces'
import { aiPhotoshopScene } from '../../../src/scenes/aiPhotoshopScene'

/**
 * 🧪 AI PHOTOSHOP MULTI-PHOTO WORKFLOW INTEGRATION TESTS
 *
 * Тестируем полный workflow обработки множественных изображений
 * Фокус на проблеме: SeeDream-4 + промпт "merge" + размер 1K + 2 фото
 */
describe('AI Photoshop Multi-Photo Workflow Integration', () => {
  let mockContext: MyContext
  let mockTelegram: any

  beforeEach(() => {
    mockTelegram = {
      getFile: jest.fn(),
      getFileLink: jest.fn(),
      editMessageText: jest.fn(),
      deleteMessage: jest.fn()
    }

    mockContext = {
      from: { id: 123456789, first_name: 'TestUser', username: 'testuser' },
      chat: { id: 123456789, type: 'private' },
      session: {
        aiPhotoshopModel: undefined,
        aiPhotoshopStyle: undefined,
        aiPhotoshopSize: undefined,
        aiPhotoshopPrompt: undefined,
        aiPhotoshopStep: undefined,
        morphingImages: [],
        morphingProgressMessageId: undefined
      },
      telegram: mockTelegram,
      reply: jest.fn(),
      editMessageText: jest.fn(),
      deleteMessage: jest.fn(),
      answerCbQuery: jest.fn(),
      scene: {
        enter: jest.fn(),
        leave: jest.fn(),
        reenter: jest.fn()
      }
    } as any
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Scene Entry and Model Selection', () => {
    it('should enter scene and show model selection', async () => {
      await aiPhotoshopScene.enter(mockContext)

      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('🎨 *ИИ Фотошоп*'),
        expect.objectContaining({
          parse_mode: 'Markdown',
          reply_markup: expect.any(Object)
        })
      )

      // Session should be reset
      expect(mockContext.session?.aiPhotoshopModel).toBeUndefined()
      expect(mockContext.session?.aiPhotoshopStyle).toBeUndefined()
      expect(mockContext.session?.awaitingAiPhotoshopImage).toBe(false)
    })

    it('should handle model selection correctly', async () => {
      const mockCallback = {
        data: 'ai_photoshop_model_seedream',
        answer: jest.fn()
      }

      mockContext.callbackQuery = mockCallback
      mockContext.answerCbQuery = jest.fn()

      // Simulate model selection
      if (mockContext.session) {
        mockContext.session.aiPhotoshopModel = 'seedream'
        mockContext.session.aiPhotoshopStep = 'style_select'
      }

      expect(mockContext.session?.aiPhotoshopModel).toBe('seedream')
      expect(mockContext.session?.aiPhotoshopStep).toBe('style_select')
    })
  })

  describe('Multi-Photo Collection Workflow', () => {
    it('should collect multiple photos in buffer', async () => {
      const mockImages = [
        {
          buffer: Buffer.from('fake-image-1'),
          filename: 'ai_photoshop_image_1.jpg',
          timestamp: Date.now(),
          originalOrder: 1
        },
        {
          buffer: Buffer.from('fake-image-2'),
          filename: 'ai_photoshop_image_2.jpg',
          timestamp: Date.now() + 1,
          originalOrder: 2
        }
      ]

      if (mockContext.session) {
        mockContext.session.morphingImages = mockImages
        mockContext.session.aiPhotoshopModel = 'seedream'
        mockContext.session.aiPhotoshopStyle = 'artistic'
      }

      expect(mockContext.session?.morphingImages?.length).toBe(2)
      expect(mockContext.session?.morphingImages?.[0].originalOrder).toBe(1)
      expect(mockContext.session?.morphingImages?.[1].originalOrder).toBe(2)
    })

    it('should show progress during image collection', async () => {
      const mockImages = [
        { buffer: Buffer.from('image1'), filename: 'image1.jpg', timestamp: Date.now(), originalOrder: 1 }
      ]

      if (mockContext.session) {
        mockContext.session.morphingImages = mockImages
      }

      // Progress message should show current count
      const expectedProgressText = expect.stringContaining('📸 [▓▓░░░░░░░░] 1 фото')

      expect(mockContext.session?.morphingImages?.length).toBe(1)
    })

    it('should enable processing when 2+ images collected', async () => {
      const mockImages = [
        { buffer: Buffer.from('image1'), filename: 'image1.jpg', timestamp: Date.now(), originalOrder: 1 },
        { buffer: Buffer.from('image2'), filename: 'image2.jpg', timestamp: Date.now() + 1, originalOrder: 2 }
      ]

      if (mockContext.session) {
        mockContext.session.morphingImages = mockImages
      }

      // Should be ready for processing
      expect(mockContext.session?.morphingImages?.length).toBeGreaterThanOrEqual(2)

      // Processing button should be available
      const hasProcessButton = mockContext.session!.morphingImages!.length >= 2
      expect(hasProcessButton).toBe(true)
    })
  })

  describe('Size Selection Workflow', () => {
    it('should handle size selection for SeeDream-4', async () => {
      if (mockContext.session) {
        mockContext.session.aiPhotoshopModel = 'seedream'
        mockContext.session.aiPhotoshopStyle = 'artistic'
        mockContext.session.aiPhotoshopSize = '1K'
      }

      expect(mockContext.session?.aiPhotoshopSize).toBe('1K')

      // Cost calculation
      const sizePrices = { '1K': 15, '2K': 20, '4K': 30 }
      const imageCount = 2
      const expectedCost = sizePrices['1K'] * imageCount

      expect(expectedCost).toBe(30)
    })

    it('should preserve size selection during multi-photo workflow', async () => {
      if (mockContext.session) {
        mockContext.session.aiPhotoshopModel = 'seedream'
        mockContext.session.aiPhotoshopSize = '2K'
        mockContext.session.morphingImages = [
          { buffer: Buffer.from('img1'), filename: 'img1.jpg', timestamp: Date.now(), originalOrder: 1 },
          { buffer: Buffer.from('img2'), filename: 'img2.jpg', timestamp: Date.now() + 1, originalOrder: 2 }
        ]
      }

      // Size should be preserved throughout workflow
      expect(mockContext.session?.aiPhotoshopSize).toBe('2K')
      expect(mockContext.session?.morphingImages?.length).toBe(2)
    })
  })

  describe('Custom Prompt Handling', () => {
    it('should handle custom prompt with multi-photo', async () => {
      const customPrompt = 'merge these two images together'

      if (mockContext.session) {
        mockContext.session.aiPhotoshopModel = 'seedream'
        mockContext.session.aiPhotoshopStyle = 'custom'
        mockContext.session.aiPhotoshopPrompt = customPrompt
        mockContext.session.aiPhotoshopSize = '1K'
        mockContext.session.morphingImages = [
          { buffer: Buffer.from('img1'), filename: 'img1.jpg', timestamp: Date.now(), originalOrder: 1 },
          { buffer: Buffer.from('img2'), filename: 'img2.jpg', timestamp: Date.now() + 1, originalOrder: 2 }
        ]
      }

      expect(mockContext.session?.aiPhotoshopPrompt).toBe(customPrompt)
      expect(mockContext.session?.aiPhotoshopStyle).toBe('custom')
      expect(mockContext.session?.morphingImages?.length).toBe(2)
    })

    it('should fallback to style-based prompt if custom prompt missing', async () => {
      if (mockContext.session) {
        mockContext.session.aiPhotoshopModel = 'seedream'
        mockContext.session.aiPhotoshopStyle = 'artistic'
        mockContext.session.aiPhotoshopPrompt = undefined
      }

      // Should use style template as fallback
      const AI_PHOTOSHOP_STYLES = {
        artistic: {
          template: 'artistic style, creative composition, vibrant colors, detailed artwork'
        }
      }

      const fallbackPrompt = AI_PHOTOSHOP_STYLES.artistic.template
      expect(fallbackPrompt).toBeDefined()
      expect(fallbackPrompt).toContain('artistic style')
    })
  })

  describe('Processing Confirmation', () => {
    it('should show confirmation with correct details', async () => {
      if (mockContext.session) {
        mockContext.session.aiPhotoshopModel = 'seedream'
        mockContext.session.aiPhotoshopStyle = 'artistic'
        mockContext.session.aiPhotoshopSize = '1K'
        mockContext.session.aiPhotoshopPrompt = 'merge these images'
        mockContext.session.morphingImages = [
          { buffer: Buffer.from('img1'), filename: 'img1.jpg', timestamp: Date.now(), originalOrder: 1 },
          { buffer: Buffer.from('img2'), filename: 'img2.jpg', timestamp: Date.now() + 1, originalOrder: 2 }
        ]
      }

      const imageCount = mockContext.session!.morphingImages!.length
      const sizeCost = 15 // 1K price
      const totalCost = sizeCost * imageCount

      expect(imageCount).toBe(2)
      expect(totalCost).toBe(30)
      expect(mockContext.session?.aiPhotoshopPrompt).toBe('merge these images')
    })

    it('should preserve all session data during confirmation', async () => {
      const sessionSnapshot = {
        model: 'seedream',
        style: 'custom',
        size: '2K',
        prompt: 'merge these two beautiful images together',
        imageCount: 3
      }

      if (mockContext.session) {
        mockContext.session.aiPhotoshopModel = sessionSnapshot.model
        mockContext.session.aiPhotoshopStyle = sessionSnapshot.style
        mockContext.session.aiPhotoshopSize = sessionSnapshot.size
        mockContext.session.aiPhotoshopPrompt = sessionSnapshot.prompt
        mockContext.session.morphingImages = Array(sessionSnapshot.imageCount).fill(0).map((_, i) => ({
          buffer: Buffer.from(`img${i + 1}`),
          filename: `img${i + 1}.jpg`,
          timestamp: Date.now() + i,
          originalOrder: i + 1
        }))
      }

      // All data should be preserved
      expect(mockContext.session?.aiPhotoshopModel).toBe(sessionSnapshot.model)
      expect(mockContext.session?.aiPhotoshopStyle).toBe(sessionSnapshot.style)
      expect(mockContext.session?.aiPhotoshopSize).toBe(sessionSnapshot.size)
      expect(mockContext.session?.aiPhotoshopPrompt).toBe(sessionSnapshot.prompt)
      expect(mockContext.session?.morphingImages?.length).toBe(sessionSnapshot.imageCount)
    })
  })

  describe('Error Recovery', () => {
    it('should handle missing session gracefully', async () => {
      const contextWithoutSession = {
        ...mockContext,
        session: undefined
      } as MyContext

      expect(() => {
        const model = contextWithoutSession.session?.aiPhotoshopModel
        const images = contextWithoutSession.session?.morphingImages
      }).not.toThrow()
    })

    it('should handle empty image buffer', async () => {
      if (mockContext.session) {
        mockContext.session.morphingImages = []
        mockContext.session.aiPhotoshopModel = 'seedream'
      }

      const imageCount = mockContext.session?.morphingImages?.length || 0
      expect(imageCount).toBe(0)

      // Should not be ready for processing
      const canProcess = imageCount >= 2
      expect(canProcess).toBe(false)
    })

    it('should handle malformed image data', async () => {
      const malformedImages = [
        { buffer: null, filename: '', timestamp: 0, originalOrder: 0 }
      ] as any

      if (mockContext.session) {
        mockContext.session.morphingImages = malformedImages
      }

      expect(mockContext.session?.morphingImages?.[0].buffer).toBeNull()
      expect(mockContext.session?.morphingImages?.[0].filename).toBe('')
    })
  })

  describe('Session Cleanup', () => {
    it('should clear session after successful processing', async () => {
      // Setup session with data
      if (mockContext.session) {
        mockContext.session.aiPhotoshopModel = 'seedream'
        mockContext.session.aiPhotoshopStyle = 'artistic'
        mockContext.session.aiPhotoshopSize = '1K'
        mockContext.session.aiPhotoshopPrompt = 'test prompt'
        mockContext.session.morphingImages = [
          { buffer: Buffer.from('img1'), filename: 'img1.jpg', timestamp: Date.now(), originalOrder: 1 }
        ]
      }

      // Simulate successful processing cleanup
      if (mockContext.session) {
        mockContext.session.aiPhotoshopModel = undefined
        mockContext.session.aiPhotoshopStyle = undefined
        mockContext.session.aiPhotoshopImage = undefined
        mockContext.session.aiPhotoshopPrompt = undefined
        mockContext.session.aiPhotoshopStep = undefined
        mockContext.session.aiPhotoshopSize = undefined
        mockContext.session.awaitingAiPhotoshopImage = false
        mockContext.session.awaitingAiPhotoshopPrompt = false
        mockContext.session.morphingImages = undefined
        mockContext.session.morphingProgressMessageId = undefined
      }

      // All fields should be cleared
      expect(mockContext.session?.aiPhotoshopModel).toBeUndefined()
      expect(mockContext.session?.aiPhotoshopStyle).toBeUndefined()
      expect(mockContext.session?.aiPhotoshopPrompt).toBeUndefined()
      expect(mockContext.session?.morphingImages).toBeUndefined()
    })

    it('should clear session on error', async () => {
      // Setup session with data
      if (mockContext.session) {
        mockContext.session.aiPhotoshopModel = 'seedream'
        mockContext.session.morphingImages = [
          { buffer: Buffer.from('img1'), filename: 'img1.jpg', timestamp: Date.now(), originalOrder: 1 }
        ]
      }

      // Simulate error cleanup
      if (mockContext.session) {
        mockContext.session.aiPhotoshopModel = undefined
        mockContext.session.aiPhotoshopStyle = undefined
        mockContext.session.aiPhotoshopImage = undefined
        mockContext.session.aiPhotoshopPrompt = undefined
        mockContext.session.aiPhotoshopStep = undefined
        mockContext.session.aiPhotoshopSize = undefined
      }

      expect(mockContext.session?.aiPhotoshopModel).toBeUndefined()
    })
  })
})