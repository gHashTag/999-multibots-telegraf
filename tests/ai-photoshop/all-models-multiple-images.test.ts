import { describe, test, expect, beforeEach } from '@jest/globals'
import { MyContext } from '@/interfaces'
import { processAllModelsWithMultipleImages } from '@/services/processAllModelsWithMultipleImages'

// Mock the service functions using vi for Vitest/Bun compatibility
import { vi } from 'vitest'

vi.mock('@/services/generateSeeDream4')
vi.mock('@/services/generateNanoBanana')
vi.mock('@/services/generateFluxKontextMax')
vi.mock('@/services/generateQwenImageEditPlus')
vi.mock('@/utils/logger')

describe('🎯 AI Photoshop All Models with Multiple Images', () => {
  let mockCtx: Partial<MyContext>

  beforeEach(() => {
    mockCtx = {
      session: {
        morphingImages: [
          {
            url: 'https://example.com/image1.jpg',
            buffer: Buffer.from('mock-image-1'),
            filename: 'image1.jpg',
            timestamp: Date.now(),
            originalOrder: 1
          },
          {
            url: 'https://example.com/image2.jpg',
            buffer: Buffer.from('mock-image-2'),
            filename: 'image2.jpg',
            timestamp: Date.now() + 1,
            originalOrder: 2
          }
        ]
      },
      from: { id: 144022504 },
      chat: { id: 144022504 }
    } as MyContext

    // Clear all mocks
    vi.clearAllMocks()
  })

  describe('✅ Basic Functionality Tests', () => {
    test('Should validate input parameters correctly', async () => {
      const { validateAllModelsParams } = await import('@/services/processAllModelsWithMultipleImages')

      // Test valid parameters
      const validParams = {
        ctx: mockCtx as MyContext,
        imageUrls: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
        prompt: 'Test prompt',
        telegram_id: '144022504',
        username: 'testuser',
        is_ru: true
      }

      const validResult = validateAllModelsParams(validParams)
      expect(validResult.isValid).toBe(true)
      expect(validResult.errors).toHaveLength(0)

      // Test invalid parameters
      const invalidParams = {
        ctx: mockCtx as MyContext,
        imageUrls: [],
        prompt: '',
        telegram_id: '',
        username: '',
        is_ru: true
      }

      const invalidResult = validateAllModelsParams(invalidParams)
      expect(invalidResult.isValid).toBe(false)
      expect(invalidResult.errors.length).toBeGreaterThan(0)
    })

    test('Should reject more than 10 images', async () => {
      const { validateAllModelsParams } = await import('@/services/processAllModelsWithMultipleImages')

      const tooManyImages = Array.from({ length: 11 }, (_, i) => `https://example.com/image${i}.jpg`)
      const params = {
        ctx: mockCtx as MyContext,
        imageUrls: tooManyImages,
        prompt: 'Test prompt',
        telegram_id: '144022504',
        username: 'testuser',
        is_ru: true
      }

      const result = validateAllModelsParams(params)
      expect(result.isValid).toBe(false)
      expect(result.errors.some(error => error.includes('Maximum 10 images'))).toBe(true)
    })

    test('Should reject prompts longer than 1000 characters', async () => {
      const { validateAllModelsParams } = await import('@/services/processAllModelsWithMultipleImages')

      const longPrompt = 'a'.repeat(1001)
      const params = {
        ctx: mockCtx as MyContext,
        imageUrls: ['https://example.com/image1.jpg'],
        prompt: longPrompt,
        telegram_id: '144022504',
        username: 'testuser',
        is_ru: true
      }

      const result = validateAllModelsParams(params)
      expect(result.isValid).toBe(false)
      expect(result.errors.some(error => error.includes('prompt is too long'))).toBe(true)
    })
  })

  describe('🔄 Processing Logic Tests', () => {
    test('Should process all 4 models with 2 images', async () => {
      const mockSeeDream4 = vi.fn().mockResolvedValue({ image: 'result1.jpg', prompt_id: 1 })
      const mockNanoBanana = vi.fn().mockResolvedValue({ image: 'result2.jpg', prompt_id: 2 })
      const mockFluxKontextMax = vi.fn().mockResolvedValue({ image: 'result3.jpg', prompt_id: 3 })
      const mockQwenEditPlus = vi.fn().mockResolvedValue({ image: 'result4.jpg', prompt_id: 4 })

      // Mock the service modules
      vi.doMock('@/services/generateSeeDream4', () => ({
        generateSeeDream4: mockSeeDream4
      }))
      vi.doMock('@/services/generateNanoBanana', () => ({
        generateNanoBanana: mockNanoBanana
      }))
      vi.doMock('@/services/generateFluxKontextMax', () => ({
        generateFluxKontextMax: mockFluxKontextMax
      }))
      vi.doMock('@/services/generateQwenImageEditPlus', () => ({
        generateQwenImageEditPlus: mockQwenEditPlus
      }))

      const { processAllModelsWithMultipleImages } = await import('@/services/processAllModelsWithMultipleImages')

      const params = {
        ctx: mockCtx as MyContext,
        imageUrls: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
        prompt: 'Transform these DJs in a super club',
        telegram_id: '144022504',
        username: 'testuser',
        is_ru: true
      }

      const result = await processAllModelsWithMultipleImages(params)

      expect(result.success).toBe(true)
      expect(result.totalModelsProcessed).toBe(4)
      expect(result.totalImagesProcessed).toBeGreaterThan(0)
      expect(result.modelResults).toHaveLength(4)
    })

    test('Should handle model failures gracefully', async () => {
      const mockSeeDream4 = vi.fn().mockRejectedValue(new Error('SeeDream4 failed'))
      const mockNanoBanana = vi.fn().mockResolvedValue({ image: 'result2.jpg', prompt_id: 2 })
      const mockFluxKontextMax = vi.fn().mockResolvedValue({ image: 'result3.jpg', prompt_id: 3 })
      const mockQwenEditPlus = vi.fn().mockResolvedValue({ image: 'result4.jpg', prompt_id: 4 })

      // Mock the service modules
      vi.doMock('@/services/generateSeeDream4', () => ({
        generateSeeDream4: mockSeeDream4
      }))
      vi.doMock('@/services/generateNanoBanana', () => ({
        generateNanoBanana: mockNanoBanana
      }))
      vi.doMock('@/services/generateFluxKontextMax', () => ({
        generateFluxKontextMax: mockFluxKontextMax
      }))
      vi.doMock('@/services/generateQwenImageEditPlus', () => ({
        generateQwenImageEditPlus: mockQwenEditPlus
      }))

      const { processAllModelsWithMultipleImages } = await import('@/services/processAllModelsWithMultipleImages')

      const params = {
        ctx: mockCtx as MyContext,
        imageUrls: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
        prompt: 'Transform these DJs in a super club',
        telegram_id: '144022504',
        username: 'testuser',
        is_ru: true
      }

      const result = await processAllModelsWithMultipleImages(params)

      // Should continue processing other models despite one failure
      expect(result.totalModelsProcessed).toBeGreaterThan(0)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some(error => error.includes('SeeDream4 failed'))).toBe(true)
    })
  })

  describe('🎯 Specific Use Cases', () => {
    test('Should handle single image correctly', async () => {
      const { processAllModelsWithMultipleImages } = await import('@/services/processAllModelsWithMultipleImages')

      const params = {
        ctx: mockCtx as MyContext,
        imageUrls: ['https://example.com/single-image.jpg'],
        prompt: 'Enhance this single image',
        telegram_id: '144022504',
        username: 'testuser',
        is_ru: true
      }

      const result = await processAllModelsWithMultipleImages(params)

      expect(result.totalModelsProcessed).toBe(4)
      expect(result.modelResults).toHaveLength(4)
    })

    test('Should handle empty image array gracefully', async () => {
      const { processAllModelsWithMultipleImages } = await import('@/services/processAllModelsWithMultipleImages')

      const params = {
        ctx: mockCtx as MyContext,
        imageUrls: [],
        prompt: 'This should fail',
        telegram_id: '144022504',
        username: 'testuser',
        is_ru: true
      }

      // Should throw or return error since validation should fail
      await expect(processAllModelsWithMultipleImages(params)).rejects.toThrow()
    })

    test('Should calculate costs correctly for multiple images', async () => {
      const { processAllModelsWithMultipleImages } = await import('@/services/processAllModelsWithMultipleImages')

      const params = {
        ctx: mockCtx as MyContext,
        imageUrls: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
        prompt: 'Process 2 images',
        telegram_id: '144022504',
        username: 'testuser',
        is_ru: true
      }

      const result = await processAllModelsWithMultipleImages(params)

      // Each model should calculate cost based on its pricing and number of images
      expect(result.totalCostStars).toBeGreaterThan(0)
      result.modelResults.forEach(modelResult => {
        if (modelResult.success) {
          expect(modelResult.totalCost).toBeGreaterThan(0)
        }
      })
    })
  })

  describe('🚨 Critical Bug Prevention Tests', () => {
    test('Should NOT call SeeDream-4 twice for same image', async () => {
      const mockSeeDream4 = vi.fn().mockResolvedValue({ image: 'result1.jpg', prompt_id: 1 })

      vi.doMock('@/services/generateSeeDream4', () => ({
        generateSeeDream4: mockSeeDream4
      }))

      const { processAllModelsWithMultipleImages } = await import('@/services/processAllModelsWithMultipleImages')

      const params = {
        ctx: mockCtx as MyContext,
        imageUrls: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
        prompt: 'Test no double calls',
        telegram_id: '144022504',
        username: 'testuser',
        is_ru: true
      }

      await processAllModelsWithMultipleImages(params)

      // SeeDream-4 should be called exactly twice (once per image), not four times
      expect(mockSeeDream4).toHaveBeenCalledTimes(2)
    })

    test('Should process ALL images for each model, not just the first', async () => {
      const mockSeeDream4 = vi.fn().mockResolvedValue({ image: 'result1.jpg', prompt_id: 1 })

      vi.doMock('@/services/generateSeeDream4', () => ({
        generateSeeDream4: mockSeeDream4
      }))

      const { processAllModelsWithMultipleImages } = await import('@/services/processAllModelsWithMultipleImages')

      const params = {
        ctx: mockCtx as MyContext,
        imageUrls: [
          'https://example.com/image1.jpg',
          'https://example.com/image2.jpg',
          'https://example.com/image3.jpg'
        ],
        prompt: 'Process ALL three images',
        telegram_id: '144022504',
        username: 'testuser',
        is_ru: true
      }

      await processAllModelsWithMultipleImages(params)

      // SeeDream-4 should be called for ALL 3 images
      expect(mockSeeDream4).toHaveBeenCalledTimes(3)

      // Check that each call received a different image URL
      const callArgs = mockSeeDream4.mock.calls
      expect(callArgs[0][0].inputImageUrl).toBe('https://example.com/image1.jpg')
      expect(callArgs[1][0].inputImageUrl).toBe('https://example.com/image2.jpg')
      expect(callArgs[2][0].inputImageUrl).toBe('https://example.com/image3.jpg')
    })

    test('Should maintain session state properly between model calls', async () => {
      const { processAllModelsWithMultipleImages } = await import('@/services/processAllModelsWithMultipleImages')

      const params = {
        ctx: mockCtx as MyContext,
        imageUrls: ['https://example.com/image1.jpg'],
        prompt: 'Test session state',
        telegram_id: '144022504',
        username: 'testuser',
        is_ru: true
      }

      const result = await processAllModelsWithMultipleImages(params)

      // Session should not be corrupted by model switches
      expect(mockCtx.session).toBeDefined()
      expect(result.success).toBe(true)
    })
  })

  describe('📊 Performance Tests', () => {
    test('Should complete processing within reasonable time', async () => {
      const { processAllModelsWithMultipleImages } = await import('@/services/processAllModelsWithMultipleImages')

      const startTime = Date.now()

      const params = {
        ctx: mockCtx as MyContext,
        imageUrls: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
        prompt: 'Performance test',
        telegram_id: '144022504',
        username: 'testuser',
        is_ru: true
      }

      const result = await processAllModelsWithMultipleImages(params)
      const endTime = Date.now()

      expect(result.totalProcessingTimeMs).toBe(endTime - startTime)
      expect(result.totalProcessingTimeMs).toBeGreaterThan(0)
    })

    test('Should handle concurrent processing properly', async () => {
      const { processAllModelsWithMultipleImages } = await import('@/services/processAllModelsWithMultipleImages')

      const params1 = {
        ctx: mockCtx as MyContext,
        imageUrls: ['https://example.com/image1.jpg'],
        prompt: 'Concurrent test 1',
        telegram_id: '144022504',
        username: 'testuser1',
        is_ru: true
      }

      const params2 = {
        ctx: { ...mockCtx, from: { id: 999888777 } } as MyContext,
        imageUrls: ['https://example.com/image2.jpg'],
        prompt: 'Concurrent test 2',
        telegram_id: '999888777',
        username: 'testuser2',
        is_ru: false
      }

      // Run both concurrently
      const [result1, result2] = await Promise.all([
        processAllModelsWithMultipleImages(params1),
        processAllModelsWithMultipleImages(params2)
      ])

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
    })
  })
})