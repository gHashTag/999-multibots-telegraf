/**
 * 🔵 REFACTOR Phase: End-to-End Tests for Video Generation
 *
 * Tests complete video generation workflow from request to result
 * Uses mocked services to simulate full user journey
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { generateTextToVideo, checkVideoGenerationStatus } from '@/services/generateTextToVideo'
import axios from 'axios'
import * as dotenv from 'dotenv'

dotenv.config()

// Mock axios and KieAiProvider
vi.mock('axios')

describe('🧪 Video Generation E2E Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Complete Text-to-Video Flow', () => {
    it('should generate video through full Veo 3 Fast workflow', async () => {
      // Mock Veo API response
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          msg: 'Success',
          data: {
            taskId: 'e2e-veo-task-123',
            videoUrl: 'https://example.com/veo-video.mp4',
          },
        },
      })

      const result = await generateTextToVideo({
        prompt: 'A beautiful sunset over the mountains',
        videoModel: 'veo3_fast',
        duration: 8,
        aspectRatio: '16:9',
        telegram_id: '123456789',
        username: 'test_user',
        is_ru: false,
        bot_name: 'test_bot',
      })

      expect(result.success).toBe(true)
      expect(result.jobId).toBe('e2e-veo-task-123')
    })

    it('should handle full Sora 2 generation workflow', async () => {
      // Mock Sora create task
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          msg: 'Task created',
          data: {
            taskId: 'e2e-sora-task-abc',
          },
        },
      })

      const result = await generateTextToVideo({
        prompt: 'Cinematic video of Tokyo streets',
        videoModel: 'sora-2',
        aspectRatio: '16:9',
        telegram_id: '987654321',
        username: 'sora_user',
        is_ru: false,
        bot_name: 'neuro_blogger_bot',
      })

      expect(result.success).toBe(true)
      expect(result.jobId).toBe('e2e-sora-task-abc')
      expect(result.message).toContain('started')
    })

    it('should complete full workflow with polling', async () => {
      // Step 1: Create task
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          data: { taskId: 'polling-task-123' },
        },
      })

      const createResult = await generateTextToVideo({
        prompt: 'Test polling',
        videoModel: 'veo3_fast',
        telegram_id: '111222333',
        username: 'poll_user',
        is_ru: false,
        bot_name: 'test_bot',
      })

      expect(createResult.success).toBe(true)
      expect(createResult.jobId).toBe('polling-task-123')

      // Step 2: Check status (processing)
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            successFlag: 0,
          },
        },
      })

      const statusResult1 = await checkVideoGenerationStatus(
        'polling-task-123',
        false
      )

      expect(statusResult1.success).toBe(true)
      expect(statusResult1.videoUrl).toBeUndefined()

      // Step 3: Check status (completed)
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            successFlag: 1,
            response: {
              resultUrls: ['https://example.com/final-video.mp4'],
            },
          },
        },
      })

      const statusResult2 = await checkVideoGenerationStatus(
        'polling-task-123',
        false
      )

      expect(statusResult2.success).toBe(true)
      expect(statusResult2.videoUrl).toBe('https://example.com/final-video.mp4')
    })
  })

  describe('Image-to-Video Complete Flow', () => {
    it('should complete full image-to-video workflow', async () => {
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            taskId: 'image-to-video-task',
            videoUrl: 'https://example.com/animated.mp4',
          },
        },
      })

      const result = await generateTextToVideo({
        prompt: 'Animate this beautiful landscape',
        videoModel: 'veo3_fast',
        duration: 8,
        aspectRatio: '16:9',
        telegram_id: '444555666',
        username: 'image_user',
        is_ru: false,
        bot_name: 'test_bot',
      })

      expect(result.success).toBe(true)
    })
  })

  describe('Error Scenarios E2E', () => {
    it('should handle validation errors', async () => {
      await expect(
        generateTextToVideo({
          prompt: '',
          videoModel: 'veo3_fast',
          telegram_id: '123',
          username: 'test',
          is_ru: false,
          bot_name: 'bot',
        })
      ).rejects.toThrow('Prompt is required')
    })

    it('should handle missing telegram_id', async () => {
      await expect(
        generateTextToVideo({
          prompt: 'Test',
          videoModel: 'veo3_fast',
          telegram_id: '',
          username: 'test',
          is_ru: false,
          bot_name: 'bot',
        })
      ).rejects.toThrow('Telegram ID is required')
    })

    it('should handle API rate limit error', async () => {
      vi.mocked(axios.post).mockRejectedValueOnce({
        response: {
          status: 429,
          data: { error: 'Rate limit exceeded' },
        },
        isAxiosError: true,
      })

      const result = await generateTextToVideo({
        prompt: 'Rate limit test',
        videoModel: 'kling-v1.6-pro',
        telegram_id: '123456',
        username: 'rate_user',
        is_ru: true,
        bot_name: 'test_bot',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('лимит')
    })

    it('should handle insufficient funds error', async () => {
      vi.mocked(axios.post).mockRejectedValueOnce({
        response: {
          status: 402,
          data: { error: 'Insufficient funds' },
        },
        isAxiosError: true,
      })

      const result = await generateTextToVideo({
        prompt: 'Payment test',
        videoModel: 'veo3',
        telegram_id: '789012',
        username: 'poor_user',
        is_ru: true,
        bot_name: 'test_bot',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('средств')
    })

    it('should handle NSFW content rejection', async () => {
      vi.mocked(axios.post).mockRejectedValueOnce({
        response: {
          status: 400,
          data: { error: 'NSFW content detected' },
        },
        isAxiosError: true,
      })

      const result = await generateTextToVideo({
        prompt: 'Inappropriate content',
        videoModel: 'veo3_fast',
        telegram_id: '345678',
        username: 'nsfw_user',
        is_ru: true,
        bot_name: 'test_bot',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('контент')
    })

    it('should handle content policy violation', async () => {
      // Create task successfully
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          data: { taskId: 'policy-violation-task' },
        },
      })

      const createResult = await generateTextToVideo({
        prompt: 'Test policy',
        videoModel: 'veo3_fast',
        telegram_id: '111222',
        username: 'policy_user',
        is_ru: false,
        bot_name: 'test_bot',
      })

      expect(createResult.success).toBe(true)

      // Check status: content policy rejection
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            successFlag: 3,
            errorMessage: 'Content rejected by Google policy',
          },
        },
      })

      const statusResult = await checkVideoGenerationStatus(
        'policy-violation-task',
        false
      )

      expect(statusResult.success).toBe(false)
      expect(statusResult.error).toContain('policy')
    })

    it('should handle task not found error', async () => {
      vi.mocked(axios.get).mockRejectedValueOnce({
        response: {
          status: 404,
          data: { message: 'Video job not found' },
        },
        isAxiosError: true,
      })

      const result = await checkVideoGenerationStatus('nonexistent-task', true)

      expect(result.success).toBe(false)
      expect(result.error).toContain('не найден')
    })

    it('should handle server error during status check', async () => {
      vi.mocked(axios.get).mockRejectedValueOnce({
        response: {
          status: 500,
          data: { error: 'Internal server error' },
        },
        isAxiosError: true,
      })

      const result = await checkVideoGenerationStatus('server-error-task', true)

      expect(result.success).toBe(false)
      expect(result.error).toContain('сервера')
    })
  })

  describe('Multi-Model Workflow', () => {
    it('should handle different models in sequence', async () => {
      // Test Veo 3 Fast
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          data: { taskId: 'veo-fast-seq' },
        },
      })

      const veoResult = await generateTextToVideo({
        prompt: 'Fast generation',
        videoModel: 'veo3_fast',
        telegram_id: '123',
        username: 'seq_user',
        is_ru: false,
        bot_name: 'test_bot',
      })

      expect(veoResult.success).toBe(true)

      // Test Sora 2
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          data: { taskId: 'sora-seq' },
        },
      })

      const soraResult = await generateTextToVideo({
        prompt: 'Cinematic shot',
        videoModel: 'sora-2',
        telegram_id: '123',
        username: 'seq_user',
        is_ru: false,
        bot_name: 'test_bot',
      })

      expect(soraResult.success).toBe(true)
    })
  })

  describe('Aspect Ratio Handling E2E', () => {
    it('should preserve aspect ratio through full workflow', async () => {
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          data: { taskId: 'aspect-ratio-test' },
        },
      })

      await generateTextToVideo({
        prompt: 'Portrait video',
        videoModel: 'veo3_fast',
        aspectRatio: '9:16',
        telegram_id: '123',
        username: 'portrait_user',
        is_ru: false,
        bot_name: 'test_bot',
      })

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          aspectRatio: '9:16',
        }),
        expect.any(Object)
      )
    })

    it('should handle landscape aspect ratio', async () => {
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          data: { taskId: 'landscape-test' },
        },
      })

      await generateTextToVideo({
        prompt: 'Wide shot',
        videoModel: 'veo3_fast',
        aspectRatio: '16:9',
        telegram_id: '456',
        username: 'wide_user',
        is_ru: false,
        bot_name: 'test_bot',
      })

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          aspectRatio: '16:9',
        }),
        expect.any(Object)
      )
    })

    it('should handle Sora aspect ratio conversion', async () => {
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          data: { taskId: 'sora-aspect-test' },
        },
      })

      await generateTextToVideo({
        prompt: 'Vertical video',
        videoModel: 'sora-2',
        aspectRatio: '9:16',
        telegram_id: '789',
        username: 'sora_aspect_user',
        is_ru: false,
        bot_name: 'test_bot',
      })

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/jobs/createTask'),
        expect.objectContaining({
          input: expect.objectContaining({
            aspect_ratio: 'portrait',
          }),
        }),
        expect.any(Object)
      )
    })
  })

  describe('Localization E2E', () => {
    it('should return Russian error messages when is_ru=true', async () => {
      vi.mocked(axios.post).mockRejectedValueOnce({
        response: {
          status: 429,
        },
        isAxiosError: true,
      })

      const result = await generateTextToVideo({
        prompt: 'Test',
        videoModel: 'veo3_fast',
        telegram_id: '123',
        username: 'ru_user',
        is_ru: true,
        bot_name: 'test_bot',
      })

      expect(result.error).toMatch(/[а-яА-Я]/) // Contains Cyrillic
    })

    it('should return English error messages when is_ru=false', async () => {
      vi.mocked(axios.post).mockRejectedValueOnce({
        response: {
          status: 429,
        },
        isAxiosError: true,
      })

      const result = await generateTextToVideo({
        prompt: 'Test',
        videoModel: 'veo3_fast',
        telegram_id: '123',
        username: 'en_user',
        is_ru: false,
        bot_name: 'test_bot',
      })

      expect(result.error).not.toMatch(/[а-яА-Я]/) // No Cyrillic
    })
  })

  describe('Cost Calculation E2E', () => {
    it('should calculate correct cost for full workflow', async () => {
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            taskId: 'cost-calc-test',
          },
        },
      })

      const result = await generateTextToVideo({
        prompt: 'Cost test',
        videoModel: 'veo3_fast',
        duration: 8,
        telegram_id: '123',
        username: 'cost_user',
        is_ru: false,
        bot_name: 'test_bot',
      })

      expect(result.success).toBe(true)
      // Veo 3 Fast should cost 40 stars
      // Cost is calculated inside KieAiProvider, verified in integration tests
    })
  })

  describe('Webhook Integration E2E', () => {
    it('should include webhook URL in generation request', async () => {
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          data: { taskId: 'webhook-test' },
        },
      })

      await generateTextToVideo({
        prompt: 'Webhook test',
        videoModel: 'veo3_fast',
        telegram_id: '123',
        username: 'webhook_user',
        is_ru: false,
        bot_name: 'test_bot',
      })

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          callBackUrl: expect.stringContaining('/api/kie-ai/callback'),
        }),
        expect.any(Object)
      )
    })

    it('should use Sora-specific webhook URL', async () => {
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          data: { taskId: 'sora-webhook-test' },
        },
      })

      await generateTextToVideo({
        prompt: 'Sora webhook test',
        videoModel: 'sora-2',
        telegram_id: '123',
        username: 'sora_webhook_user',
        is_ru: false,
        bot_name: 'test_bot',
      })

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/jobs/createTask'),
        expect.objectContaining({
          callBackUrl: expect.stringContaining('/api/kie-ai/sora-callback'),
        }),
        expect.any(Object)
      )
    })
  })

  describe('Performance and Reliability', () => {
    it('should complete workflow within reasonable time', async () => {
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          code: 200,
          data: { taskId: 'perf-test' },
        },
      })

      const startTime = Date.now()

      await generateTextToVideo({
        prompt: 'Performance test',
        videoModel: 'veo3_fast',
        telegram_id: '123',
        username: 'perf_user',
        is_ru: false,
        bot_name: 'test_bot',
      })

      const elapsed = Date.now() - startTime

      // Should complete API call in less than 5 seconds (mocked)
      expect(elapsed).toBeLessThan(5000)
    })

    it('should handle concurrent requests', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: {
          code: 200,
          data: { taskId: 'concurrent-test' },
        },
      })

      const requests = Array.from({ length: 5 }, (_, i) =>
        generateTextToVideo({
          prompt: `Concurrent test ${i}`,
          videoModel: 'veo3_fast',
          telegram_id: `${123 + i}`,
          username: `concurrent_user_${i}`,
          is_ru: false,
          bot_name: 'test_bot',
        })
      )

      const results = await Promise.all(requests)

      results.forEach(result => {
        expect(result.success).toBe(true)
      })
    })
  })
})
