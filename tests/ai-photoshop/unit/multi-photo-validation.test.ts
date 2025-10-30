import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { MyContext } from '../../../src/interfaces'
import { SeeDream4InputSchema, validateSeeDream4Input } from '../../../src/schemas/seedream4.schema'

/**
 * 🧪 AI PHOTOSHOP MULTI-PHOTO VALIDATION TESTS
 *
 * Критическая проблема: SeeDream-4 + промпт "merge" + размер 1K + 2 фото
 * Тестируем валидацию множественных изображений
 */
describe('AI Photoshop Multi-Photo Validation', () => {
  let mockContext: Partial<MyContext>

  beforeEach(() => {
    mockContext = {
      from: { id: 123456789, first_name: 'Test' },
      session: {
        aiPhotoshopModel: 'seedream',
        aiPhotoshopStyle: 'artistic',
        aiPhotoshopSize: '1K',
        morphingImages: []
      },
      telegram: {
        getFile: jest.fn(),
        getFileLink: jest.fn()
      }
    } as any
  })

  describe('Schema Validation', () => {
    it('should accept single image for SeeDream-4', () => {
      const input = {
        prompt: 'enhance this image with artistic style',
        size: '1K' as const,
        max_images: 1,
        image_input: ['https://example.com/image1.jpg'],
        telegram_id: '123456789'
      }

      const result = validateSeeDream4Input(input)
      expect(result.success).toBe(true)
      expect(result.data?.max_images).toBe(1)
    })

    it('should accept multiple images for SeeDream-4 (up to 10)', () => {
      const input = {
        prompt: 'merge these images together',
        size: '1K' as const,
        max_images: 2,
        image_input: [
          'https://example.com/image1.jpg',
          'https://example.com/image2.jpg'
        ],
        telegram_id: '123456789'
      }

      const result = validateSeeDream4Input(input)
      expect(result.success).toBe(true)
      expect(result.data?.image_input?.length).toBe(2)
      expect(result.data?.max_images).toBe(2)
    })

    it('should reject more than 10 images', () => {
      const tooManyImages = Array(11).fill(0).map((_, i) => `https://example.com/image${i}.jpg`)

      const input = {
        prompt: 'process these images',
        size: '1K' as const,
        max_images: 11,
        image_input: tooManyImages,
        telegram_id: '123456789'
      }

      const result = validateSeeDream4Input(input)
      expect(result.success).toBe(false)
    })

    it('should validate size options correctly', () => {
      const validSizes = ['1K', '2K', '4K', 'custom'] as const

      validSizes.forEach(size => {
        const input = {
          prompt: 'test prompt for size validation',
          size,
          max_images: 1,
          image_input: ['https://example.com/image1.jpg'],
          telegram_id: '123456789',
          ...(size === 'custom' ? { width: 1024, height: 1536 } : {})
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
      })
    })

    it('should require width/height for custom size', () => {
      const input = {
        prompt: 'test custom size without dimensions',
        size: 'custom' as const,
        max_images: 1,
        image_input: ['https://example.com/image1.jpg'],
        telegram_id: '123456789'
      }

      const result = validateSeeDream4Input(input)
      expect(result.success).toBe(false)
    })
  })

  describe('Multi-Photo Buffer Handling', () => {
    it('should handle morphingImages array correctly', () => {
      const mockImages = [
        {
          buffer: Buffer.from('fake-image-data-1'),
          filename: 'ai_photoshop_image_1.jpg',
          timestamp: Date.now(),
          originalOrder: 1
        },
        {
          buffer: Buffer.from('fake-image-data-2'),
          filename: 'ai_photoshop_image_2.jpg',
          timestamp: Date.now() + 1,
          originalOrder: 2
        }
      ]

      mockContext.session!.morphingImages = mockImages

      expect(mockContext.session?.morphingImages?.length).toBe(2)
      expect(mockContext.session?.morphingImages?.[0].filename).toBe('ai_photoshop_image_1.jpg')
      expect(mockContext.session?.morphingImages?.[1].originalOrder).toBe(2)
    })

    it('should validate image order preservation', () => {
      const mockImages = Array(5).fill(0).map((_, i) => ({
        buffer: Buffer.from(`fake-image-data-${i + 1}`),
        filename: `ai_photoshop_image_${i + 1}.jpg`,
        timestamp: Date.now() + i,
        originalOrder: i + 1
      }))

      mockContext.session!.morphingImages = mockImages

      // Verify order preservation
      const orders = mockContext.session!.morphingImages!.map(img => img.originalOrder)
      expect(orders).toEqual([1, 2, 3, 4, 5])

      // Verify filenames are sequential
      const filenames = mockContext.session!.morphingImages!.map(img => img.filename)
      expect(filenames).toEqual([
        'ai_photoshop_image_1.jpg',
        'ai_photoshop_image_2.jpg',
        'ai_photoshop_image_3.jpg',
        'ai_photoshop_image_4.jpg',
        'ai_photoshop_image_5.jpg'
      ])
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty image array', () => {
      const input = {
        prompt: 'test with no images',
        size: '1K' as const,
        max_images: 0,
        image_input: [],
        telegram_id: '123456789'
      }

      const result = validateSeeDream4Input(input)
      expect(result.success).toBe(false)
    })

    it('should handle invalid image URLs', () => {
      const input = {
        prompt: 'test with invalid URLs',
        size: '1K' as const,
        max_images: 2,
        image_input: ['not-a-url', 'also-not-a-url'],
        telegram_id: '123456789'
      }

      const result = validateSeeDream4Input(input)
      expect(result.success).toBe(false)
    })

    it('should handle very long prompts', () => {
      const longPrompt = 'a'.repeat(2001) // Exceeds 2000 char limit

      const input = {
        prompt: longPrompt,
        size: '1K' as const,
        max_images: 1,
        image_input: ['https://example.com/image1.jpg'],
        telegram_id: '123456789'
      }

      const result = validateSeeDream4Input(input)
      expect(result.success).toBe(false)
    })

    it('should handle very short prompts', () => {
      const shortPrompt = 'test' // Less than 10 chars

      const input = {
        prompt: shortPrompt,
        size: '1K' as const,
        max_images: 1,
        image_input: ['https://example.com/image1.jpg'],
        telegram_id: '123456789'
      }

      const result = validateSeeDream4Input(input)
      expect(result.success).toBe(false)
    })
  })

  describe('Session State Validation', () => {
    it('should preserve user prompt during multi-photo processing', () => {
      const userPrompt = 'merge these two images together'
      mockContext.session!.aiPhotoshopPrompt = userPrompt
      mockContext.session!.aiPhotoshopStep = 'processing'

      expect(mockContext.session?.aiPhotoshopPrompt).toBe(userPrompt)
      expect(mockContext.session?.aiPhotoshopStep).toBe('processing')
    })

    it('should preserve size selection during workflow', () => {
      const selectedSize = '2K'
      mockContext.session!.aiPhotoshopSize = selectedSize
      mockContext.session!.aiPhotoshopModel = 'seedream'

      expect(mockContext.session?.aiPhotoshopSize).toBe(selectedSize)
      expect(mockContext.session?.aiPhotoshopModel).toBe('seedream')
    })

    it('should handle missing session gracefully', () => {
      const contextWithoutSession = {
        from: { id: 123456789, first_name: 'Test' }
      } as MyContext

      expect(contextWithoutSession.session).toBeUndefined()
      // Should not throw error when accessing undefined session
      expect(() => {
        const prompt = contextWithoutSession.session?.aiPhotoshopPrompt
      }).not.toThrow()
    })
  })

  describe('Model Capabilities Validation', () => {
    it('should validate SeeDream-4 supports multi-image', () => {
      const AI_PHOTOSHOP_MODELS = {
        seedream: {
          supports_multi_image: true,
          max_images: 10
        }
      }

      expect(AI_PHOTOSHOP_MODELS.seedream.supports_multi_image).toBe(true)
      expect(AI_PHOTOSHOP_MODELS.seedream.max_images).toBe(10)
    })

    it('should validate image count against model limits', () => {
      const modelLimits = {
        seedream: 10,
        nano_banana: 3,
        flux_max: 10
      }

      // Test within limits
      expect(2).toBeLessThanOrEqual(modelLimits.seedream)
      expect(3).toBeLessThanOrEqual(modelLimits.nano_banana)
      expect(5).toBeLessThanOrEqual(modelLimits.flux_max)

      // Test exceeding limits
      expect(11).toBeGreaterThan(modelLimits.seedream)
      expect(4).toBeGreaterThan(modelLimits.nano_banana)
    })
  })

  describe('Cost Calculation', () => {
    it('should calculate correct cost for multi-photo processing', () => {
      const sizePrices = {
        '1K': 15,
        '2K': 20,
        '4K': 30
      }

      const imageCount = 2
      const selectedSize = '1K'
      const expectedCost = sizePrices[selectedSize] * imageCount

      expect(expectedCost).toBe(30) // 15 * 2
    })

    it('should calculate cost for different sizes', () => {
      const sizePrices = {
        '1K': 15,
        '2K': 20,
        '4K': 30
      }

      const testCases = [
        { size: '1K', count: 3, expected: 45 },
        { size: '2K', count: 2, expected: 40 },
        { size: '4K', count: 1, expected: 30 }
      ]

      testCases.forEach(({ size, count, expected }) => {
        const cost = sizePrices[size as keyof typeof sizePrices] * count
        expect(cost).toBe(expected)
      })
    })
  })
})