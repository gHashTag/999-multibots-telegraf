import { describe, test, expect, beforeEach, vi, Mock } from 'bun:test'
import { generateNanoBanana } from '@/services/generateNanoBanana'
import { processBalanceOperation } from '@/price/helpers/processBalanceOperation'
import { sendPhotoWithFallback } from '@/helpers/sendPhotoWithFallback'
import { MyContext } from '@/interfaces'
import Replicate from 'replicate'

// Mock dependencies
vi.mock('@/utils/logger')
vi.mock('@/price/helpers/processBalanceOperation')
vi.mock('@/helpers/sendPhotoWithFallback')
vi.mock('replicate')

describe('generateNanoBanana', () => {
  let mockCtx: MyContext
  let mockReplicate: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockCtx = {
      botInfo: { username: 'test_bot' },
      reply: vi.fn().mockResolvedValue({ message_id: 123 }),
      deleteMessage: vi.fn().mockResolvedValue(true),
    } as any

    mockReplicate = {
      run: vi.fn().mockResolvedValue('https://example.com/generated-image.jpg')
    }
    
    ;(Replicate as any).mockImplementation(() => mockReplicate)
    
    process.env.REPLICATE_API_TOKEN = 'test-token'
  })

  test('should generate image successfully with sufficient balance', async () => {
    ;(processBalanceOperation as Mock).mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    ;(sendPhotoWithFallback as Mock).mockResolvedValue(true)

    const result = await generateNanoBanana({
      telegram_id: '123456',
      promptText: 'Transform into Илья Муромец',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      username: 'testuser',
      is_ru: true
    })

    expect(result).toBe('https://example.com/generated-image.jpg')
    expect(processBalanceOperation).toHaveBeenCalledWith({
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
          prompt: 'Transform into Илья Муромец',
          image_input: ['https://example.com/input.jpg']
        }
      }
    )
    expect(sendPhotoWithFallback).toHaveBeenCalled()
  })

  test('should handle insufficient balance', async () => {
    ;(processBalanceOperation as Mock).mockResolvedValue({
      success: false,
      currentBalance: 5
    })

    const result = await generateNanoBanana({
      telegram_id: '123456',
      promptText: 'Transform into Кощей Бессмертный',
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

  test('should handle English language', async () => {
    ;(processBalanceOperation as Mock).mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    ;(sendPhotoWithFallback as Mock).mockResolvedValue(true)

    await generateNanoBanana({
      telegram_id: '123456',
      promptText: 'Transform into hero',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      is_ru: false
    })

    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Generating your image via Google Nano Banana')
    )
  })

  test('should handle Replicate API errors', async () => {
    ;(processBalanceOperation as Mock).mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    mockReplicate.run.mockRejectedValue(new Error('API Error'))

    const result = await generateNanoBanana({
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
    ;(processBalanceOperation as Mock).mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    mockReplicate.run.mockResolvedValue(['https://example.com/image1.jpg', 'https://example.com/image2.jpg'])
    ;(sendPhotoWithFallback as Mock).mockResolvedValue(true)

    const result = await generateNanoBanana({
      telegram_id: '123456',
      promptText: 'Transform',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      is_ru: true
    })

    expect(result).toBe('https://example.com/image1.jpg')
  })

  test('should handle object with url method output', async () => {
    ;(processBalanceOperation as Mock).mockResolvedValue({
      success: true,
      currentBalance: 100
    })
    
    const outputWithUrl = {
      url: () => 'https://example.com/generated.jpg'
    }
    mockReplicate.run.mockResolvedValue(outputWithUrl)
    ;(sendPhotoWithFallback as Mock).mockResolvedValue(true)

    const result = await generateNanoBanana({
      telegram_id: '123456',
      promptText: 'Transform',
      inputImageUrl: 'https://example.com/input.jpg',
      ctx: mockCtx,
      is_ru: true
    })

    expect(result).toBe('https://example.com/generated.jpg')
  })

  test('should handle no image URL in response', async () => {
    ;(processBalanceOperation as Mock).mockResolvedValue({
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
})