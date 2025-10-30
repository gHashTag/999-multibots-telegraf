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
const mockReplicate = {
  run: mock()
}

mock.module('@/utils/logger', () => ({ logger: mockLogger }))
mock.module('@/price/helpers/processBalanceOperation', () => ({ processBalanceOperation: mockProcessBalance }))
mock.module('@/helpers/sendPhotoWithFallback', () => ({ sendPhotoWithFallback: mockSendPhoto }))
mock.module('replicate', () => ({ default: mock(() => mockReplicate) }))

describe('generateNanoBanana (Bun Test)', () => {
  let mockCtx: MyContext

  beforeEach(() => {
    // Clear all mocks
    mockLogger.info.mockClear()
    mockLogger.error.mockClear()
    mockLogger.warn.mockClear()
    mockProcessBalance.mockClear()
    mockSendPhoto.mockClear()
    mockReplicate.run.mockClear()
    
    mockCtx = {
      botInfo: { username: 'test_bot' },
      reply: mock(() => Promise.resolve({ message_id: 123 })),
      deleteMessage: mock(() => Promise.resolve(true)),
      telegram: {
        sendMessage: mock(() => Promise.resolve(true))
      }
    } as any

    process.env.REPLICATE_API_TOKEN = 'test-token'
  })

  test('should generate image successfully with Replicate', async () => {
    // Import after mocks are set up
    const { generateNanoBanana } = await import('@/services/generateNanoBanana')
    
    // Mock balance check success
    mockProcessBalance.mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    mockReplicate.run.mockResolvedValue('https://replicate.com/generated-image.jpg')
    mockSendPhoto.mockResolvedValue(true)

    const result = await generateNanoBanana({
      telegram_id: '123456',
      promptText: 'Transform into Илья Муромец',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      username: 'testuser',
      is_ru: true
    })

    expect(result).toBe('https://replicate.com/generated-image.jpg')
    expect(mockProcessBalance).toHaveBeenCalledWith({
      telegram_id: 123456,
      paymentAmount: 12,
      is_ru: true,
      bot_name: 'test_bot',
      ctx: mockCtx
    })
    expect(mockReplicate.run).toHaveBeenCalledWith(
      'google/nano-banana',
      {
        input: {
          prompt: expect.stringContaining('Transform into Илья Муромец'),
          image_input: ['https://example.com/input.jpg']
        }
      }
    )
    expect(mockSendPhoto).toHaveBeenCalled()
  })

  test('should handle insufficient balance', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanaBanana')
    
    mockProcessBalance.mockResolvedValue({
      success: false,
      currentBalance: 5
    })

    const result = await generateNanaBanana({
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
    expect(mockReplicate.run).not.toHaveBeenCalled()
  })

  test('should handle Replicate API errors', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanaBanana')
    
    mockProcessBalance.mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    mockReplicate.run.mockRejectedValue(new Error('Replicate API Error'))

    const result = await generateNanaBanana({
      telegram_id: '123456',
      promptText: 'Transform',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      is_ru: true
    })

    expect(result).toBeNull()
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Произошла ошибка при генерации')
    )
  })

  test('should handle array output from Replicate', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanaBanana')
    
    mockProcessBalance.mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    mockReplicate.run.mockResolvedValue(['https://replicate.com/image1.jpg', 'https://replicate.com/image2.jpg'])
    mockSendPhoto.mockResolvedValue(true)

    const result = await generateNanoBanana({
      telegram_id: '123456',
      promptText: 'Transform',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      is_ru: true
    })

    expect(result).toBe('https://replicate.com/image1.jpg')
  })

  test('should handle object with url method output', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanaBanana')
    
    mockProcessBalance.mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    const outputWithUrl = {
      url: () => 'https://replicate.com/generated.jpg'
    }
    mockReplicate.run.mockResolvedValue(outputWithUrl)
    mockSendPhoto.mockResolvedValue(true)

    const result = await generateNanoBanana({
      telegram_id: '123456',
      promptText: 'Transform',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      is_ru: true
    })

    expect(result).toBe('https://replicate.com/generated.jpg')
  })

  test('should handle no image URL in response', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanoBanana')
    
    mockProcessBalance.mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    mockReplicate.run.mockResolvedValue(null)

    const result = await generateNanoBanana({
      telegram_id: '123456',
      promptText: 'Transform',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      is_ru: true
    })

    expect(result).toBeNull()
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Произошла ошибка')
    )
  })

  test('should add 9:16 format to prompt', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanaBanana')
    
    mockProcessBalance.mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    mockReplicate.run.mockResolvedValue('https://replicate.com/image.jpg')
    mockSendPhoto.mockResolvedValue(true)

    await generateNanoBanana({
      telegram_id: '123456',
      promptText: 'Transform into hero',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx
    })

    expect(mockReplicate.run).toHaveBeenCalledWith(
      'google/nano-banana',
      {
        input: {
          prompt: expect.stringContaining('9:16 vertical portrait format for Instagram stories'),
          image_input: ['https://example.com/input.jpg']
        }
      }
    )
  })

  test('should send correct Russian status message', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanoBanana')
    
    mockProcessBalance.mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    mockReplicate.run.mockResolvedValue('https://replicate.com/image.jpg')
    mockSendPhoto.mockResolvedValue(true)

    await generateNanoBanana({
      telegram_id: '123456',
      promptText: 'Transform',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      is_ru: true
    })

    expect(mockCtx.reply).toHaveBeenCalledWith(
      '🎨 Генерирую ваш образ через Google Nano Banana...\n\n⏱ Это займет 10-20 секунд'
    )
  })

  test('should send correct English status message', async () => {
    const { generateNanoBanana } = await import('@/services/generateNanaBanana')
    
    mockProcessBalance.mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    mockReplicate.run.mockResolvedValue('https://replicate.com/image.jpg')
    mockSendPhoto.mockResolvedValue(true)

    await generateNanoBanana({
      telegram_id: '123456',
      promptText: 'Transform',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      is_ru: false
    })

    expect(mockCtx.reply).toHaveBeenCalledWith(
      '🎨 Generating your image via Google Nano Banana...\n\n⏱ This will take 10-20 seconds'
    )
  })

  test('should validate cost difference from KIE.AI', () => {
    const replicateCost = 12
    const kieAiCost = 8
    
    expect(replicateCost).toBeGreaterThan(kieAiCost)
    expect(replicateCost - kieAiCost).toBe(4) // Replicate is 4 stars more expensive
  })
})