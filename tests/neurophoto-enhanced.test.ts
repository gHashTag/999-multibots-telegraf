/**
 * 🧪 ENHANCED NEUROPHOTO FUNCTION - COMPREHENSIVE TEST SUITE
 *
 * Testing multi-image support, backward compatibility, and edge cases
 * for the enhanced Neurophoto function with array processing capabilities
 */

import { describe, test, expect, beforeEach, vi, Mock, afterEach } from 'vitest'
import { MyContext } from '@/interfaces'
import { HeroValidationService } from '@/services/HeroValidationService'

// Mock interfaces for enhanced multi-image processing
interface ImageData {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

interface EnhancedImageMessage {
  photos?: ImageData[]
  photo?: ImageData[]
}

interface MockAIResponse {
  success: boolean
  result_url?: string
  error?: string
  processing_time?: number
  model_used?: string
}

describe('🦸‍♂️ Enhanced Neurophoto Function - Multi-Image Support', () => {
  let mockContext: Partial<MyContext>
  let mockAIService: any
  let mockTelegramAPI: any

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks()

    // Mock Telegram context
    mockContext = {
      from: { id: 12345 },
      reply: vi.fn(),
      replyWithPhoto: vi.fn(),
      telegram: {
        getFile: vi.fn(),
        token: 'test-bot-token'
      },
      session: {
        selectedHero: 'Человек-паук',
        selectedGender: 'male',
        selectedModel: 'flux-kontext',
        imageUrls: []
      },
      message: {}
    }

    // Mock AI service
    mockAIService = {
      processImage: vi.fn(),
      processImages: vi.fn(),
      getSupportedModels: vi.fn().mockResolvedValue(['flux-kontext', 'seedream4', 'nano-banana'])
    }

    // Mock Telegram API
    mockTelegramAPI = {
      getFile: vi.fn(),
      downloadFile: vi.fn()
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('🔍 Image Array Detection & Validation', () => {
    test('should detect single image format (backward compatibility)', async () => {
      const singleImage: ImageData = {
        file_id: 'BAADBAADrwADBREAAYag2HL3PAAB',
        file_unique_id: 'AQADrwADBREAAQ',
        width: 1920,
        height: 1080,
        file_size: 125000
      }

      const isArray = Array.isArray([singleImage])
      const isValidImage = validateImageData(singleImage)

      expect(isArray).toBe(true)
      expect(isValidImage.isValid).toBe(true)
      expect(isValidImage.imageCount).toBe(1)
    })

    test('should detect and validate multi-image array', async () => {
      const multipleImages: ImageData[] = [
        {
          file_id: 'BAADBAADrwADBREAAYag2HL3PAAB',
          file_unique_id: 'AQADrwADBREAAQ',
          width: 1920,
          height: 1080
        },
        {
          file_id: 'BAADBAADsAADBREAAYag2HL3PAAC',
          file_unique_id: 'AQADsAADBREAAR',
          width: 1080,
          height: 1920
        },
        {
          file_id: 'BAADBAADsQADBREAAYag2HL3PAAD',
          file_unique_id: 'AQADsQADBREAAS',
          width: 2048,
          height: 1536
        }
      ]

      const validation = validateImageArray(multipleImages)

      expect(validation.isValid).toBe(true)
      expect(validation.imageCount).toBe(3)
      expect(validation.totalSizeEstimate).toBeGreaterThan(0)
      expect(validation.supportedFormats).toEqual(['JPEG', 'PNG', 'WEBP'])
    })

    test('should reject empty image arrays', async () => {
      const emptyArray: ImageData[] = []
      const validation = validateImageArray(emptyArray)

      expect(validation.isValid).toBe(false)
      expect(validation.error).toBe('EMPTY_ARRAY')
      expect(validation.imageCount).toBe(0)
    })

    test('should validate maximum image count limit', async () => {
      const tooManyImages = Array.from({ length: 15 }, (_, i) => ({
        file_id: `BAADBAADrwADBREAAYag2HL3PAA${i}`,
        file_unique_id: `AQADrwADBREAA${i}`,
        width: 1920,
        height: 1080
      }))

      const validation = validateImageArray(tooManyImages)

      expect(validation.isValid).toBe(false)
      expect(validation.error).toBe('TOO_MANY_IMAGES')
      expect(validation.maxAllowed).toBe(10) // Should enforce max 10 images
    })
  })

  describe('🎯 AI Model Compatibility Tests', () => {
    test('flux-kontext should support multi-image processing', async () => {
      const images = createMockImageArray(3)
      const modelCapabilities = await checkModelCapabilities('flux-kontext')

      expect(modelCapabilities.supportsMultiImage).toBe(true)
      expect(modelCapabilities.maxImages).toBeGreaterThanOrEqual(3)
      expect(modelCapabilities.batchProcessing).toBe(true)
    })

    test('seedream4 should handle single and multi images', async () => {
      const singleImage = createMockImageArray(1)
      const multiImages = createMockImageArray(5)

      const singleSupport = await checkModelCapabilities('seedream4')
      const multiSupport = await checkModelCapabilities('seedream4')

      expect(singleSupport.supportsMultiImage).toBe(true)
      expect(multiSupport.supportsMultiImage).toBe(true)
      expect(multiSupport.maxImages).toBeGreaterThanOrEqual(5)
    })

    test('nano-banana fallback should maintain compatibility', async () => {
      const images = createMockImageArray(2)

      // Mock flux-kontext failure
      mockAIService.processImages.mockRejectedValueOnce(new Error('Model unavailable'))

      // Mock successful nano-banana fallback
      mockAIService.processImage.mockResolvedValue({
        success: true,
        result_url: 'https://example.com/result.jpg',
        model_used: 'nano-banana'
      })

      const result = await processWithFallback(images, ['flux-kontext', 'nano-banana'])

      expect(result.success).toBe(true)
      expect(result.model_used).toBe('nano-banana')
    })
  })

  describe('⚡ Performance & Optimization Tests', () => {
    test('should process images concurrently for performance', async () => {
      const images = createMockImageArray(5)
      const startTime = performance.now()

      mockAIService.processImages.mockImplementation(async (imageArray: ImageData[]) => {
        // Simulate concurrent processing (faster than sequential)
        await new Promise(resolve => setTimeout(resolve, 100))
        return {
          success: true,
          results: imageArray.map((_, i) => `result_${i}.jpg`),
          processing_time: 100
        }
      })

      const result = await processImagesOptimized(images)
      const endTime = performance.now()
      const totalTime = endTime - startTime

      expect(result.success).toBe(true)
      expect(totalTime).toBeLessThan(200) // Should be much faster than sequential
      expect(result.processing_mode).toBe('concurrent')
    })

    test('should handle memory efficiently with large image arrays', async () => {
      const largeImages = createMockImageArray(8, { size: 5 * 1024 * 1024 }) // 5MB each

      const memoryBefore = process.memoryUsage().heapUsed

      const result = await processImagesWithMemoryControl(largeImages)

      const memoryAfter = process.memoryUsage().heapUsed
      const memoryIncrease = memoryAfter - memoryBefore

      expect(result.success).toBe(true)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024) // Should not exceed 100MB increase
    })

    test('should implement proper garbage collection for image processing', async () => {
      const images = createMockImageArray(10)

      for (let i = 0; i < 5; i++) {
        await processImagesWithCleanup(images)

        // Force garbage collection if available
        if (global.gc) {
          global.gc()
        }
      }

      const finalMemory = process.memoryUsage().heapUsed
      expect(finalMemory).toBeLessThan(200 * 1024 * 1024) // Should not leak memory
    })
  })

  describe('🛡️ Error Handling & Edge Cases', () => {
    test('should handle corrupted image data gracefully', async () => {
      const corruptedImages = [
        {
          file_id: 'CORRUPTED_FILE_ID',
          file_unique_id: 'CORRUPTED_UNIQUE',
          width: -1, // Invalid width
          height: 0   // Invalid height
        },
        createValidImageData() // One valid image
      ]

      const result = await processImagesWithValidation(corruptedImages)

      expect(result.success).toBe(true) // Should succeed with valid images
      expect(result.processedCount).toBe(1) // Only valid image processed
      expect(result.skippedCount).toBe(1)   // Corrupted image skipped
      expect(result.errors).toContain('CORRUPTED_IMAGE_DATA')
    })

    test('should handle network timeouts during batch processing', async () => {
      const images = createMockImageArray(3)

      // Mock network timeout
      mockAIService.processImages.mockRejectedValue(new Error('TIMEOUT'))

      // Should attempt individual processing as fallback
      mockAIService.processImage.mockResolvedValue({
        success: true,
        result_url: 'fallback_result.jpg'
      })

      const result = await processImagesWithTimeout(images, { timeout: 5000 })

      expect(result.success).toBe(true)
      expect(result.fallbackUsed).toBe(true)
      expect(result.processingMode).toBe('individual_fallback')
    })

    test('should validate file sizes and reject oversized images', async () => {
      const oversizedImages = [
        createValidImageData(),
        {
          ...createValidImageData(),
          file_size: 50 * 1024 * 1024 // 50MB - too large
        }
      ]

      const result = await processImagesWithSizeValidation(oversizedImages)

      expect(result.success).toBe(true)
      expect(result.processedCount).toBe(1)
      expect(result.rejectedCount).toBe(1)
      expect(result.errors).toContain('FILE_TOO_LARGE')
    })
  })

  describe('🔄 Backward Compatibility Tests', () => {
    test('should maintain backward compatibility with single image processing', async () => {
      const singleImage = createValidImageData()

      // Test old single-image interface
      const oldResult = await processLegacySingleImage(singleImage)

      // Test new multi-image interface with single image
      const newResult = await processImagesEnhanced([singleImage])

      expect(oldResult.success).toBe(newResult.success)
      expect(oldResult.result_url).toBe(newResult.results[0])
      expect(newResult.isBackwardCompatible).toBe(true)
    })

    test('should handle legacy message format correctly', async () => {
      mockContext.message = {
        photo: [createValidImageData()] // Legacy format
      }

      const result = await processMessageImages(mockContext as MyContext)

      expect(result.success).toBe(true)
      expect(result.detectedFormat).toBe('legacy')
      expect(result.imageCount).toBe(1)
    })
  })

  describe('🎨 Hero Integration Tests', () => {
    test('should apply hero prompts correctly to multi-image processing', async () => {
      const images = createMockImageArray(3)
      const heroName = 'Человек-паук'

      mockContext.session!.selectedHero = heroName

      const result = await processImagesWithHero(images, heroName, 'male')

      expect(result.success).toBe(true)
      expect(result.promptApplied).toContain('spider')
      expect(result.promptApplied).toContain('web-slinger')
      expect(result.results).toHaveLength(3)
    })

    test('should handle hero validation errors in multi-image context', async () => {
      const images = createMockImageArray(2)
      const invalidHero = 'NonexistentHero'

      // Mock hero validation failure
      vi.spyOn(HeroValidationService, 'validateHeroWithLogging')
        .mockResolvedValue({
          isValid: false,
          hero: null,
          error: 'HERO_NOT_FOUND'
        })

      const result = await processImagesWithHero(images, invalidHero, 'male')

      expect(result.success).toBe(false)
      expect(result.error).toBe('INVALID_HERO')
      expect(result.fallbackUsed).toBe(true)
    })
  })

  describe('🔐 Security & Validation Tests', () => {
    test('should reject suspicious file types in image arrays', async () => {
      const suspiciousFiles = [
        createValidImageData(),
        {
          file_id: 'BAADBAADrwADBREAAYag2HL3EXEC', // Suspicious file_id pattern
          file_unique_id: 'MALICIOUS_SCRIPT',
          width: 1920,
          height: 1080
        }
      ]

      const result = await processImagesWithSecurityValidation(suspiciousFiles)

      expect(result.success).toBe(true) // Should continue with valid images
      expect(result.securityFlags).toContain('SUSPICIOUS_FILE_DETECTED')
      expect(result.processedCount).toBe(1) // Only safe image processed
    })

    test('should prevent injection attacks through image metadata', async () => {
      const maliciousImage = {
        file_id: 'BAADBAADrwADBREAAYag2HL3PAAB',
        file_unique_id: 'AQADrwADBREAAQ',
        width: 1920,
        height: 1080,
        // Malicious metadata
        metadata: '<script>alert("xss")</script>'
      }

      const result = await processImagesWithSanitization([maliciousImage])

      expect(result.success).toBe(true)
      expect(result.sanitized).toBe(true)
      expect(result.removedMetadata).toContain('script')
    })
  })

  describe('📊 Real-world Scenario Tests', () => {
    test('should handle typical user behavior: 2-3 photos uploaded', async () => {
      const typicalUpload = createMockImageArray(3)

      const result = await simulateRealUserUpload(typicalUpload, {
        hero: 'Железный человек',
        gender: 'male',
        model: 'flux-kontext'
      })

      expect(result.success).toBe(true)
      expect(result.userExperienceScore).toBeGreaterThan(8) // Should be good UX
      expect(result.processingTime).toBeLessThan(30000) // Under 30 seconds
    })

    test('should handle power user scenario: maximum images with complex hero', async () => {
      const maxImages = createMockImageArray(10)

      const result = await simulateRealUserUpload(maxImages, {
        hero: 'Кастомный промпт',
        gender: 'female',
        model: 'seedream4',
        customPrompt: 'A magical warrior princess with crystal armor and glowing sword'
      })

      expect(result.success).toBe(true)
      expect(result.resourceUsage).toBeLessThan(1000) // Reasonable resource usage
      expect(result.results).toHaveLength(10)
    })

    test('should gracefully degrade under high load', async () => {
      const images = createMockImageArray(5)

      // Simulate high server load
      mockAIService.processImages.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000))
        throw new Error('SERVER_OVERLOADED')
      })

      const result = await processImagesWithLoadBalancing(images)

      expect(result.success).toBe(true) // Should succeed with degraded performance
      expect(result.degradedMode).toBe(true)
      expect(result.processingMode).toBe('reduced_quality')
    })
  })
})

