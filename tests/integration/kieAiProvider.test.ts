/**
 * 🟢 GREEN Phase: Integration Tests for KieAiProvider
 *
 * Tests API integration with mocked responses
 * NO real API calls - all mocked for safety and speed
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { KieAiProvider } from '@/services/video-providers/KieAiProvider'
import axios from 'axios'
import * as dotenv from 'dotenv'

dotenv.config()

// Mock axios to prevent real API calls
vi.mock('axios')

describe('🧪 KieAiProvider Integration Tests', () => {
  let provider: KieAiProvider

  beforeEach(() => {
    // Ensure API key is loaded from .env
    if (!process.env.KIE_AI_API_KEY) {
      console.error('❌ ERROR: KIE_AI_API_KEY not found in .env!')
      process.exit(1)
    }

    provider = new KieAiProvider()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Constructor and Configuration', () => {
    it('should initialize with API key from environment', () => {
      expect(provider).toBeDefined()
      expect(provider).toBeInstanceOf(KieAiProvider)
    })

    it('should work in test mode without API key', () => {
      const originalKey = process.env.KIE_AI_API_KEY
      delete process.env.KIE_AI_API_KEY

      const testProvider = new KieAiProvider()
      expect(testProvider).toBeDefined()

      process.env.KIE_AI_API_KEY = originalKey
    })
  })

  describe('Veo 3 Video Generation (Text-to-Video)', () => {
    it('should successfully generate text-to-video with veo3_fast', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: 'Success',
          data: {
            taskId: 'test-task-id-12345678',
            videoUrl: 'https://example.com/video.mp4',
            duration: 8,
          },
          processingTime: 5000,
        },
      }

      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

      const result = await provider.generateVideo({
        model: 'veo3_fast',
        prompt: 'A beautiful sunset over the ocean',
        duration: 8,
        aspectRatio: '16:9',
      })

      expect(result.success).toBe(true)
      expect(result.data?.taskId).toBe('test-task-id-12345678')
      expect(result.cost.stars).toBe(40)
      expect(result.provider).toContain('Veo')
    })

    it('should handle portrait aspect ratio for veo3', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: 'Success',
          data: {
            taskId: 'test-portrait-task',
          },
        },
      }

      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

      const result = await provider.generateVideo({
        model: 'veo3',
        prompt: 'A vertical video for social media',
        duration: 8,
        aspectRatio: '9:16',
      })

      expect(result.success).toBe(true)
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          aspectRatio: '9:16',
        }),
        expect.any(Object)
      )
    })

    it('should include callback URL in request', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: 'Success',
          data: { taskId: 'test-callback-task' },
        },
      }

      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

      await provider.generateVideo({
        model: 'veo3_fast',
        prompt: 'Test video',
        duration: 8,
      })

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          callBackUrl: expect.stringContaining('/api/kie-ai/callback'),
        }),
        expect.any(Object)
      )
    })

    it('should handle API errors gracefully', async () => {
      vi.mocked(axios.post).mockRejectedValueOnce(
        new Error('Network error')
      )

      const result = await provider.generateVideo({
        model: 'veo3_fast',
        prompt: 'Test prompt',
        duration: 8,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Network error')
      expect(result.cost.stars).toBe(0)
    })
  })

  describe('Veo 3 Video Generation (Image-to-Video)', () => {
    it('should generate image-to-video with veo3_fast', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: 'Success',
          data: {
            taskId: 'test-image-task',
            videoUrl: 'https://example.com/image-video.mp4',
          },
        },
      }

      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

      const result = await provider.generateVideo({
        model: 'veo3_fast',
        prompt: 'Animate this image',
        duration: 8,
        aspectRatio: '16:9',
        imageUrl: 'https://example.com/image.jpg',
      })

      expect(result.success).toBe(true)
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          imageUrls: expect.arrayContaining(['https://example.com/image.jpg']),
        }),
        expect.any(Object)
      )
    })

    it('should extract Telegram file_id as imageKey', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: 'Success',
          data: { taskId: 'telegram-image-task' },
        },
      }

      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

      await provider.generateVideo({
        model: 'veo3_fast',
        prompt: 'Animate',
        imageUrl:
          'https://api.telegram.org/file/bot123456/photos/AgACAgIAAxkBAAIC.jpg',
      })

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          imageKey: 'AgACAgIAAxkBAAIC',
        }),
        expect.any(Object)
      )
    })
  })

  describe('Runway Aleph Generation', () => {
    it('should generate video with runway-aleph model', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: 'Success',
          data: {
            taskId: 'runway-task-123',
          },
        },
      }

      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

      const result = await provider.generateVideo({
        model: 'runway-aleph',
        prompt: 'Cinematic shot',
        duration: 4,
      })

      expect(result.success).toBe(true)
      expect(result.provider).toBe('Runway API')
    })

    it('should calculate dynamic pricing for runway-aleph', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: 'Success',
          data: { taskId: 'runway-pricing-test' },
        },
      }

      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

      const result4sec = await provider.generateVideo({
        model: 'runway-aleph',
        prompt: 'Test',
        duration: 4,
      })

      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

      const result8sec = await provider.generateVideo({
        model: 'runway-aleph',
        prompt: 'Test',
        duration: 8,
      })

      expect(result8sec.cost.stars).toBeGreaterThan(result4sec.cost.stars)
    })
  })

  describe('Sora 2 Video Generation', () => {
    it('should create Sora 2 task with correct parameters', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: 'Task created',
          data: {
            taskId: 'sora-task-abc123',
          },
        },
      }

      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

      const result = await provider.generateSoraVideo(
        'A cinematic shot of Tokyo at night',
        'sora-2-text-to-video',
        'landscape',
        false
      )

      expect(result.success).toBe(true)
      expect(result.data?.taskId).toBe('sora-task-abc123')
      expect(result.cost.stars).toBe(2500)
      expect(result.provider).toBe('Sora 2 API')
    })

    it('should use Sora 2 Pro pricing for pro model', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: 'Task created',
          data: { taskId: 'sora-pro-task' },
        },
      }

      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

      const result = await provider.generateSoraVideo(
        'Professional video',
        'sora-2-pro-text-to-video',
        'landscape',
        false
      )

      expect(result.success).toBe(true)
      expect(result.cost.stars).toBe(3333)
      expect(result.provider).toBe('Sora 2 Pro API')
    })

    it('should include callback URL for Sora', async () => {
      const mockResponse = {
        data: {
          code: 200,
          data: { taskId: 'sora-callback-test' },
        },
      }

      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

      await provider.generateSoraVideo(
        'Test',
        'sora-2-text-to-video',
        'landscape'
      )

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/jobs/createTask'),
        expect.objectContaining({
          callBackUrl: expect.stringContaining('/api/kie-ai/sora-callback'),
        }),
        expect.any(Object)
      )
    })
  })

  describe('Video Status Checking', () => {
    it('should check Veo task status successfully', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: 'Success',
          data: {
            successFlag: 1,
            response: {
              resultUrls: ['https://example.com/completed-video.mp4'],
              duration: 8,
            },
          },
        },
      }

      vi.mocked(axios.get).mockResolvedValueOnce(mockResponse)

      const result = await provider.checkVideoStatus('test-task-123')

      expect(result.success).toBe(true)
      expect(result.data?.videoUrl).toBe('https://example.com/completed-video.mp4')
    })

    it('should handle processing status for Veo', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: 'Processing',
          data: {
            successFlag: 0,
          },
        },
      }

      vi.mocked(axios.get).mockResolvedValueOnce(mockResponse)

      const result = await provider.checkVideoStatus('processing-task')

      expect(result.success).toBe(true)
      expect(result.data?.videoUrl).toBeUndefined()
    })

    it('should handle content policy rejection (successFlag: 3)', async () => {
      const mockResponse = {
        data: {
          code: 200,
          data: {
            successFlag: 3,
            errorMessage: 'Content rejected by Google policy',
          },
        },
      }

      vi.mocked(axios.get).mockResolvedValueOnce(mockResponse)

      const result = await provider.checkVideoStatus('rejected-task')

      expect(result.success).toBe(false)
      expect(result.error).toContain('policy')
    })

    it('should check Sora task status', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: 'Success',
          data: {
            taskId: 'sora-status-test',
            status: 'completed',
            successFlag: 1,
            videoUrl: 'https://example.com/sora-video.mp4',
          },
        },
      }

      vi.mocked(axios.get).mockResolvedValueOnce(mockResponse)

      const result = await provider.checkSoraTaskStatus('sora-status-test')

      expect(result.success).toBe(true)
      expect(result.data?.videoUrl).toBe('https://example.com/sora-video.mp4')
    })
  })

  describe('Sora Task Polling', () => {
    it('should poll until video is ready', async () => {
      // First call: processing
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            status: 'processing',
            successFlag: 0,
          },
        },
      })

      // Second call: completed
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            status: 'completed',
            successFlag: 1,
            videoUrl: 'https://example.com/final.mp4',
          },
        },
      })

      const result = await provider.pollSoraTaskStatus('poll-test', 30000)

      expect(result.success).toBe(true)
      expect(result.data?.videoUrl).toBe('https://example.com/final.mp4')
      expect(axios.get).toHaveBeenCalledTimes(2)
    })

    it('should timeout after max wait time', async () => {
      // Always return processing
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          code: 200,
          data: {
            status: 'processing',
            successFlag: 0,
          },
        },
      })

      const result = await provider.pollSoraTaskStatus('timeout-test', 5000)

      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
    })
  })

  describe('Account Balance', () => {
    it('should get account balance successfully', async () => {
      const mockResponse = {
        data: {
          code: 200,
          msg: 'Success',
          data: 1000,
        },
      }

      vi.mocked(axios.get).mockResolvedValueOnce(mockResponse)

      const result = await provider.getAccountBalance()

      expect(result.credits).toBe(1000)
    })

    it('should handle API error for balance check', async () => {
      vi.mocked(axios.get).mockRejectedValueOnce(new Error('Auth failed'))

      await expect(provider.getAccountBalance()).rejects.toThrow()
    })
  })

  describe('Error Handling and Retries', () => {
    it('should retry on 429 rate limit error', async () => {
      // First call: rate limit
      vi.mocked(axios.post).mockRejectedValueOnce({
        response: { status: 429 },
      })

      // Second call: success
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          data: { taskId: 'retry-success' },
        },
      })

      const result = await provider.generateVideo({
        model: 'veo3_fast',
        prompt: 'Test retry',
      })

      expect(result.success).toBe(true)
      expect(axios.post).toHaveBeenCalledTimes(2)
    })

    it('should retry on 500 server error', async () => {
      // First call: server error
      vi.mocked(axios.post).mockRejectedValueOnce({
        response: { status: 500 },
      })

      // Second call: success
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          data: { taskId: 'server-error-retry' },
        },
      })

      const result = await provider.generateVideo({
        model: 'veo3_fast',
        prompt: 'Test server error',
      })

      expect(result.success).toBe(true)
    })

    it('should not retry on 400 bad request', async () => {
      vi.mocked(axios.post).mockRejectedValueOnce({
        response: { status: 400, data: 'Invalid request' },
      })

      const result = await provider.generateVideo({
        model: 'veo3_fast',
        prompt: 'Bad request test',
      })

      expect(result.success).toBe(false)
      expect(axios.post).toHaveBeenCalledTimes(1)
    })
  })

  describe('Cost Calculations', () => {
    it('should calculate Veo 3 Fast cost correctly (40 stars)', async () => {
      const mockResponse = {
        data: {
          code: 200,
          data: { taskId: 'cost-test-veo-fast' },
        },
      }

      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

      const result = await provider.generateVideo({
        model: 'veo3_fast',
        prompt: 'Cost test',
        duration: 8,
      })

      expect(result.cost.stars).toBe(40)
    })

    it('should calculate Veo 3 cost correctly (202 stars)', async () => {
      const mockResponse = {
        data: {
          code: 200,
          data: { taskId: 'cost-test-veo' },
        },
      }

      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

      const result = await provider.generateVideo({
        model: 'veo3',
        prompt: 'Cost test',
        duration: 8,
      })

      expect(result.cost.stars).toBe(202)
    })

    it('should convert USD to stars correctly', async () => {
      const mockResponse = {
        data: {
          code: 200,
          data: { taskId: 'usd-conversion-test' },
        },
      }

      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

      const result = await provider.generateVideo({
        model: 'veo3_fast',
        prompt: 'USD test',
      })

      expect(result.cost.usd).toBeGreaterThan(0)
      expect(result.cost.stars).toBeGreaterThan(0)
      // Stars should be greater than USD due to markup
      expect(result.cost.stars).toBeGreaterThan(result.cost.usd)
    })
  })
})
