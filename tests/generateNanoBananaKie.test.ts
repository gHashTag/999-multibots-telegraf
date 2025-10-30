import { describe, test, expect, beforeEach, vi, Mock } from 'bun:test'
import { generateNanoBananaKie } from '@/services/generateNanoBananaKie'
import { processBalanceOperation } from '@/price/helpers/processBalanceOperation'
import { sendPhotoWithFallback } from '@/helpers/sendPhotoWithFallback'
import { MyContext } from '@/interfaces'
import axios from 'axios'

// Mock dependencies
vi.mock('@/utils/logger')
vi.mock('@/price/helpers/processBalanceOperation')
vi.mock('@/helpers/sendPhotoWithFallback')
vi.mock('axios')

describe('generateNanoBananaKie', () => {
  let mockCtx: MyContext
  let mockAxios: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockCtx = {
      botInfo: { username: 'test_bot' },
      reply: vi.fn().mockResolvedValue({ message_id: 123 }),
      deleteMessage: vi.fn().mockResolvedValue(true),
    } as any

    mockAxios = axios as any
    process.env.KIE_AI_API_KEY = 'test-key'
    process.env.BASE_WEBHOOK_URL = 'https://test.com'
  })

  describe('Success scenarios', () => {
    test('should generate image successfully with KIE.AI', async () => {
      // Mock balance check success
      ;(processBalanceOperation as Mock).mockResolvedValue({
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

      // Mock polling responses - first pending, then completed
      mockAxios.get
        .mockResolvedValueOnce({
          data: {
            code: 200,
            data: {
              status: 'pending'
            }
          }
        })
        .mockResolvedValueOnce({
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
      
      ;(sendPhotoWithFallback as Mock).mockResolvedValue(true)

      const result = await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Transform into Илья Муромец',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx,
        username: 'testuser',
        is_ru: true
      })

      expect(result).toBe('https://kie.ai/generated-image.jpg')
      expect(processBalanceOperation).toHaveBeenCalledWith({
        telegram_id: 123456,
        paymentAmount: 8,
        is_ru: true,
        bot_name: 'test_bot',
        ctx: mockCtx
      })
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.kie.ai/api/v1/jobs/createTask',
        {
          model: 'google/nano-banana-edit',
          callBackUrl: 'https://test.com/api/kie-ai/nano-banana/callback',
          input: {
            prompt: 'Transform into Илья Муромец',
            image_urls: ['https://example.com/input.jpg'],
            output_format: 'png',
            image_size: '9:16'
          }
        },
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key'
          }
        })
      )
      expect(sendPhotoWithFallback).toHaveBeenCalled()
    })

    test('should handle different result structures from KIE.AI', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
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
      
      ;(sendPhotoWithFallback as Mock).mockResolvedValue(true)

      const result = await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Test prompt',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx
      })

      expect(result).toBe('https://kie.ai/image1.jpg')
    })

    test('should handle imageUrl in data structure', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
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
            imageUrl: 'https://kie.ai/direct-image.jpg'
          }
        }
      })
      
      ;(sendPhotoWithFallback as Mock).mockResolvedValue(true)

      const result = await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Test prompt',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx
      })

      expect(result).toBe('https://kie.ai/direct-image.jpg')
    })
  })

  describe('Balance and payment scenarios', () => {
    test('should handle insufficient balance', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
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

    test('should handle English insufficient balance message', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
        success: false,
        currentBalance: 3
      })

      const result = await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx,
        is_ru: false
      })

      expect(result).toBeNull()
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient stars')
      )
    })
  })

  describe('Error scenarios', () => {
    test('should handle KIE.AI task creation failure', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
        success: true,
        currentBalance: 100
      })
      
      mockAxios.post.mockResolvedValueOnce({
        data: {
          code: 400,
          msg: 'Invalid request'
        }
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
        '❌ Произошла ошибка при генерации. Попробуйте позже.'
      )
    })

    test('should handle network errors', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
        success: true,
        currentBalance: 100
      })
      
      mockAxios.post.mockRejectedValue(new Error('Network error'))

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

    test('should handle task failure status', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
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
            status: 'failed',
            error: 'Generation failed'
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
    })

    test('should handle timeout scenario', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
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

    test('should handle missing taskId', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
        success: true,
        currentBalance: 100
      })
      
      mockAxios.post.mockResolvedValueOnce({
        data: { code: 200, data: {} } // No taskId
      })

      const result = await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx
      })

      expect(result).toBeNull()
    })

    test('should handle status check API errors', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
        success: true,
        currentBalance: 100
      })
      
      mockAxios.post.mockResolvedValueOnce({
        data: { code: 200, data: { taskId: 'test-task' } }
      })

      mockAxios.get.mockRejectedValue(new Error('Status check failed'))

      const result = await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx
      })

      expect(result).toBeNull()
    })
  })

  describe('Message and status handling', () => {
    test('should send Russian status message', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
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
      
      ;(sendPhotoWithFallback as Mock).mockResolvedValue(true)

      await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx,
        is_ru: true
      })

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Генерирую ваш образ через Google Nano Banana (KIE.AI)')
      )
    })

    test('should send English status message', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
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
      
      ;(sendPhotoWithFallback as Mock).mockResolvedValue(true)

      await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx,
        is_ru: false
      })

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Generating your image via Google Nano Banana (KIE.AI)')
      )
    })

    test('should delete status message after completion', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
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
      
      ;(sendPhotoWithFallback as Mock).mockResolvedValue(true)

      await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx
      })

      expect(mockCtx.deleteMessage).toHaveBeenCalledWith(123)
    })

    test('should handle delete message failure gracefully', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
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
      
      mockCtx.deleteMessage = vi.fn().mockRejectedValue(new Error('Delete failed'))
      ;(sendPhotoWithFallback as Mock).mockResolvedValue(true)

      const result = await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx
      })

      expect(result).toBe('https://test.jpg') // Should still succeed
    })
  })

  describe('Caption and photo sending', () => {
    test('should send photo with correct Russian caption', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
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
      
      ;(sendPhotoWithFallback as Mock).mockResolvedValue(true)

      await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx,
        is_ru: true
      })

      expect(sendPhotoWithFallback).toHaveBeenCalledWith(
        mockCtx,
        'https://test.jpg',
        {
          caption: expect.stringContaining('✨ Ваш образ готов!')
        }
      )

      const captionCall = (sendPhotoWithFallback as Mock).mock.calls[0][2].caption
      expect(captionCall).toContain('Google Nano Banana (KIE.AI)')
      expect(captionCall).toContain('📐 Формат: 9:16 для Instagram Stories')
      expect(captionCall).toContain('💫 Потрачено: 8⭐')
      expect(captionCall).toContain('@test_bot')
    })

    test('should send photo with correct English caption', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
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
      
      ;(sendPhotoWithFallback as Mock).mockResolvedValue(true)

      await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx,
        is_ru: false
      })

      const captionCall = (sendPhotoWithFallback as Mock).mock.calls[0][2].caption
      expect(captionCall).toContain('✨ Your image is ready!')
      expect(captionCall).toContain('Google Nano Banana (KIE.AI)')
      expect(captionCall).toContain('📐 Format: 9:16 for Instagram Stories')
      expect(captionCall).toContain('💫 Spent: 8⭐')
    })
  })

  describe('Admin notification on errors', () => {
    test('should send admin notification on API errors', async () => {
      process.env.ADMIN_IDS = '111,222'
      
      const mockTelegram = {
        sendMessage: vi.fn().mockResolvedValue(true)
      }
      mockCtx.telegram = mockTelegram as any

      ;(processBalanceOperation as Mock).mockResolvedValue({
        success: true,
        currentBalance: 100
      })
      
      mockAxios.post.mockRejectedValue(new Error('KIE.AI API Error'))

      await generateNanoBananaKie({
        telegram_id: '123456',
        promptText: 'Transform',
        inputImageUrl: 'https://example.com/input.jpg',
        ctx: mockCtx,
        username: 'testuser'
      })

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        '111',
        expect.stringContaining('🚨 Ошибка в generateNanoBananaKie')
      )
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        '222',
        expect.stringContaining('🚨 Ошибка в generateNanoBananaKie')
      )
    })
  })
})