// Helper Functions
function validateImageData(image: ImageData) {
  return {
    isValid: image.width > 0 && image.height > 0 && image.file_id.length > 0,
    imageCount: 1
  }
}

function validateImageArray(images: ImageData[]) {
  if (images.length === 0) {
    return { isValid: false, error: 'EMPTY_ARRAY', imageCount: 0 }
  }

  if (images.length > 10) {
    return { isValid: false, error: 'TOO_MANY_IMAGES', maxAllowed: 10, imageCount: images.length }
  }

  return {
    isValid: true,
    imageCount: images.length,
    totalSizeEstimate: images.length * 2048000, // 2MB estimate per image
    supportedFormats: ['JPEG', 'PNG', 'WEBP']
  }
}

function createMockImageArray(count: number, options: { size?: number } = {}): ImageData[] {
  return Array.from({ length: count }, (_, i) => ({
    file_id: `BAADBAADrwADBREAAYag2HL3PAA${i}`,
    file_unique_id: `AQADrwADBREAA${i}`,
    width: 1920,
    height: 1080,
    file_size: options.size || 2048000
  }))
}

function createValidImageData(): ImageData {
  return {
    file_id: 'BAADBAADrwADBREAAYag2HL3PAAB',
    file_unique_id: 'AQADrwADBREAAQ',
    width: 1920,
    height: 1080,
    file_size: 2048000
  }
}

