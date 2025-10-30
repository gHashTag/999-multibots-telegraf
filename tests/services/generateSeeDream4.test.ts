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

describe('generateSeeDream4', () => {
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
    mockReplicate.run.mockResolvedValue(['https://replicate.delivery/generated-image.png'])
  })

  test('should validate input schema correctly', async () => {
    const { SeeDream4InputSchema } = await import('@/schemas/seedream4.schema')
    
    const validInput = {
      prompt: 'Transform me into a superhero',
      size: '2K' as const,
      max_images: 1,
      aspect_ratio: '9:16'
    }
    
    expect(() => SeeDream4InputSchema.parse(validInput)).not.toThrow()
  })

  test('should reject invalid input', async () => {
    const { SeeDream4InputSchema } = await import('@/schemas/seedream4.schema')
    
    const invalidInput = {
      prompt: '', // Empty prompt
      size: '2K' as const
    }
    
    expect(() => SeeDream4InputSchema.parse(invalidInput)).toThrow()
  })

  test('should generate image successfully', async () => {
    const { generateSeeDream4 } = await import('@/services/generateSeeDream4')
    
    const params = {
      telegram_id: '123456789',
      prompt: 'Transform me into a superhero',
      inputImageUrl: 'https://example.com/image.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    const result = await generateSeeDream4(params)
    
    expect(result).toEqual({
      image: 'https://replicate.delivery/generated-image.png',
      prompt_id: 1
    })
    
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Генерирую изображение через SeeDream-4')
    )
    
    expect(mockCtx.replyWithPhoto).toHaveBeenCalledWith(
      { source: '/tmp/test-image.png' },
      { caption: expect.stringContaining('SeeDream-4') }
    )
  })

  test('should handle insufficient balance', async () => {
    const { generateSeeDream4 } = await import('@/services/generateSeeDream4')
    
    mockProcessBalance.mockResolvedValue({ success: false, currentBalance: 0 })
    
    const params = {
      telegram_id: '123456789',
      prompt: 'Test prompt',
      inputImageUrl: 'https://example.com/image.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    await expect(generateSeeDream4(params)).rejects.toThrow('Not enough stars')
  })

  test('should handle user not found', async () => {
    const { generateSeeDream4 } = await import('@/services/generateSeeDream4')
    
    mockGetUser.mockResolvedValue(null)
    
    const params = {
      telegram_id: '123456789',
      prompt: 'Test prompt',
      inputImageUrl: 'https://example.com/image.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    await expect(generateSeeDream4(params)).rejects.toThrow('User with ID 123456789 does not exist')
  })

  test('should handle API failure and refund user', async () => {
    const { generateSeeDream4 } = await import('@/services/generateSeeDream4')
    
    mockReplicate.run.mockRejectedValue(new Error('API Error'))
    
    const params = {
      telegram_id: '123456789',
      prompt: 'Test prompt',
      inputImageUrl: 'https://example.com/image.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx
    }

    await expect(generateSeeDream4(params)).rejects.toThrow()
    expect(mockRefundUser).toHaveBeenCalled()
  })

  test('should validate response schema correctly', async () => {
    const { SeeDream4ResponseSchema } = await import('@/schemas/seedream4.schema')
    
    const validResponse = {
      images: ['https://example.com/image1.png'],
      metadata: {
        prompt: 'Test prompt',
        size: '2K',
        dimensions: { width: 2048, height: 2048 }
      }
    }
    
    expect(() => SeeDream4ResponseSchema.parse(validResponse)).not.toThrow()
  })

  test('should handle custom size parameters', async () => {
    const { generateSeeDream4 } = await import('@/services/generateSeeDream4')
    
    const params = {
      telegram_id: '123456789',
      prompt: 'Test prompt',
      inputImageUrl: 'https://example.com/image.jpg',
      username: 'test_user',
      is_ru: true,
      ctx: mockCtx,
      size: 'custom' as const,
      width: 3072,
      height: 3072
    }

    await generateSeeDream4(params)
    
    expect(mockReplicate.run).toHaveBeenCalledWith(
      'bytedance/seedream-4',
      expect.objectContaining({
        input: expect.objectContaining({
          width: 3072,
          height: 3072
        })
      })
    )
  })
})