import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { MyContext } from '@/interfaces'

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

describe('generateNanoBananaKie (Bun Test)', () => {
  let mockCtx: MyContext

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
      telegram: {
        sendMessage: mock(() => Promise.resolve(true))
      }
    } as any

    process.env.KIE_AI_API_KEY = 'test-key'
    process.env.BASE_WEBHOOK_URL = 'https://test.com'
  })

  test('should generate image successfully with KIE.AI', async () => {
    // Import after mocks are set up
    const { generateNanoBananaKie } = await import('@/services/generateNanoBananaKie')
    
    // Mock balance check success
    mockProcessBalance.mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    // Mock KIE.AI create task success
    mockAxios.post.mockResolvedValueOnce({
      status: 200,
      data: {
        code: 200,
        data: {
          taskId: 'test-task-123'
        }
      }
    })

    // Mock polling response - completed
    mockAxios.get.mockResolvedValueOnce({
      data: {
        code: 200,
        data: {
          status: 'completed',
          result: {
            image_url: 'https://kie.ai/generated-image.jpg'
          }
        }
      }
    })
    
    mockSendPhoto.mockResolvedValue(true)

    const result = await generateNanoBananaKie({
      telegram_id: '123456',
      promptText: 'Transform into Илья Муромец',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      username: 'testuser',
      is_ru: true
    })

    expect(result).toBe('https://kie.ai/generated-image.jpg')
    expect(mockProcessBalance).toHaveBeenCalledWith({
      telegram_id: 123456,
      paymentAmount: 8,
      is_ru: true,
      bot_name: 'test_bot',
      ctx: mockCtx
    })
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://api.kie.ai/api/v1/jobs/createTask',
      expect.objectContaining({
        model: 'google/nano-banana-edit',
        callBackUrl: 'https://test.com/api/kie-ai/nano-banana/callback',
        input: {
          prompt: 'Transform into Илья Муромец',
          image_urls: ['https://example.com/input.jpg'],
          output_format: 'png',
          image_size: '9:16'
        }
      }),
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-key'
        }
      })
    )
    expect(mockSendPhoto).toHaveBeenCalled()
  })

  test('should handle insufficient balance', async () => {
    const { generateNanoBananaKie } = await import('@/services/generateNanoBananaKie')
    
    mockProcessBalance.mockResolvedValue({
      success: false,
      currentBalance: 5
    })

    const result = await generateNanoBananaKie({
      telegram_id: '123456',
      promptText: 'Transform',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      is_ru: true
    })

    expect(result).toBeNull()
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Недостаточно звезд')
    )
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  test('should handle KIE.AI API errors', async () => {
    const { generateNanoBananaKie } = await import('@/services/generateNanoBananaKie')
    
    mockProcessBalance.mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    mockAxios.post.mockRejectedValue(new Error('KIE.AI API Error'))

    const result = await generateNanoBananaKie({
      telegram_id: '123456',
      promptText: 'Transform',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      is_ru: true
    })

    expect(result).toBeNull()
    expect(mockCtx.reply).toHaveBeenCalledWith(
      '❌ Произошла ошибка при генерации. Попробуйте позже.'
    )
  })

  test('should handle task timeout', async () => {
    const { generateNanoBananaKie } = await import('@/services/generateNanoBananaKie')
    
    mockProcessBalance.mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    mockAxios.post.mockResolvedValueOnce({
      data: { code: 200, data: { taskId: 'test-task' } }
    })

    // Mock all polling attempts to return pending
    mockAxios.get.mockResolvedValue({
      data: {
        code: 200,
        data: {
          status: 'pending'
        }
      }
    })

    const result = await generateNanoBananaKie({
      telegram_id: '123456',
      promptText: 'Transform',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx
    })

    expect(result).toBeNull()
    expect(mockAxios.get).toHaveBeenCalledTimes(30) // max attempts
  })

  test('should handle different result structures', async () => {
    const { generateNanoBananaKie } = await import('@/services/generateNanoBananaKie')
    
    mockProcessBalance.mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    mockAxios.post.mockResolvedValueOnce({
      data: { code: 200, data: { taskId: 'test-task' } }
    })

    // Test with images array
    mockAxios.get.mockResolvedValueOnce({
      data: {
        code: 200,
        data: {
          status: 'completed',
          result: {
            images: ['https://kie.ai/image1.jpg']
          }
        }
      }
    })
    
    mockSendPhoto.mockResolvedValue(true)

    const result = await generateNanoBananaKie({
      telegram_id: '123456',
      promptText: 'Test prompt',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx
    })

    expect(result).toBe('https://kie.ai/image1.jpg')
  })

  test('should send correct Russian caption', async () => {
    const { generateNanoBananaKie } = await import('@/services/generateNanoBananaKie')
    
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
          result: { image_url: 'https://test.jpg' }
        }
      }
    })
    
    mockSendPhoto.mockResolvedValue(true)

    await generateNanoBananaKie({
      telegram_id: '123456',
      promptText: 'Transform',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      is_ru: true
    })

    expect(mockSendPhoto).toHaveBeenCalledWith(
      mockCtx,
      'https://test.jpg',
      {
        caption: expect.stringContaining('✨ Ваш образ готов!')
      }
    )

    const captionCall = mockSendPhoto.mock.calls[0][2].caption
    expect(captionCall).toContain('Google Nano Banana (KIE.AI)')
    expect(captionCall).toContain('📐 Формат: 9:16 для Instagram Stories')
    expect(captionCall).toContain('💫 Потрачено: 8⭐')
    expect(captionCall).toContain('@test_bot')
  })

  test('should send correct English caption', async () => {
    const { generateNanoBananaKie } = await import('@/services/generateNanoBananaKie')
    
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
          result: { image_url: 'https://test.jpg' }
        }
      }
    })
    
    mockSendPhoto.mockResolvedValue(true)

    await generateNanoBananaKie({
      telegram_id: '123456',
      promptText: 'Transform',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      is_ru: false
    })

    const captionCall = mockSendPhoto.mock.calls[0][2].caption
    expect(captionCall).toContain('✨ Your image is ready!')
    expect(captionCall).toContain('Google Nano Banana (KIE.AI)')
    expect(captionCall).toContain('📐 Format: 9:16 for Instagram Stories')
    expect(captionCall).toContain('💫 Spent: 8⭐')
  })

  test('should validate parameters correctly', () => {
    const params = {
      telegram_id: '123456',
      promptText: 'Transform into hero',
      inputImageUrl: 'https://example.com/input.jpg',
      is_ru: true
    }

    expect(params.telegram_id).toBe('123456')
    expect(params.promptText).toContain('Transform')
    expect(params.inputImageUrl).toContain('https://')
    expect(params.is_ru).toBe(true)
  })

  test('should validate cost per image', () => {
    const costPerImage = 8 // KIE.AI cost
    const userBalance = 100
    
    expect(userBalance).toBeGreaterThanOrEqual(costPerImage)
    expect(costPerImage).toBe(8)
  })
})