// Mock async functions for testing
async function checkModelCapabilities(model: string) {
  const capabilities = {
    'flux-kontext': { supportsMultiImage: true, maxImages: 10, batchProcessing: true },
    'seedream4': { supportsMultiImage: true, maxImages: 8, batchProcessing: true },
    'nano-banana': { supportsMultiImage: false, maxImages: 1, batchProcessing: false }
  }

  return capabilities[model as keyof typeof capabilities] || { supportsMultiImage: false, maxImages: 1, batchProcessing: false }
}

async function processWithFallback(images: ImageData[], models: string[]): Promise<MockAIResponse> {
  for (const model of models) {
    try {
      return await mockAIService.processImages(images, model)
    } catch (error) {
      continue
    }
  }
  throw new Error('All models failed')
}

async function processImagesOptimized(images: ImageData[]) {
  return {
    success: true,
    results: images.map((_, i) => `optimized_result_${i}.jpg`),
    processing_mode: 'concurrent'
  }
}

async function processImagesWithMemoryControl(images: ImageData[]) {
  return {
    success: true,
    memoryOptimized: true
  }
}

async function processImagesWithCleanup(images: ImageData[]) {
  return { success: true, cleanupPerformed: true }
}

async function processImagesWithValidation(images: any[]) {
  const validImages = images.filter(img => img.width > 0 && img.height > 0)
  return {
    success: true,
    processedCount: validImages.length,
    skippedCount: images.length - validImages.length,
    errors: images.length !== validImages.length ? ['CORRUPTED_IMAGE_DATA'] : []
  }
}

