import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { generateNanoBananaKie } from '@/services/generateNanoBananaKie'
import { generateNanoBanana } from '@/services/generateNanoBanana'
import { MyContext } from '@/interfaces'
import axios from 'axios'
import Replicate from 'replicate'

// Mock all dependencies
const mockLogger = {
  info: mock(),
  error: mock(),
  warn: mock()
}

const mockProcessBalance = mock()
const mockSendPhoto = mock()
const mockAxios = {
  post: mock(),
  get: mock()
}

mock.module('@/utils/logger', () => ({ logger: mockLogger }))
mock.module('@/price/helpers/processBalanceOperation', () => ({ processBalanceOperation: mockProcessBalance }))
mock.module('@/helpers/sendPhotoWithFallback', () => ({ sendPhotoWithFallback: mockSendPhoto }))
mock.module('axios', () => ({ default: mockAxios }))
mock.module('replicate', () => ({ default: mock(() => mockReplicate) }))

describe('Nano Banana Fallback Mechanism', () => {
  let mockCtx: MyContext
  let mockReplicate: any

  beforeEach(() => {
    // Clear all mocks
    mockLogger.info.mockClear()
    mockLogger.error.mockClear()
    mockLogger.warn.mockClear()
    mockProcessBalance.mockClear()
    mockSendPhoto.mockClear()
    mockAxios.post.mockClear()
    mockAxios.get.mockClear()
    
    mockCtx = {
      botInfo: { username: 'test_bot' },
      reply: mock(() => Promise.resolve({ message_id: 123 })),
      deleteMessage: mock(() => Promise.resolve(true)),
    } as any

    mockReplicate = {
      run: mock()
    }
    
    process.env.KIE_AI_API_KEY = 'test-key'
    process.env.REPLICATE_API_TOKEN = 'test-token'
  })

  describe('Fallback scenarios', () => {
    test('should demonstrate KIE.AI success (no fallback needed)', async () => {
      const { processBalanceOperation } = await import('@/price/helpers/processBalanceOperation')
      const { sendPhotoWithFallback } = await import('@/helpers/sendPhotoWithFallback')
      
      // Mock successful balance check
      mockProcessBalance.mockResolvedValue({
        success: true,
        currentBalance: 100
      })
      
      // Mock successful KIE.AI response
      mockAxios.post.mockResolvedValueOnce({
        data: { code: 200, data: { taskId: 'test-task' } }
      })

      mockAxios.get.mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            status: 'completed',
            result: { image_url: 'https://kie.ai/success.jpg' }
          }
        }
      })
      
      mockSendPhoto.mockResolvedValue(true)

      const result = await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Transform into hero',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx
      })

      expect(result).toBe('https://kie.ai/success.jpg')
      expect(mockReplicate.run).not.toHaveBeenCalled()
    })

    test('should demonstrate Replicate success when KIE.AI fails', async () => {
      const { processBalanceOperation } = await import('@/price/helpers/processBalanceOperation')
      const { sendPhotoWithFallback } = await import('@/helpers/sendPhotoWithFallback')
      
      // Mock successful balance check for both attempts
      mockProcessBalance
        .mockResolvedValueOnce({
          success: true,
          currentBalance: 100
        })
        .mockResolvedValueOnce({
          success: true,
          currentBalance: 92 // After first attempt cost
        })
      
      // Mock KIE.AI failure
      mockAxios.post.mockRejectedValue(new Error('KIE.AI API Error'))
      
      // Mock successful Replicate
      mockReplicate.run.mockResolvedValue('https://replicate.com/fallback.jpg')
      mockSendPhoto.mockResolvedValue(true)

      // This simulates the fallback logic that should exist
      let result: string | null = null
      
      try {
        result = await generateNanoBananaKie({
          telegram_id: '123456',
          promptText: 'Transform into hero',
          inputImageUrl: 'https://example.com/input.jpg',
          ctx: mockCtx
        })
      } catch (error) {
        // Fallback to Replicate
        result = await generateNanaBanana({
          telegram_id: '123456',
          promptText: 'Transform into hero',
          inputImageUrl: 'https://example.com/input.jpg',
          ctx: mockCtx
        })
      }

      expect(result).toBe('https://replicate.com/fallback.jpg')
      expect(mockReplicate.run).toHaveBeenCalled()
    })

    test('should handle both KIE.AI and Replicate failures', async () => {
      const { processBalanceOperation } = await import('@/price/helpers/processBalanceOperation')
      
      // Mock successful balance check
      mockProcessBalance
        .mockResolvedValue({
          success: true,
          currentBalance: 100
        })
      
      // Mock KIE.AI failure
      mockAxios.post.mockRejectedValue(new Error('KIE.AI Error'))
      
      // Mock Replicate failure
      mockReplicate.run.mockRejectedValue(new Error('Replicate Error'))

      // Test KIE.AI failure
      const kieResult = await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx
      })

      // Test Replicate failure
      const replicateResult = await generateNanoBanana({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx
      })

      expect(kieResult).toBeNull()
      expect(replicateResult).toBeNull()
    })

    test('should handle KIE.AI timeout and fallback to Replicate', async () => {
      const { processBalanceOperation } = await import('@/price/helpers/processBalanceOperation')
      const { sendPhotoWithFallback } = await import('@/helpers/sendPhotoWithFallback')
      
      mockProcessBalance
        .mockResolvedValueOnce({
          success: true,
          currentBalance: 100
        })
        .mockResolvedValueOnce({
          success: true,
          currentBalance: 92
        })
      
      // Mock KIE.AI timeout (task never completes)
      mockAxios.post.mockResolvedValueOnce({
        data: { code: 200, data: { taskId: 'timeout-task' } }
      })

      mockAxios.get.mockResolvedValue({
        data: { code: 200, data: { status: 'pending' } }
      })
      
      // Mock successful Replicate fallback
      mockReplicate.run.mockResolvedValue('https://replicate.com/timeout-fallback.jpg')
      mockSendPhoto.mockResolvedValue(true)

      // Test timeout scenario
      let result: string | null = null
      
      try {
        result = await generateNanoBananaKie({
          telegram_id: '123456',
          promptText: 'Transform',
          inputImageUrl: 'https://example.com/input.jpg',
          ctx: mockCtx
        })
        
        if (!result) {
          // Fallback to Replicate
          result = await generateNanoBanana({
            telegram_id: '123456',
            promptText: 'Transform',
            inputImageUrl: 'https://example.com/input.jpg',
            ctx: mockCtx
          })
        }
      } catch (error) {
        // Also fallback on error
        result = await generateNanoBanana({
          telegram_id: '123456',
          promptText: 'Transform',
          inputImageUrl: 'https://example.com/input.jpg',
          ctx: mockCtx
        })
      }

      expect(result).toBe('https://replicate.com/timeout-fallback.jpg')
    })

    test('should handle different error types from KIE.AI', async () => {
      const { processBalanceOperation } = await import('@/price/helpers/processBalanceOperation')
      
      mockProcessBalance.mockResolvedValue({
        success: true,
        currentBalance: 100
      })

      const errorScenarios = [
        {
          name: 'Network timeout',
          error: { code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' }
        },
        {
          name: 'Server error',
          response: { status: 500, data: { msg: 'Internal server error' } }
        },
        {
          name: 'Authentication error',
          response: { status: 401, data: { msg: 'Unauthorized' } }
        },
        {
          name: 'Rate limit',
          response: { status: 429, data: { msg: 'Too many requests' } }
        },
        {
          name: 'Insufficient credits',
          response: { status: 402, data: { msg: 'Insufficient credits' } }
        }
      ]

      for (const scenario of errorScenarios) {
        mock.clearAllMocks()
        mockProcessBalance.mockResolvedValue({
          success: true,
          currentBalance: 100
        })

        if (scenario.error) {
          mockAxios.post.mockRejectedValue(scenario.error)
        } else {
          mockAxios.post.mockRejectedValue({ 
            response: scenario.response,
            message: scenario.response?.data.msg 
          })
        }

        const result = await generateNanoBananaKie({
          telegram_id: '123456',
          promptText: 'Transform',
          inputImageUrl: 'https://example.com/input.jpg',
          ctx: mockCtx
        })

        expect(result).toBeNull()
        expect(mockCtx.reply).toHaveBeenCalledWith(
          expect.stringContaining('❌ Произошла ошибка при генерации')
        )
      }
    })

    test('should preserve original prompt in fallback', async () => {
      const { processBalanceOperation } = await import('@/price/helpers/processBalanceOperation')
      const { sendPhotoWithFallback } = await import('@/helpers/sendPhotoWithFallback')
      
      const originalPrompt = 'Transform into Илья Муромец with epic armor'
      const inputImageUrl = 'https://example.com/user-photo.jpg'
      
      mockProcessBalance
        .mockResolvedValueOnce({
          success: true,
          currentBalance: 100
        })
        .mockResolvedValueOnce({
          success: true,
          currentBalance: 92
        })
      
      // Mock KIE.AI failure
      mockAxios.post.mockRejectedValue(new Error('KIE.AI down'))
      
      // Mock Replicate success
      mockReplicate.run.mockResolvedValue('https://replicate.com/preserved-prompt.jpg')
      mockSendPhoto.mockResolvedValue(true)

      // Attempt KIE.AI first
      let result = await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: originalPrompt,
        inputImageUrl,
        ctx: mockCtx
      })

      // Fallback to Replicate
      if (!result) {
        result = await generateNanoBanana({
          telegram_id: '123456',
          promptText: originalPrompt,
          inputImageUrl,
          ctx: mockCtx
        })
      }

      expect(result).toBe('https://replicate.com/preserved-prompt.jpg')
      expect(mockReplicate.run).toHaveBeenCalledWith(
        'google/nano-banana',
        {
          input: {
            prompt: expect.stringContaining(originalPrompt),
            image_input: [inputImageUrl]
          }
        }
      )
    })
  })

  describe('Cost and balance considerations', () => {
    test('should charge different amounts for KIE.AI vs Replicate', async () => {
      const { processBalanceOperation } = await import('@/price/helpers/processBalanceOperation')
      
      mockProcessBalance.mockResolvedValue({
        success: true,
        currentBalance: 100
      })

      mockAxios.post.mockResolvedValueOnce({
        data: { code: 200, data: { taskId: 'test-task' } }
      })

      mockAxios.get.mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            status: 'completed',
            result: { image_url: 'https://kie.ai/image.jpg' }
          }
        }
      })

      // Test KIE.AI charging (8 stars)
      await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx
      })

      expect(processBalanceOperation).toHaveBeenCalledWith({
        telegram_id: 123456,
        paymentAmount: 8, // KIE.AI cost
        is_ru: undefined,
        bot_name: 'test_bot',
        ctx: mockCtx
      })

      mock.clearAllMocks()
      mockProcessBalance.mockResolvedValue({
        success: true,
        currentBalance: 100
      })

      mockReplicate.run.mockResolvedValue('https://replicate.com/image.jpg')

      // Test Replicate charging (12 stars)
      await generateNanoBanana({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx
      })

      expect(processBalanceOperation).toHaveBeenCalledWith({
        telegram_id: 123456,
        paymentAmount: 12, // Replicate cost
        is_ru: undefined,
        bot_name: 'test_bot',
        ctx: mockCtx
      })
    })

    test('should handle insufficient balance for fallback', async () => {
      const { processBalanceOperation } = await import('@/price/helpers/processBalanceOperation')
      
      // First attempt (KIE.AI) has sufficient balance
      mockProcessBalance
        .mockResolvedValueOnce({
          success: true,
          currentBalance: 10
        })
        .mockResolvedValueOnce({
          success: false,
          currentBalance: 2 // After KIE.AI attempt, insufficient for Replicate
        })
      
      // Mock KIE.AI failure
      mockAxios.post.mockRejectedValue(new Error('KIE.AI Error'))

      // Test KIE.AI failure
      const kieResult = await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx
      })

      // Test Replicate insufficient balance
      const replicateResult = await generateNanoBanana({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx
      })

      expect(kieResult).toBeNull()
      expect(replicateResult).toBeNull()
      
      // Verify balance-related error messages
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Недостаточно звезд')
      )
    })
  })
})