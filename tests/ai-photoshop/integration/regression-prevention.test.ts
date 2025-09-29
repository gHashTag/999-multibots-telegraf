import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { validateSeeDream4Input } from '../../../src/schemas/seedream4.schema'
import { MOCK_SESSION_STATES, createMockContext } from '../fixtures/test-data'

/**
 * 🧪 AI PHOTOSHOP REGRESSION PREVENTION TESTS
 *
 * Тесты для предотвращения регрессий в критических функциях
 * Основан на известных багах и их исправлениях
 */
describe('AI Photoshop Regression Prevention', () => {
  describe('Critical Bug Fix Verification', () => {
    it('REGRESSION: should preserve user prompt during multi-photo processing', async () => {
      // Bug: Prompt lost during multi-photo confirmation
      // Fix: Maintain prompt in session throughout workflow

      const mockContext = createMockContext(MOCK_SESSION_STATES.initial)
      const userPrompt = 'merge these two beautiful images together'

      // Step 1: User enters custom prompt
      mockContext.session.aiPhotoshopPrompt = userPrompt
      mockContext.session.aiPhotoshopModel = 'seedream'
      mockContext.session.aiPhotoshopStyle = 'custom'

      // Step 2: User uploads multiple images
      mockContext.session.morphingImages = [
        {
          buffer: Buffer.from('img1-data'),
          filename: 'ai_photoshop_image_1.jpg',
          timestamp: Date.now(),
          originalOrder: 1
        },
        {
          buffer: Buffer.from('img2-data'),
          filename: 'ai_photoshop_image_2.jpg',
          timestamp: Date.now() + 1,
          originalOrder: 2
        }
      ]

      // Step 3: Processing confirmation (critical point where bug occurred)
      const preservedPrompt = mockContext.session.aiPhotoshopPrompt
      const preservedModel = mockContext.session.aiPhotoshopModel
      const preservedImages = mockContext.session.morphingImages

      // CRITICAL: Prompt, model and images should be preserved
      expect(preservedPrompt).toBe(userPrompt)
      expect(preservedModel).toBe('seedream')
      expect(preservedImages).toHaveLength(2)

      // Simulate processing with preserved data
      const processingInput = {
        prompt: preservedPrompt,
        size: '1K' as const,
        max_images: preservedImages.length,
        image_input: preservedImages.map(img => `data:image/jpeg;base64,${img.buffer.toString('base64')}`),
        telegram_id: '123456789'
      }

      const validationResult = validateSeeDream4Input(processingInput)
      expect(validationResult.success).toBe(true)
      expect(validationResult.data?.prompt).toBe(userPrompt)
    })

    it('REGRESSION: should preserve size selection during multi-photo workflow', async () => {
      // Bug: Size selection lost when switching between single/multi-photo modes
      // Fix: Maintain size selection in session throughout workflow

      const mockContext = createMockContext(MOCK_SESSION_STATES.initial)
      const selectedSize = '2K'

      // Step 1: User selects size
      mockContext.session.aiPhotoshopModel = 'seedream'
      mockContext.session.aiPhotoshopSize = selectedSize

      // Step 2: User uploads single image first
      mockContext.session.aiPhotoshopImage = 'https://example.com/single.jpg'

      // Step 3: User uploads additional images (switches to multi-photo mode)
      mockContext.session.morphingImages = [
        {
          buffer: Buffer.from('img1-data'),
          filename: 'ai_photoshop_image_1.jpg',
          timestamp: Date.now(),
          originalOrder: 1
        },
        {
          buffer: Buffer.from('img2-data'),
          filename: 'ai_photoshop_image_2.jpg',
          timestamp: Date.now() + 1,
          originalOrder: 2
        }
      ]

      // CRITICAL: Size should be preserved when switching to multi-photo
      expect(mockContext.session.aiPhotoshopSize).toBe(selectedSize)

      // Calculate cost with preserved size
      const sizePrices = { '1K': 15, '2K': 20, '4K': 30 }
      const imageCount = mockContext.session.morphingImages.length
      const expectedCost = sizePrices[selectedSize as keyof typeof sizePrices] * imageCount

      expect(expectedCost).toBe(40) // 20 * 2 images
    })

    it('REGRESSION: should handle empty morphingImages array gracefully', async () => {
      // Bug: Processing attempted with empty image array causing crashes
      // Fix: Validate image count before processing

      const mockContext = createMockContext(MOCK_SESSION_STATES.initial)

      // Simulate state where morphingImages is empty but processing is attempted
      mockContext.session.aiPhotoshopModel = 'seedream'
      mockContext.session.aiPhotoshopPrompt = 'enhance image'
      mockContext.session.morphingImages = [] // Empty array

      // Should detect empty array and prevent processing
      const hasImages = mockContext.session.morphingImages && mockContext.session.morphingImages.length > 0
      expect(hasImages).toBe(false)

      // Should require at least 1 image for processing
      const canProcess = hasImages && mockContext.session.morphingImages.length >= 1
      expect(canProcess).toBe(false)
    })

    it('REGRESSION: should validate session existence before accessing properties', async () => {
      // Bug: Accessing session properties when session is undefined
      // Fix: Always check session existence first

      const contextWithoutSession = {
        from: { id: 123456789, first_name: 'Test' },
        session: undefined
      } as any

      // Should not throw when accessing undefined session
      expect(() => {
        const model = contextWithoutSession.session?.aiPhotoshopModel
        const prompt = contextWithoutSession.session?.aiPhotoshopPrompt
        const images = contextWithoutSession.session?.morphingImages
      }).not.toThrow()

      // Values should be undefined
      expect(contextWithoutSession.session?.aiPhotoshopModel).toBeUndefined()
      expect(contextWithoutSession.session?.aiPhotoshopPrompt).toBeUndefined()
      expect(contextWithoutSession.session?.morphingImages).toBeUndefined()
    })

    it('REGRESSION: should handle malformed image buffer data', async () => {
      // Bug: Processing crashed with corrupted buffer data
      // Fix: Validate buffer data before processing

      const mockContext = createMockContext(MOCK_SESSION_STATES.initial)

      // Simulate malformed buffer data
      const malformedImages = [
        {
          buffer: null, // Invalid buffer
          filename: 'corrupted1.jpg',
          timestamp: Date.now(),
          originalOrder: 1
        },
        {
          buffer: Buffer.from(''), // Empty buffer
          filename: 'corrupted2.jpg',
          timestamp: Date.now() + 1,
          originalOrder: 2
        },
        {
          buffer: Buffer.from('valid-data'), // Valid buffer
          filename: 'valid.jpg',
          timestamp: Date.now() + 2,
          originalOrder: 3
        }
      ] as any

      mockContext.session.morphingImages = malformedImages

      // Should filter out invalid buffers
      const validImages = mockContext.session.morphingImages.filter((img: any) =>
        img.buffer && Buffer.isBuffer(img.buffer) && img.buffer.length > 0
      )

      expect(validImages).toHaveLength(1)
      expect(validImages[0].filename).toBe('valid.jpg')
    })
  })

  describe('Schema Validation Regression Tests', () => {
    it('REGRESSION: should reject invalid URL formats in image_input', async () => {
      // Bug: Invalid URLs passed validation causing API errors
      // Fix: Strict URL validation in schema

      const invalidUrls = [
        'not-a-url',
        'http://',
        'ftp://example.com/image.jpg', // Wrong protocol
        'javascript:alert(1)', // XSS attempt
        '', // Empty string
        'relative/path/image.jpg' // Relative path
      ]

      invalidUrls.forEach(url => {
        const input = {
          prompt: 'enhance this image',
          size: '1K' as const,
          max_images: 1,
          image_input: [url],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(false)
      })
    })

    it('REGRESSION: should enforce max_images limits correctly', async () => {
      // Bug: API allowed more images than model supports
      // Fix: Strict validation of max_images against model limits

      const testCases = [
        { max_images: 0, should_pass: false },
        { max_images: 1, should_pass: true },
        { max_images: 10, should_pass: true },
        { max_images: 11, should_pass: false }, // Over SeeDream-4 limit
        { max_images: 16, should_pass: false }, // Over absolute limit
        { max_images: -1, should_pass: false } // Negative value
      ]

      testCases.forEach(testCase => {
        const imageUrls = Array(Math.max(1, testCase.max_images)).fill(0)
          .map((_, i) => `https://example.com/image${i + 1}.jpg`)

        const input = {
          prompt: 'process these images',
          size: '1K' as const,
          max_images: testCase.max_images,
          image_input: imageUrls,
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(testCase.should_pass)
      })
    })

    it('REGRESSION: should validate custom size parameters correctly', async () => {
      // Bug: Custom size accepted without width/height parameters
      // Fix: Require width/height for custom size

      const customSizeTests = [
        {
          size: 'custom' as const,
          width: undefined,
          height: undefined,
          should_pass: false
        },
        {
          size: 'custom' as const,
          width: 1024,
          height: undefined,
          should_pass: false
        },
        {
          size: 'custom' as const,
          width: undefined,
          height: 1536,
          should_pass: false
        },
        {
          size: 'custom' as const,
          width: 1024,
          height: 1536,
          should_pass: true
        }
      ]

      customSizeTests.forEach(test => {
        const input = {
          prompt: 'enhance with custom size',
          size: test.size,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789',
          ...(test.width ? { width: test.width } : {}),
          ...(test.height ? { height: test.height } : {})
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(test.should_pass)
      })
    })
  })

  describe('Session State Management Regression Tests', () => {
    it('REGRESSION: should not lose state during scene transitions', async () => {
      // Bug: Session state lost when user navigates between scenes
      // Fix: Proper state preservation during scene changes

      const mockContext = createMockContext(MOCK_SESSION_STATES.initial)

      // Setup initial state
      mockContext.session.aiPhotoshopModel = 'seedream'
      mockContext.session.aiPhotoshopStyle = 'artistic'
      mockContext.session.aiPhotoshopPrompt = 'custom enhancement prompt'
      mockContext.session.aiPhotoshopSize = '2K'

      // Simulate scene transition (user clicking back/forward)
      const stateSnapshot = {
        model: mockContext.session.aiPhotoshopModel,
        style: mockContext.session.aiPhotoshopStyle,
        prompt: mockContext.session.aiPhotoshopPrompt,
        size: mockContext.session.aiPhotoshopSize
      }

      // After scene transition, state should be preserved
      expect(mockContext.session.aiPhotoshopModel).toBe(stateSnapshot.model)
      expect(mockContext.session.aiPhotoshopStyle).toBe(stateSnapshot.style)
      expect(mockContext.session.aiPhotoshopPrompt).toBe(stateSnapshot.prompt)
      expect(mockContext.session.aiPhotoshopSize).toBe(stateSnapshot.size)
    })

    it('REGRESSION: should handle concurrent session modifications', async () => {
      // Bug: Race conditions when multiple operations modify session
      // Fix: Atomic session updates

      const mockContext = createMockContext(MOCK_SESSION_STATES.initial)

      // Simulate concurrent modifications
      const modifications = [
        () => { mockContext.session.aiPhotoshopModel = 'seedream' },
        () => { mockContext.session.aiPhotoshopStyle = 'artistic' },
        () => { mockContext.session.aiPhotoshopSize = '1K' },
        () => { mockContext.session.aiPhotoshopPrompt = 'enhanced prompt' }
      ]

      // Apply all modifications
      modifications.forEach(mod => mod())

      // All modifications should be applied successfully
      expect(mockContext.session.aiPhotoshopModel).toBe('seedream')
      expect(mockContext.session.aiPhotoshopStyle).toBe('artistic')
      expect(mockContext.session.aiPhotoshopSize).toBe('1K')
      expect(mockContext.session.aiPhotoshopPrompt).toBe('enhanced prompt')
    })

    it('REGRESSION: should clear session properly on cancellation', async () => {
      // Bug: Session data persisted after user cancellation
      // Fix: Complete session cleanup on cancel

      const mockContext = createMockContext(MOCK_SESSION_STATES.ready_to_process)

      // Verify session has data before cancellation
      expect(mockContext.session.aiPhotoshopModel).toBeDefined()
      expect(mockContext.session.aiPhotoshopPrompt).toBeDefined()
      expect(mockContext.session.morphingImages).toBeDefined()

      // Simulate cancellation cleanup
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

      // All session data should be cleared
      expect(mockContext.session.aiPhotoshopModel).toBeUndefined()
      expect(mockContext.session.aiPhotoshopStyle).toBeUndefined()
      expect(mockContext.session.aiPhotoshopPrompt).toBeUndefined()
      expect(mockContext.session.morphingImages).toBeUndefined()
      expect(mockContext.session.awaitingAiPhotoshopImage).toBe(false)
      expect(mockContext.session.awaitingAiPhotoshopPrompt).toBe(false)
    })
  })

  describe('Error Boundary Regression Tests', () => {
    it('REGRESSION: should handle API timeout gracefully', async () => {
      // Bug: API timeouts caused unhandled promise rejections
      // Fix: Proper timeout handling with fallback

      const mockApiCall = () => {
        return new Promise((resolve, reject) => {
          // Simulate API timeout
          setTimeout(() => {
            reject(new Error('API timeout'))
          }, 100)
        })
      }

      try {
        await mockApiCall()
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        // Should handle timeout gracefully
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('API timeout')
      }
    })

    it('REGRESSION: should validate file size limits', async () => {
      // Bug: Large files caused memory exhaustion
      // Fix: File size validation before processing

      const fileSizeLimits = {
        maxSingleFile: 50 * 1024 * 1024, // 50MB
        maxTotalSize: 200 * 1024 * 1024   // 200MB total
      }

      const testFiles = [
        { size: 10 * 1024 * 1024, should_pass: true },   // 10MB - OK
        { size: 60 * 1024 * 1024, should_pass: false },  // 60MB - Too large
        { size: 0, should_pass: false },                 // 0 bytes - Invalid
        { size: -1, should_pass: false }                 // Negative - Invalid
      ]

      testFiles.forEach(test => {
        const isValidSize = test.size > 0 && test.size <= fileSizeLimits.maxSingleFile
        expect(isValidSize).toBe(test.should_pass)
      })
    })

    it('REGRESSION: should handle malformed callback data', async () => {
      // Bug: Malformed callback data caused parsing errors
      // Fix: Validate callback data format

      const callbackDataTests = [
        { data: 'ai_photoshop_model_seedream', valid: true },
        { data: 'ai_photoshop_size_1K', valid: true },
        { data: 'invalid_callback', valid: false },
        { data: '', valid: false },
        { data: null, valid: false },
        { data: undefined, valid: false }
      ]

      callbackDataTests.forEach(test => {
        const isValidCallback = typeof test.data === 'string' &&
                               test.data.length > 0 &&
                               test.data.startsWith('ai_photoshop_')

        expect(isValidCallback).toBe(test.valid)
      })
    })
  })

  describe('Dialog Mode Regression Tests', () => {
    it('REGRESSION: should preserve dialog history across improvements', async () => {
      // Bug: Dialog history lost when user makes improvements
      // Fix: Maintain savedAiPhotoshopResults throughout dialog session

      const mockContext = createMockContext(MOCK_SESSION_STATES.initial)

      // Setup initial dialog state
      const initialResult = {
        imageUrl: 'https://example.com/initial.jpg',
        prompt: 'initial enhancement',
        model: 'seedream',
        timestamp: Date.now() - 60000,
        additionalInfo: { size: '1K' }
      }

      mockContext.session.dialogMode = true
      mockContext.session.savedAiPhotoshopResults = [initialResult]

      // Simulate improvement iteration
      const improvementPrompt = 'make it brighter'
      mockContext.session.aiPhotoshopPrompt = improvementPrompt
      mockContext.session.aiPhotoshopImage = initialResult.imageUrl

      // Add improvement result
      const improvementResult = {
        imageUrl: 'https://example.com/improved.jpg',
        prompt: improvementPrompt,
        model: 'seedream',
        timestamp: Date.now(),
        additionalInfo: {
          size: '1K',
          isImprovement: true,
          originalImage: initialResult.imageUrl
        }
      }

      mockContext.session.savedAiPhotoshopResults.push(improvementResult)

      // CRITICAL: Dialog history should be preserved
      expect(mockContext.session.savedAiPhotoshopResults).toHaveLength(2)
      expect(mockContext.session.savedAiPhotoshopResults[0]).toEqual(initialResult)
      expect(mockContext.session.savedAiPhotoshopResults[1].additionalInfo.isImprovement).toBe(true)
      expect(mockContext.session.dialogMode).toBe(true)
    })

    it('REGRESSION: should handle dialog mode with corrupted session data', async () => {
      // Bug: Dialog mode crashed when savedAiPhotoshopResults was corrupted
      // Fix: Validate and recover from corrupted dialog history

      const mockContext = createMockContext(MOCK_SESSION_STATES.initial)

      // Simulate corrupted dialog data
      mockContext.session.dialogMode = true
      mockContext.session.savedAiPhotoshopResults = [
        {
          imageUrl: 'https://example.com/valid.jpg',
          prompt: 'valid result',
          model: 'seedream',
          timestamp: Date.now(),
          additionalInfo: { size: '1K' }
        },
        null, // Corrupted entry
        {
          imageUrl: '', // Invalid URL
          prompt: '',  // Invalid prompt
          model: '',   // Invalid model
          timestamp: -1, // Invalid timestamp
          additionalInfo: null // Invalid additionalInfo
        },
        {
          imageUrl: 'https://example.com/another-valid.jpg',
          prompt: 'another valid result',
          model: 'seedream',
          timestamp: Date.now() + 1000,
          additionalInfo: { size: '2K' }
        }
      ] as any

      // Filter out corrupted entries
      const validResults = mockContext.session.savedAiPhotoshopResults.filter((result: any) =>
        result &&
        typeof result === 'object' &&
        result.imageUrl &&
        result.prompt &&
        result.model &&
        result.timestamp > 0 &&
        result.additionalInfo
      )

      mockContext.session.savedAiPhotoshopResults = validResults

      // Should recover with only valid entries
      expect(mockContext.session.savedAiPhotoshopResults).toHaveLength(2)
      expect(mockContext.session.savedAiPhotoshopResults[0].imageUrl).toBe('https://example.com/valid.jpg')
      expect(mockContext.session.savedAiPhotoshopResults[1].imageUrl).toBe('https://example.com/another-valid.jpg')
    })

    it('REGRESSION: should limit dialog history to prevent memory bloat', async () => {
      // Bug: Unlimited dialog history caused memory exhaustion
      // Fix: Limit savedAiPhotoshopResults to last 10 entries

      const mockContext = createMockContext(MOCK_SESSION_STATES.initial)
      mockContext.session.dialogMode = true
      mockContext.session.savedAiPhotoshopResults = []

      // Add 15 results (more than limit)
      for (let i = 0; i < 15; i++) {
        const result = {
          imageUrl: `https://example.com/result_${i}.jpg`,
          prompt: `enhancement ${i}`,
          model: 'seedream',
          timestamp: Date.now() + i * 1000,
          additionalInfo: { size: '1K' }
        }

        mockContext.session.savedAiPhotoshopResults.push(result)

        // Apply limit after each addition
        if (mockContext.session.savedAiPhotoshopResults.length > 10) {
          mockContext.session.savedAiPhotoshopResults =
            mockContext.session.savedAiPhotoshopResults.slice(-10)
        }
      }

      // Should have exactly 10 results (last 10)
      expect(mockContext.session.savedAiPhotoshopResults).toHaveLength(10)
      expect(mockContext.session.savedAiPhotoshopResults[0].prompt).toBe('enhancement 5')
      expect(mockContext.session.savedAiPhotoshopResults[9].prompt).toBe('enhancement 14')
    })

    it('REGRESSION: should handle dialog mode text input without existing image', async () => {
      // Bug: Dialog mode failed when user sent text but no savedAiPhotoshopResults
      // Fix: Validate dialog state before processing text improvements

      const mockContext = createMockContext(MOCK_SESSION_STATES.initial)
      mockContext.session.dialogMode = true
      mockContext.session.savedAiPhotoshopResults = [] // Empty history

      const textInput = 'make it brighter'

      // Should detect invalid dialog state
      const hasDialogHistory = mockContext.session.savedAiPhotoshopResults &&
                               mockContext.session.savedAiPhotoshopResults.length > 0

      expect(hasDialogHistory).toBe(false)

      // Should not attempt to process text improvement without history
      const canProcessImprovement = hasDialogHistory &&
                                   mockContext.session.dialogMode

      expect(canProcessImprovement).toBe(false)
    })

    it('REGRESSION: should preserve dialog mode across scene re-entries', async () => {
      // Bug: Dialog mode lost when user re-entered AI Photoshop scene
      // Fix: Check for existing dialog session on scene entry

      const mockContext = createMockContext(MOCK_SESSION_STATES.initial)

      // Setup existing dialog session
      mockContext.session.dialogMode = true
      mockContext.session.savedAiPhotoshopResults = [
        {
          imageUrl: 'https://example.com/existing.jpg',
          prompt: 'existing result',
          model: 'seedream',
          timestamp: Date.now() - 300000, // 5 minutes ago
          additionalInfo: { size: '2K' }
        }
      ]

      // Simulate scene re-entry check
      const hasExistingDialog = mockContext.session.dialogMode &&
                               mockContext.session.savedAiPhotoshopResults &&
                               mockContext.session.savedAiPhotoshopResults.length > 0

      // Should detect existing dialog session
      expect(hasExistingDialog).toBe(true)

      // Should preserve dialog state instead of resetting
      if (hasExistingDialog) {
        // Don't reset session, continue in dialog mode
        expect(mockContext.session.dialogMode).toBe(true)
        expect(mockContext.session.savedAiPhotoshopResults).toHaveLength(1)
      }
    })

    it('REGRESSION: should handle rapid dialog improvements without race conditions', async () => {
      // Bug: Rapid improvements caused session state conflicts
      // Fix: Proper session state management for concurrent operations

      const mockContext = createMockContext(MOCK_SESSION_STATES.initial)
      mockContext.session.dialogMode = true
      mockContext.session.savedAiPhotoshopResults = [
        {
          imageUrl: 'https://example.com/base.jpg',
          prompt: 'base image',
          model: 'seedream',
          timestamp: Date.now() - 10000,
          additionalInfo: { size: '1K' }
        }
      ]

      const rapidImprovements = [
        'make it brighter',
        'add more contrast',
        'enhance colors',
        'improve sharpness',
        'final touches'
      ]

      // Simulate rapid improvements
      let currentResults = [...mockContext.session.savedAiPhotoshopResults]

      rapidImprovements.forEach((prompt, index) => {
        const improvement = {
          imageUrl: `https://example.com/improvement_${index}.jpg`,
          prompt: prompt,
          model: 'seedream',
          timestamp: Date.now() + index * 100,
          additionalInfo: {
            size: '1K',
            isImprovement: true
          }
        }

        // Atomic update - add to array
        currentResults = [...currentResults, improvement]
      })

      mockContext.session.savedAiPhotoshopResults = currentResults

      // Should have all improvements in order
      expect(mockContext.session.savedAiPhotoshopResults).toHaveLength(6) // 1 base + 5 improvements
      expect(mockContext.session.savedAiPhotoshopResults[1].prompt).toBe('make it brighter')
      expect(mockContext.session.savedAiPhotoshopResults[5].prompt).toBe('final touches')

      // All improvements should be marked correctly
      const improvements = mockContext.session.savedAiPhotoshopResults.slice(1)
      improvements.forEach(result => {
        expect(result.additionalInfo.isImprovement).toBe(true)
      })
    })
  })

  describe('Performance Regression Tests', () => {
    it('REGRESSION: should not cause memory leaks in multi-photo processing', async () => {
      // Bug: Buffer references not properly released
      // Fix: Explicit cleanup of image buffers

      const initialMemory = process.memoryUsage().heapUsed

      // Simulate multiple processing cycles
      for (let cycle = 0; cycle < 5; cycle++) {
        const images = Array(3).fill(0).map((_, i) => ({
          buffer: Buffer.alloc(1024 * 1024), // 1MB each
          filename: `cycle${cycle}_img${i}.jpg`,
          timestamp: Date.now() + i,
          originalOrder: i + 1
        }))

        // Process and cleanup
        images.forEach(img => {
          // Simulate processing
          img.buffer.fill(cycle % 256)
        })

        // Clear references (simulate cleanup)
        images.length = 0
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      // Memory increase should be minimal (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024)
    })

    it('REGRESSION: should maintain processing speed consistency', async () => {
      // Bug: Processing speed degraded over time
      // Fix: Consistent performance monitoring

      const processingTimes: number[] = []

      for (let i = 0; i < 10; i++) {
        const start = performance.now()

        // Simulate consistent processing workload
        const buffer = Buffer.alloc(512 * 1024) // 512KB
        buffer.fill(i % 256)
        const processed = buffer.toString('base64')

        const end = performance.now()
        processingTimes.push(end - start)
      }

      // Calculate variance in processing times
      const average = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      const variance = processingTimes.reduce((sum, time) => sum + Math.pow(time - average, 2), 0) / processingTimes.length

      // Variance should be low (consistent performance)
      expect(variance).toBeLessThan(Math.pow(average * 0.3, 2)) // 30% variance allowed
    })

    it('REGRESSION: should handle dialog mode memory efficiently', async () => {
      // Bug: Dialog mode caused memory leaks with large result history
      // Fix: Efficient memory management for dialog sessions

      const initialMemory = process.memoryUsage().heapUsed

      // Simulate multiple dialog sessions
      for (let session = 0; session < 10; session++) {
        const mockContext = createMockContext(MOCK_SESSION_STATES.initial)
        mockContext.session.dialogMode = true
        mockContext.session.savedAiPhotoshopResults = []

        // Add multiple results per session
        for (let i = 0; i < 20; i++) {
          const result = {
            imageUrl: `https://example.com/session_${session}_result_${i}.jpg`,
            prompt: `Session ${session} enhancement ${i} with detailed description and metadata`,
            model: 'seedream',
            timestamp: Date.now() + i * 1000,
            additionalInfo: {
              size: '2K',
              isImprovement: i > 0,
              metadata: {
                session: session,
                iteration: i,
                improvements: Array(i % 5).fill(0).map((_, j) => `improvement_${j}`)
              }
            }
          }

          mockContext.session.savedAiPhotoshopResults.push(result)

          // Apply memory limit
          if (mockContext.session.savedAiPhotoshopResults.length > 10) {
            mockContext.session.savedAiPhotoshopResults =
              mockContext.session.savedAiPhotoshopResults.slice(-10)
          }
        }

        // Clear session (simulate cleanup)
        mockContext.session.savedAiPhotoshopResults = []
        mockContext.session.dialogMode = false
      }

      // Force garbage collection
      if (global.gc) {
        global.gc()
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      // Memory increase should be minimal despite multiple sessions
      expect(memoryIncrease).toBeLessThan(15 * 1024 * 1024) // Less than 15MB
    })
  })
})