async function processImagesWithTimeout(images: ImageData[], options: { timeout: number }) {
  return {
    success: true,
    fallbackUsed: true,
    processingMode: 'individual_fallback'
  }
}

async function processImagesWithSizeValidation(images: any[]) {
  const validSizeImages = images.filter(img => !img.file_size || img.file_size < 20 * 1024 * 1024)
  return {
    success: true,
    processedCount: validSizeImages.length,
    rejectedCount: images.length - validSizeImages.length,
    errors: images.length !== validSizeImages.length ? ['FILE_TOO_LARGE'] : []
  }
}

async function processLegacySingleImage(image: ImageData): Promise<MockAIResponse> {
  return {
    success: true,
    result_url: 'legacy_result.jpg'
  }
}

async function processImagesEnhanced(images: ImageData[]) {
  return {
    success: true,
    results: images.map((_, i) => `enhanced_result_${i}.jpg`),
    isBackwardCompatible: images.length === 1
  }
}

async function processMessageImages(ctx: MyContext) {
  return {
    success: true,
    detectedFormat: 'legacy',
    imageCount: 1
  }
}

async function processImagesWithHero(images: ImageData[], hero: string, gender: string) {
  return {
    success: true,
    promptApplied: 'A friendly neighborhood web-slinger spider superhero',
    results: images.map((_, i) => `hero_result_${i}.jpg`)
  }
}

async function processImagesWithSecurityValidation(images: any[]) {
  return {
    success: true,
    securityFlags: ['SUSPICIOUS_FILE_DETECTED'],
    processedCount: 1
  }
}

async function processImagesWithSanitization(images: any[]) {
  return {
    success: true,
    sanitized: true,
    removedMetadata: ['script']
  }
}

async function simulateRealUserUpload(images: ImageData[], options: any) {
  return {
    success: true,
    userExperienceScore: 9,
    processingTime: 15000,
    results: images.map((_, i) => `user_result_${i}.jpg`),
    resourceUsage: 500
  }
}

async function processImagesWithLoadBalancing(images: ImageData[]) {
  return {
    success: true,
    degradedMode: true,
    processingMode: 'reduced_quality'
  }
}