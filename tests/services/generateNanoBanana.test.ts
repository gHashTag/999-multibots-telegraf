import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { MyContext } from '@/interfaces'

// Mock all dependencies
const mockLogger = {
  info: mock(),
  error: mock(),
  warn: mock()
}

const mockProcessBalance = mock()
const mockGetUser = mock()
const mockSavePrompt = mock()
const mockSendPhoto = mock()
const mockRefundUser = mock()
const mockReplicate = {
  run: mock()
}

mock.module('@/utils/logger', () => ({ logger: mockLogger }))
mock.module('@/price/helpers/processBalanceOperation', () => ({ processBalanceOperation: mockProcessBalance }))
mock.module('@/core/supabase', () => ({ 
  getUserByTelegramIdString: mockGetUser,
  savePrompt: mockSavePrompt,
  updateUserLevelPlusOne: mock()
}))
mock.module('@/helpers/sendPhotoWithFallback', () => ({ sendPhotoWithFallback: mockSendPhoto }))
mock.module('@/price/helpers/refundUser', () => ({ refundUser: mockRefundUser }))
mock.module('replicate', () => ({ default: mock(() => mockReplicate) }))

describe('generateNanoBanana', () => {
  let mockCtx: MyContext

  beforeEach(() => {
    // Clear all mocks
    mockLogger.info.mockClear()
    mockLogger.error.mockClear()
    mockLogger.warn.mockClear()
    mockProcessBalance.mockClear()
    mockGetUser.mockClear()
    mockSavePrompt.mockClear()
    mockSendPhoto.mockClear()
    mockRefundUser.mockClear()
    mockReplicate.run.mockClear()
    
    mockCtx = {
      botInfo: { username: 'test_bot' },
      reply: mock(() => Promise.resolve({ message_id: 123 })),
      deleteMessage: mock(() => Promise.resolve(true)),
      telegram: { sendMessage: mock(() => Promise.resolve(true)) },
      from: { username: 'test_user' }
    } as any

    // Setup default successful mocks
    mockGetUser.mockResolvedValue({ id: '123456789', level: 5 })
    mockProcessBalance.mockResolvedValue({ success: true, currentBalance: 100 })
    mockSavePrompt.mockResolvedValue(1)
    mockSendPhoto.mockResolvedValue(true)
    mockReplicate.run.mockResolvedValue('https://replicate.delivery/generated-image.png')

    process.env.REPLICATE_API_TOKEN = 'test-token'
  })

  test('should validate input schema correctly', async () => {
    const { NanoBananaInputSchema } = await import('@/schemas/nanoBanana.schema')
    
    const validInput = {
      prompt: 'Transform me into a superhero',
      image_input: ['https://example.com/image.jpg'],
      output_format: 'png' as const
    }
    
    expect(() => NanoBananaInputSchema.parse(validInput)).not.toThrow()
  })

  test('should reject empty prompt', async () => {
    const { NanoBananaInputSchema } = await import('@/schemas/nanoBanana.schema')
    
    const invalidInput = {
      prompt: '',
      image_input: ['https://example.com/image.jpg']
    }
    
    expect(() => NanoBananaInputSchema.parse(invalidInput)).toThrow()
  })

  test('should reject empty image input array', async () => {
    const { NanoBananaInputSchema } = await import('@/schemas/nanoBanana.schema')
    
    const invalidInput = {
      prompt: 'Test prompt',
      image_input: []
    }
    
    expect(() => NanoBananaInputSchema.parse(invalidInput)).toThrow()
  })

  test('should generate image successfully', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanoBanana')
    
    const params = {
      telegram_id: '123456789',
      promptText: 'Transform me into a magical character',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    const result = await generateNanoBanana(params)
    
    expect(result).toBe('https://replicate.delivery/generated-image.png')
    
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Генерирую ваш образ через Google Nano Banana')
    )
    
    expect(mockSendPhoto).toHaveBeenCalledWith(
      mockCtx,
      'https://replicate.delivery/generated-image.png',
      expect.objectContaining({
        caption: expect.stringContaining('Google Nano Banana')
      })
    )
  })

  test('should handle string input image URL', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanoBanana')
    
    const params = {
      telegram_id: '123456789',
      promptText: 'Test prompt',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    await generateNanoBanana(params)
    
    expect(mockReplicate.run).toHaveBeenCalledWith(
      'google/nano-banana',
      expect.objectContaining({
        input: expect.objectContaining({
          image_input: ['https://example.com/input.jpg']
        })
      })
    )
  })

  test('should handle array input image URLs', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanoBanana')
    
    const params = {
      telegram_id: '123456789',
      promptText: 'Test prompt',
      inputImageUrl: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    await generateNanoBanana(params)
    
    expect(mockReplicate.run).toHaveBeenCalledWith(
      'google/nano-banana',
      expect.objectContaining({
        input: expect.objectContaining({
          image_input: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg']
        })
      })
    )
  })

  test('should apply headshot prompt template', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanoBanana')
    
    const params = {
      telegram_id: '123456789',
      promptText: 'Test prompt',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx,
      promptStyle: 'headshot' as const
    }

    await generateNanoBanana(params)
    
    expect(mockReplicate.run).toHaveBeenCalledWith(
      'google/nano-banana',
      expect.objectContaining({
        input: expect.objectContaining({
          prompt: expect.stringContaining('CLOSE-UP HEADSHOT PORTRAIT')
        })
      })
    )
  })

  test('should handle insufficient balance', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanoBanana')
    
    mockProcessBalance.mockResolvedValue({ success: false, currentBalance: 0 })
    
    const params = {
      telegram_id: '123456789',
      promptText: 'Test prompt',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    const result = await generateNanoBanana(params)
    
    expect(result).toBeNull()
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Недостаточно звезд'),
      expect.objectContaining({ parse_mode: 'MarkdownV2' })
    )
  })

  test('should handle user not found', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanoBanana')
    
    mockGetUser.mockResolvedValue(null)
    
    const params = {
      telegram_id: '123456789',
      promptText: 'Test prompt',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    const result = await generateNanoBanana(params)
    
    expect(result).toBeNull()
  })

  test('should handle API failures and refund user', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanoBanana')
    
    mockReplicate.run.mockRejectedValue(new Error('API Error'))
    
    const params = {
      telegram_id: '123456789',
      promptText: 'Test prompt',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    const result = await generateNanoBanana(params)
    
    expect(result).toBeNull()
    expect(mockRefundUser).toHaveBeenCalledWith({
      telegram_id: 123456789,
      refundAmount: 12,
      ctx: mockCtx,
      is_ru: true
    })
  })

  test('should handle no image URL in response', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanoBanana')
    
    mockReplicate.run.mockResolvedValue(null)
    
    const params = {
      telegram_id: '123456789',
      promptText: 'Test prompt',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    const result = await generateNanoBanana(params)
    
    expect(result).toBeNull()
  })

  test('should handle photo send failure', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanoBanana')
    
    mockSendPhoto.mockResolvedValue(false)
    
    const params = {
      telegram_id: '123456789',
      promptText: 'Test prompt',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    const result = await generateNanoBanana(params)
    
    expect(result).toBeNull()
  })

  test('should extract image URL from different response formats', async () => {
    const { extractImageUrlFromReplicateResponse } = await import('@/schemas/nanoBanana.schema')
    
    // Test string URL
    expect(extractImageUrlFromReplicateResponse('https://example.com/image.png'))
      .toBe('https://example.com/image.png')
    
    // Test array of URLs
    expect(extractImageUrlFromReplicateResponse(['https://example.com/image.png']))
      .toBe('https://example.com/image.png')
    
    // Test object with output property
    expect(extractImageUrlFromReplicateResponse({ output: 'https://example.com/image.png' }))
      .toBe('https://example.com/image.png')
    
    // Test invalid response
    expect(extractImageUrlFromReplicateResponse(null)).toBeNull()
    expect(extractImageUrlFromReplicateResponse({})).toBeNull()
  })

  test('should validate response schema correctly', async () => {
    const { NanoBananaResponseSchema } = await import('@/schemas/nanoBanana.schema')
    
    const validResponse = {
      image: 'https://example.com/image.png',
      metadata: {
        prompt: 'Test prompt',
        input_images_count: 1,
        output_format: 'png'
      }
    }
    
    expect(() => NanoBananaResponseSchema.parse(validResponse)).not.toThrow()
  })

  test('should use correct prompt templates', async () => {
    const { NANO_BANANA_PROMPT_TEMPLATES } = await import('@/schemas/nanoBanana.schema')
    
    const template = NANO_BANANA_PROMPT_TEMPLATES.headshot('test prompt')
    expect(template).toContain('CLOSE-UP HEADSHOT PORTRAIT')
    expect(template).toContain('test prompt')
    expect(template).toContain('9:16 vertical aspect ratio')
  })

  test('should maintain backward compatibility with legacy interface', async () => {
    const { generateNanoBananaLegacy } = await import('@/services/generateNanoBanana')
    
    const legacyParams = {
      telegram_id: '123456789',
      promptText: 'Test prompt',
      inputImageUrl: 'https://example.com/image.jpg',
      ctx: mockCtx,
      username: 'test_user',
      is_ru: true
    }
    
    const result = await generateNanoBananaLegacy(legacyParams)
    expect(result).toBe('https://replicate.delivery/generated-image.png')
  })
})