import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { MyContext } from '@/interfaces'

// Mock all dependencies
const mockLogger = {
  info: mock(),
  error: mock(),
  warn: mock()
}

const mockReplicate = {
  run: mock()
}

const mockProcessBalance = mock()
const mockGetUser = mock()
const mockSavePrompt = mock()
const mockDownloadFile = mock()
const mockSaveFile = mock()
const mockRefundUser = mock()

mock.module('@/utils/logger', () => ({ logger: mockLogger }))
mock.module('@/core/replicate', () => ({ replicate: mockReplicate }))
mock.module('@/price/helpers', () => ({ processBalanceOperation: mockProcessBalance }))
mock.module('@/core/supabase', () => ({ 
  getUserByTelegramIdString: mockGetUser,
  savePrompt: mockSavePrompt,
  updateUserLevelPlusOne: mock()
}))
mock.module('@/helpers/downloadFile', () => ({ downloadFile: mockDownloadFile }))
mock.module('@/helpers/saveFileLocally', () => ({ saveFileLocally: mockSaveFile }))
mock.module('@/price/helpers/refundUser', () => ({ refundUser: mockRefundUser }))
mock.module('fs', () => ({ unlinkSync: mock() }))

describe('generateFluxKontextMax', () => {
  let mockCtx: MyContext

  beforeEach(() => {
    // Clear all mocks
    mockLogger.info.mockClear()
    mockLogger.error.mockClear()
    mockLogger.warn.mockClear()
    mockReplicate.run.mockClear()
    mockProcessBalance.mockClear()
    mockGetUser.mockClear()
    mockSavePrompt.mockClear()
    mockDownloadFile.mockClear()
    mockSaveFile.mockClear()
    mockRefundUser.mockClear()
    
    mockCtx = {
      botInfo: { username: 'test_bot' },
      reply: mock(() => Promise.resolve({ message_id: 123 })),
      deleteMessage: mock(() => Promise.resolve(true)),
      replyWithPhoto: mock(() => Promise.resolve(true)),
      from: { username: 'test_user' }
    } as any

    // Setup default successful mocks
    mockGetUser.mockResolvedValue({ id: '123456789', level: 5 })
    mockProcessBalance.mockResolvedValue({ success: true, currentBalance: 100 })
    mockSavePrompt.mockResolvedValue(1)
    mockDownloadFile.mockResolvedValue(Buffer.from('fake-image'))
    mockSaveFile.mockResolvedValue('/tmp/test-image.png')
    mockReplicate.run.mockResolvedValue('https://replicate.delivery/generated-image.png')
  })

  test('should validate input schema correctly', async () => {
    const { FluxKontextMaxInputSchema } = await import('@/schemas/fluxKontextMax.schema')
    
    const validInput = {
      prompt: 'Transform this image',
      input_image: 'https://example.com/image.jpg',
      aspect_ratio: 'match_input_image' as const,
      output_format: 'png' as const,
      safety_tolerance: 2
    }
    
    expect(() => FluxKontextMaxInputSchema.parse(validInput)).not.toThrow()
  })

  test('should reject invalid input', async () => {
    const { FluxKontextMaxInputSchema } = await import('@/schemas/fluxKontextMax.schema')
    
    const invalidInput = {
      prompt: '', // Empty prompt
      aspect_ratio: '1:1' as const
    }
    
    expect(() => FluxKontextMaxInputSchema.parse(invalidInput)).toThrow()
  })

  test('should require input_image when aspect_ratio is match_input_image', async () => {
    const { FluxKontextMaxInputSchema } = await import('@/schemas/fluxKontextMax.schema')
    
    const invalidInput = {
      prompt: 'Test prompt',
      aspect_ratio: 'match_input_image' as const
      // Missing input_image
    }
    
    expect(() => FluxKontextMaxInputSchema.parse(invalidInput)).toThrow()
  })

  test('should generate image successfully', async () => {
    const { generateFluxKontextMax } = await import('@/services/generateFluxKontextMax')
    
    const params = {
      telegram_id: '123456789',
      prompt: 'Transform this image into cyberpunk style',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    const result = await generateFluxKontextMax(params)
    
    expect(result).toEqual({
      image: 'https://replicate.delivery/generated-image.png',
      prompt_id: 1
    })
    
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Обрабатываю изображение через FLUX Kontext Max')
    )
    
    expect(mockCtx.replyWithPhoto).toHaveBeenCalledWith(
      { source: '/tmp/test-image.png' },
      { caption: expect.stringContaining('FLUX Kontext Max') }
    )
  })

  test('should handle different aspect ratios', async () => {
    const { generateFluxKontextMax } = await import('@/services/generateFluxKontextMax')
    
    const params = {
      telegram_id: '123456789',
      prompt: 'Test prompt',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx,
      aspect_ratio: '16:9' as const
    }

    await generateFluxKontextMax(params)
    
    expect(mockReplicate.run).toHaveBeenCalledWith(
      'black-forest-labs/flux-kontext-max',
      expect.objectContaining({
        input: expect.objectContaining({
          aspect_ratio: '16:9'
        })
      })
    )
  })

  test('should handle custom seed', async () => {
    const { generateFluxKontextMax } = await import('@/services/generateFluxKontextMax')
    
    const params = {
      telegram_id: '123456789',
      prompt: 'Test prompt',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx,
      seed: 42
    }

    await generateFluxKontextMax(params)
    
    expect(mockReplicate.run).toHaveBeenCalledWith(
      'black-forest-labs/flux-kontext-max',
      expect.objectContaining({
        input: expect.objectContaining({
          seed: 42
        })
      })
    )
  })

  test('should handle object response format', async () => {
    const { generateFluxKontextMax } = await import('@/services/generateFluxKontextMax')
    
    mockReplicate.run.mockResolvedValue({
      output: 'https://replicate.delivery/generated-image.png'
    })
    
    const params = {
      telegram_id: '123456789',
      prompt: 'Test prompt',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    const result = await generateFluxKontextMax(params)
    
    expect(result.image).toBe('https://replicate.delivery/generated-image.png')
  })

  test('should handle insufficient balance', async () => {
    const { generateFluxKontextMax } = await import('@/services/generateFluxKontextMax')
    
    mockProcessBalance.mockResolvedValue({ success: false, currentBalance: 0 })
    
    const params = {
      telegram_id: '123456789',
      prompt: 'Test prompt',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    await expect(generateFluxKontextMax(params)).rejects.toThrow('Not enough stars')
  })

  test('should refund user on API failure', async () => {
    const { generateFluxKontextMax } = await import('@/services/generateFluxKontextMax')
    
    mockReplicate.run.mockRejectedValue(new Error('API error'))
    
    const params = {
      telegram_id: '123456789',
      prompt: 'Test prompt',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    await expect(generateFluxKontextMax(params)).rejects.toThrow()
    expect(mockRefundUser).toHaveBeenCalled()
  })

  test('should validate response schema correctly', async () => {
    const { FluxKontextMaxResponseSchema } = await import('@/schemas/fluxKontextMax.schema')
    
    const validResponse = {
      image: 'https://example.com/image.png',
      metadata: {
        prompt: 'Test prompt',
        seed: 12345,
        aspect_ratio: '1:1',
        output_format: 'png',
        safety_tolerance: 2
      }
    }
    
    expect(() => FluxKontextMaxResponseSchema.parse(validResponse)).not.toThrow()
  })
})

describe('generateAdvancedFluxKontextMax', () => {
  let mockCtx: MyContext
  let mockGenerateFluxKontextMax: any

  beforeEach(() => {
    mockCtx = {
      botInfo: { username: 'test_bot' },
      from: { username: 'test_user' }
    } as any

    mockGenerateFluxKontextMax = mock(() => Promise.resolve({
      image: 'https://example.com/result.png',
      prompt_id: 1
    }))

    mock.module('@/services/generateFluxKontextMax', () => ({
      generateFluxKontextMax: mockGenerateFluxKontextMax,
      generateAdvancedFluxKontextMax: undefined // Will be imported later
    }))
  })

  test('should enhance prompt for headshot mode', async () => {
    const { generateAdvancedFluxKontextMax } = await import('@/services/generateFluxKontextMax')
    
    const params = {
      telegram_id: '123456789',
      prompt: 'Transform me',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx,
      mode: 'headshot' as const
    }

    await generateAdvancedFluxKontextMax(params)
    
    expect(mockGenerateFluxKontextMax).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Professional headshot portrait')
      })
    )
  })

  test('should include camera settings in prompt', async () => {
    const { generateAdvancedFluxKontextMax } = await import('@/services/generateFluxKontextMax')
    
    const params = {
      telegram_id: '123456789',
      prompt: 'Transform me',
      inputImageUrl: 'https://example.com/input.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx,
      mode: 'headshot' as const,
      cameraSettings: 'f/1.8, 85mm, studio lighting'
    }

    await generateAdvancedFluxKontextMax(params)
    
    expect(mockGenerateFluxKontextMax).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('f/1.8, 85mm, studio lighting')
      })
    )
  })
})