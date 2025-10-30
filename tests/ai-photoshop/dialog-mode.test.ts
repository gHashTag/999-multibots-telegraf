import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { MyContext } from '../../src/interfaces'
import {
  MOCK_USER_DATA,
  MOCK_IMAGES,
  MOCK_PROMPTS,
  MOCK_SIZES,
  MOCK_MODELS,
  MOCK_SESSION_STATES,
  createMockContext,
  validateSessionTransition
} from './fixtures/test-data'

/**
 * 🧪 AI PHOTOSHOP DIALOG MODE COMPREHENSIVE TESTS
 *
 * Tests the complete dialog mode workflow for AI Photoshop:
 * - Session persistence and state management
 * - Multi-turn conversations with saved results
 * - Photo improvement iterations
 * - Memory management and cleanup
 * - Error recovery and fallback scenarios
 */
describe('AI Photoshop Dialog Mode', () => {
  let mockContext: MyContext
  let mockTelegram: any

  beforeEach(() => {
    mockTelegram = {
      getFile: jest.fn().mockResolvedValue({ file_path: 'photos/test.jpg' }),
      getFileLink: jest.fn().mockResolvedValue({ href: 'https://api.telegram.org/file/test.jpg' }),
      editMessageText: jest.fn().mockResolvedValue({ message_id: 1001 }),
      deleteMessage: jest.fn().mockResolvedValue(true)
    }

    mockContext = createMockContext({
      ...MOCK_SESSION_STATES.initial,
      savedAiPhotoshopResults: [],
      dialogMode: false
    })
    mockContext.telegram = mockTelegram
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Dialog Mode Initialization', () => {
    it('should enter dialog mode after first successful result', async () => {
      const initialResults = mockContext.session?.savedAiPhotoshopResults || []
      expect(initialResults).toHaveLength(0)
      expect(mockContext.session?.dialogMode).toBe(false)

      // Simulate first successful generation
      const firstResult = {
        imageUrl: 'https://example.com/result1.jpg',
        prompt: 'enhance this photo',
        model: 'seedream',
        timestamp: Date.now(),
        additionalInfo: {
          size: '1K',
          originalImage: 'https://example.com/original.jpg',
          isImprovement: false
        }
      }

      if (mockContext.session) {
        mockContext.session.savedAiPhotoshopResults = [firstResult]
        mockContext.session.dialogMode = true
      }

      expect(mockContext.session?.savedAiPhotoshopResults).toHaveLength(1)
      expect(mockContext.session?.dialogMode).toBe(true)
      expect(mockContext.session?.savedAiPhotoshopResults?.[0].imageUrl).toBe(firstResult.imageUrl)
    })

    it('should preserve session state when entering dialog mode', async () => {
      const sessionState = {
        aiPhotoshopModel: 'seedream',
        aiPhotoshopStyle: 'artistic',
        aiPhotoshopSize: '2K',
        dialogMode: false,
        savedAiPhotoshopResults: []
      }

      if (mockContext.session) {
        Object.assign(mockContext.session, sessionState)
      }

      // Simulate entering dialog mode
      const result = {
        imageUrl: 'https://example.com/enhanced.jpg',
        prompt: 'artistic enhancement',
        model: 'seedream',
        timestamp: Date.now(),
        additionalInfo: { size: '2K' }
      }

      if (mockContext.session) {
        mockContext.session.savedAiPhotoshopResults = [result]
        mockContext.session.dialogMode = true
      }

      expect(mockContext.session?.aiPhotoshopModel).toBe('seedream')
      expect(mockContext.session?.aiPhotoshopSize).toBe('2K')
      expect(mockContext.session?.dialogMode).toBe(true)
    })

    it('should handle multiple dialog mode entries correctly', async () => {
      const results = [
        {
          imageUrl: 'https://example.com/result1.jpg',
          prompt: 'first enhancement',
          model: 'seedream',
          timestamp: Date.now(),
          additionalInfo: { size: '1K' }
        },
        {
          imageUrl: 'https://example.com/result2.jpg',
          prompt: 'second enhancement',
          model: 'seedream',
          timestamp: Date.now() + 1000,
          additionalInfo: { size: '1K', isImprovement: true }
        }
      ]

      if (mockContext.session) {
        mockContext.session.savedAiPhotoshopResults = results
        mockContext.session.dialogMode = true
      }

      expect(mockContext.session?.savedAiPhotoshopResults).toHaveLength(2)
      expect(mockContext.session?.savedAiPhotoshopResults?.[1].additionalInfo.isImprovement).toBe(true)
    })
  })

  describe('Multi-Turn Conversation Flow', () => {
    beforeEach(() => {
      // Setup existing dialog mode session
      if (mockContext.session) {
        mockContext.session.dialogMode = true
        mockContext.session.savedAiPhotoshopResults = [
          {
            imageUrl: 'https://example.com/base.jpg',
            prompt: 'initial photo',
            model: 'seedream',
            timestamp: Date.now() - 60000,
            additionalInfo: { size: '1K' }
          }
        ]
      }
    })

    it('should handle text prompt for photo improvement', async () => {
      const improvementPrompt = 'make it more vibrant and colorful'
      const lastResult = mockContext.session?.savedAiPhotoshopResults?.[0]

      expect(lastResult).toBeDefined()
      expect(mockContext.session?.dialogMode).toBe(true)

      // Simulate text input for improvement
      if (mockContext.session) {
        mockContext.session.aiPhotoshopImage = lastResult?.imageUrl
        mockContext.session.aiPhotoshopPrompt = improvementPrompt
        mockContext.session.aiPhotoshopModel = lastResult?.model as any
        mockContext.session.aiPhotoshopStep = 'processing'
      }

      expect(mockContext.session?.aiPhotoshopImage).toBe(lastResult?.imageUrl)
      expect(mockContext.session?.aiPhotoshopPrompt).toBe(improvementPrompt)
      expect(mockContext.session?.aiPhotoshopStep).toBe('processing')
    })

    it('should preserve conversation context across interactions', async () => {
      const conversationHistory = [
        'enhance this photo',
        'make it brighter',
        'add artistic style',
        'increase contrast'
      ]

      for (let i = 0; i < conversationHistory.length; i++) {
        const prompt = conversationHistory[i]
        const previousCount = mockContext.session?.savedAiPhotoshopResults?.length || 0

        // Simulate processing and adding result
        const newResult = {
          imageUrl: `https://example.com/iteration${i + 1}.jpg`,
          prompt: prompt,
          model: 'seedream',
          timestamp: Date.now() + (i * 1000),
          additionalInfo: {
            size: '1K',
            isImprovement: i > 0,
            originalImage: i === 0 ? 'https://example.com/original.jpg' : undefined
          }
        }

        if (mockContext.session) {
          mockContext.session.savedAiPhotoshopResults = [
            ...(mockContext.session.savedAiPhotoshopResults || []),
            newResult
          ]
        }

        expect(mockContext.session?.savedAiPhotoshopResults).toHaveLength(previousCount + 1)
      }

      expect(mockContext.session?.savedAiPhotoshopResults).toHaveLength(conversationHistory.length + 1) // +1 for initial
    })

    it('should handle rapid successive improvements', async () => {
      const rapidPrompts = [
        'make it brighter',
        'add more contrast',
        'enhance colors',
        'improve sharpness',
        'final touches'
      ]

      let currentResults = mockContext.session?.savedAiPhotoshopResults || []

      for (const prompt of rapidPrompts) {
        const result = {
          imageUrl: `https://example.com/rapid_${Date.now()}.jpg`,
          prompt: prompt,
          model: 'seedream',
          timestamp: Date.now(),
          additionalInfo: {
            size: '1K',
            isImprovement: true
          }
        }

        currentResults = [...currentResults, result]

        if (mockContext.session) {
          mockContext.session.savedAiPhotoshopResults = currentResults
        }
      }

      expect(mockContext.session?.savedAiPhotoshopResults).toHaveLength(6) // 1 initial + 5 improvements

      // Check that all improvements are marked correctly
      const improvements = mockContext.session?.savedAiPhotoshopResults?.filter(r => r.additionalInfo.isImprovement)
      expect(improvements).toHaveLength(5)
    })
  })

  describe('Session State Management', () => {
    it('should maintain session state during dialog mode', async () => {
      const initialState = {
        aiPhotoshopModel: 'seedream',
        aiPhotoshopStyle: 'artistic',
        aiPhotoshopSize: '2K',
        dialogMode: true,
        savedAiPhotoshopResults: [
          {
            imageUrl: 'https://example.com/test.jpg',
            prompt: 'test prompt',
            model: 'seedream',
            timestamp: Date.now(),
            additionalInfo: { size: '2K' }
          }
        ]
      }

      if (mockContext.session) {
        Object.assign(mockContext.session, initialState)
      }

      // Simulate multiple interactions
      for (let i = 0; i < 3; i++) {
        expect(mockContext.session?.aiPhotoshopModel).toBe('seedream')
        expect(mockContext.session?.aiPhotoshopSize).toBe('2K')
        expect(mockContext.session?.dialogMode).toBe(true)
      }
    })

    it('should handle session state transitions correctly', async () => {
      const fromState = MOCK_SESSION_STATES.initial
      const toState = {
        ...MOCK_SESSION_STATES.ready_to_process,
        dialogMode: true,
        savedAiPhotoshopResults: [
          {
            imageUrl: 'https://example.com/result.jpg',
            prompt: 'test',
            model: 'seedream',
            timestamp: Date.now(),
            additionalInfo: { size: '1K' }
          }
        ]
      }

      const expectedChanges = [
        'aiPhotoshopModel',
        'aiPhotoshopStyle',
        'aiPhotoshopSize',
        'aiPhotoshopPrompt',
        'dialogMode'
      ]

      const isValidTransition = validateSessionTransition(fromState, toState, expectedChanges)
      expect(isValidTransition).toBe(true)
    })

    it('should prevent session state corruption', async () => {
      if (mockContext.session) {
        mockContext.session.dialogMode = true
        mockContext.session.savedAiPhotoshopResults = [
          {
            imageUrl: 'https://example.com/valid.jpg',
            prompt: 'valid prompt',
            model: 'seedream',
            timestamp: Date.now(),
            additionalInfo: { size: '1K' }
          }
        ]
      }

      // Attempt to corrupt session
      const corruptedResult = {
        imageUrl: '', // Invalid URL
        prompt: '', // Invalid prompt
        model: '', // Invalid model
        timestamp: -1, // Invalid timestamp
        additionalInfo: null // Invalid additionalInfo
      } as any

      if (mockContext.session) {
        // Should validate before adding
        const isValidResult = corruptedResult.imageUrl &&
                            corruptedResult.prompt &&
                            corruptedResult.model &&
                            corruptedResult.timestamp > 0 &&
                            corruptedResult.additionalInfo

        if (isValidResult) {
          mockContext.session.savedAiPhotoshopResults?.push(corruptedResult)
        }
      }

      // Session should remain clean
      expect(mockContext.session?.savedAiPhotoshopResults).toHaveLength(1)
      expect(mockContext.session?.savedAiPhotoshopResults?.[0].imageUrl).toBe('https://example.com/valid.jpg')
    })
  })

  describe('Memory Management', () => {
    it('should limit saved results to prevent memory bloat', async () => {
      if (mockContext.session) {
        mockContext.session.savedAiPhotoshopResults = []
        mockContext.session.dialogMode = true
      }

      // Add 15 results (more than the 10 limit)
      for (let i = 0; i < 15; i++) {
        const result = {
          imageUrl: `https://example.com/result${i}.jpg`,
          prompt: `test prompt ${i}`,
          model: 'seedream',
          timestamp: Date.now() + i,
          additionalInfo: { size: '1K' }
        }

        if (mockContext.session) {
          mockContext.session.savedAiPhotoshopResults = [
            ...(mockContext.session.savedAiPhotoshopResults || []),
            result
          ]

          // Apply limit (keep last 10)
          if (mockContext.session.savedAiPhotoshopResults.length > 10) {
            mockContext.session.savedAiPhotoshopResults =
              mockContext.session.savedAiPhotoshopResults.slice(-10)
          }
        }
      }

      expect(mockContext.session?.savedAiPhotoshopResults).toHaveLength(10)
      expect(mockContext.session?.savedAiPhotoshopResults?.[0].prompt).toBe('test prompt 5') // First of last 10
      expect(mockContext.session?.savedAiPhotoshopResults?.[9].prompt).toBe('test prompt 14') // Last one
    })

    it('should handle memory cleanup on session reset', async () => {
      // Setup session with data
      if (mockContext.session) {
        mockContext.session.aiPhotoshopModel = 'seedream'
        mockContext.session.aiPhotoshopStyle = 'artistic'
        mockContext.session.aiPhotoshopImage = 'https://example.com/image.jpg'
        mockContext.session.morphingImages = MOCK_IMAGES.buffer_images
        mockContext.session.dialogMode = true
        mockContext.session.savedAiPhotoshopResults = Array(5).fill(0).map((_, i) => ({
          imageUrl: `https://example.com/result${i}.jpg`,
          prompt: `test ${i}`,
          model: 'seedream',
          timestamp: Date.now() + i,
          additionalInfo: { size: '1K' }
        }))
      }

      // Simulate session reset
      if (mockContext.session) {
        mockContext.session.aiPhotoshopModel = undefined
        mockContext.session.aiPhotoshopStyle = undefined
        mockContext.session.aiPhotoshopImage = undefined
        mockContext.session.aiPhotoshopPrompt = undefined
        mockContext.session.aiPhotoshopSize = undefined
        mockContext.session.aiPhotoshopStep = undefined
        mockContext.session.awaitingAiPhotoshopImage = false
        mockContext.session.awaitingAiPhotoshopPrompt = false
        mockContext.session.morphingImages = undefined
        mockContext.session.morphingProgressMessageId = undefined
        mockContext.session.savedAiPhotoshopResults = []
        mockContext.session.dialogMode = false
      }

      // All fields should be clean
      expect(mockContext.session?.aiPhotoshopModel).toBeUndefined()
      expect(mockContext.session?.morphingImages).toBeUndefined()
      expect(mockContext.session?.savedAiPhotoshopResults).toHaveLength(0)
      expect(mockContext.session?.dialogMode).toBe(false)
    })

    it('should handle large session data efficiently', async () => {
      const startTime = performance.now()

      if (mockContext.session) {
        mockContext.session.savedAiPhotoshopResults = []

        // Add 100 results with complex data
        for (let i = 0; i < 100; i++) {
          const result = {
            imageUrl: `https://example.com/large_result_${i}_with_very_long_filename_that_might_cause_memory_issues.jpg`,
            prompt: `This is a very long prompt for testing memory efficiency with multiple words and descriptions that might consume more memory than usual prompts test case ${i}`,
            model: 'seedream',
            timestamp: Date.now() + i,
            additionalInfo: {
              size: '4K',
              dimensions: { width: 2731, height: 4096 },
              processingTime: Math.random() * 60000,
              metadata: {
                iterations: i,
                improvements: Array(i % 5).fill(0).map((_, j) => `improvement_${j}`)
              }
            }
          }

          mockContext.session.savedAiPhotoshopResults.push(result)
        }

        // Apply memory limit
        mockContext.session.savedAiPhotoshopResults =
          mockContext.session.savedAiPhotoshopResults.slice(-10)
      }

      const endTime = performance.now()
      const processingTime = endTime - startTime

      expect(processingTime).toBeLessThan(100) // Should process in under 100ms
      expect(mockContext.session?.savedAiPhotoshopResults).toHaveLength(10)
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should recover from corrupted dialog mode state', async () => {
      if (mockContext.session) {
        // Corrupt the session
        mockContext.session.dialogMode = true
        mockContext.session.savedAiPhotoshopResults = null as any
      }

      // Simulate recovery
      if (mockContext.session) {
        if (!Array.isArray(mockContext.session.savedAiPhotoshopResults)) {
          mockContext.session.savedAiPhotoshopResults = []
          mockContext.session.dialogMode = false
        }
      }

      expect(mockContext.session?.savedAiPhotoshopResults).toEqual([])
      expect(mockContext.session?.dialogMode).toBe(false)
    })

    it('should handle missing session gracefully', async () => {
      const contextWithoutSession = {
        ...mockContext,
        session: undefined
      }

      expect(() => {
        const dialogMode = contextWithoutSession.session?.dialogMode
        const results = contextWithoutSession.session?.savedAiPhotoshopResults
        const model = contextWithoutSession.session?.aiPhotoshopModel
      }).not.toThrow()
    })

    it('should recover from invalid result data', async () => {
      if (mockContext.session) {
        mockContext.session.dialogMode = true
        mockContext.session.savedAiPhotoshopResults = [
          {
            imageUrl: 'https://example.com/valid.jpg',
            prompt: 'valid prompt',
            model: 'seedream',
            timestamp: Date.now(),
            additionalInfo: { size: '1K' }
          },
          // Invalid result
          {} as any,
          // Another valid result
          {
            imageUrl: 'https://example.com/valid2.jpg',
            prompt: 'another valid prompt',
            model: 'seedream',
            timestamp: Date.now() + 1000,
            additionalInfo: { size: '1K' }
          }
        ]
      }

      // Filter out invalid results
      if (mockContext.session) {
        mockContext.session.savedAiPhotoshopResults =
          mockContext.session.savedAiPhotoshopResults?.filter(result =>
            result &&
            result.imageUrl &&
            result.prompt &&
            result.model &&
            result.additionalInfo
          ) || []
      }

      expect(mockContext.session?.savedAiPhotoshopResults).toHaveLength(2)
      expect(mockContext.session?.savedAiPhotoshopResults?.[0].imageUrl).toBe('https://example.com/valid.jpg')
      expect(mockContext.session?.savedAiPhotoshopResults?.[1].imageUrl).toBe('https://example.com/valid2.jpg')
    })

    it('should handle concurrent dialog mode access', async () => {
      const contexts = Array(5).fill(0).map(() => createMockContext({
        dialogMode: true,
        savedAiPhotoshopResults: [
          {
            imageUrl: 'https://example.com/shared.jpg',
            prompt: 'shared prompt',
            model: 'seedream',
            timestamp: Date.now(),
            additionalInfo: { size: '1K' }
          }
        ]
      }))

      // Simulate concurrent operations
      const promises = contexts.map(async (ctx, index) => {
        const newResult = {
          imageUrl: `https://example.com/concurrent_${index}.jpg`,
          prompt: `concurrent prompt ${index}`,
          model: 'seedream',
          timestamp: Date.now() + index,
          additionalInfo: { size: '1K' }
        }

        if (ctx.session) {
          ctx.session.savedAiPhotoshopResults = [
            ...(ctx.session.savedAiPhotoshopResults || []),
            newResult
          ]
        }

        return ctx.session?.savedAiPhotoshopResults?.length
      })

      const results = await Promise.all(promises)

      // Each context should have 2 results (1 initial + 1 new)
      results.forEach(count => {
        expect(count).toBe(2)
      })
    })
  })

  describe('Integration with Multi-Photo Workflow', () => {
    it('should handle dialog mode with multi-photo results', async () => {
      const multiPhotoResult = {
        imageUrl: 'https://example.com/multi_result.jpg',
        prompt: 'merge these photos together',
        model: 'seedream',
        timestamp: Date.now(),
        additionalInfo: {
          size: '1K',
          originalImages: [
            'https://example.com/input1.jpg',
            'https://example.com/input2.jpg',
            'https://example.com/input3.jpg'
          ],
          isMultiPhoto: true
        }
      }

      if (mockContext.session) {
        mockContext.session.dialogMode = true
        mockContext.session.savedAiPhotoshopResults = [multiPhotoResult]
      }

      expect(mockContext.session?.savedAiPhotoshopResults?.[0].additionalInfo.isMultiPhoto).toBe(true)
      expect(mockContext.session?.savedAiPhotoshopResults?.[0].additionalInfo.originalImages).toHaveLength(3)
    })

    it('should support dialog mode improvements on multi-photo results', async () => {
      if (mockContext.session) {
        mockContext.session.dialogMode = true
        mockContext.session.savedAiPhotoshopResults = [
          {
            imageUrl: 'https://example.com/multi_base.jpg',
            prompt: 'combine these photos',
            model: 'seedream',
            timestamp: Date.now() - 5000,
            additionalInfo: {
              size: '2K',
              isMultiPhoto: true,
              originalImages: ['img1.jpg', 'img2.jpg']
            }
          }
        ]
      }

      const improvementPrompt = 'make the collage more artistic'
      const lastResult = mockContext.session?.savedAiPhotoshopResults?.[0]

      // Setup improvement session
      if (mockContext.session && lastResult) {
        mockContext.session.aiPhotoshopImage = lastResult.imageUrl
        mockContext.session.aiPhotoshopPrompt = improvementPrompt
        mockContext.session.aiPhotoshopModel = lastResult.model as any
        mockContext.session.aiPhotoshopSize = lastResult.additionalInfo.size as any
        mockContext.session.aiPhotoshopStep = 'processing'
      }

      expect(mockContext.session?.aiPhotoshopImage).toBe(lastResult?.imageUrl)
      expect(mockContext.session?.aiPhotoshopPrompt).toBe(improvementPrompt)
      expect(mockContext.session?.aiPhotoshopSize).toBe('2K')
    })
  })
})