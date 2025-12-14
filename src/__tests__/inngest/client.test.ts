/**
 * Tests for inngest client.ts
 *
 * Inngest client configuration and event sending
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock logger before imports
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock Inngest class
const mockSend = vi.fn()
vi.mock('inngest', () => ({
  Inngest: vi.fn().mockImplementation(() => ({
    send: mockSend,
  })),
}))

describe('inngest client', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset modules to re-initialize with new env
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('INNGEST_EVENTS', () => {
    it('should export content events', async () => {
      const { INNGEST_EVENTS } = await import('@/inngest_app/client')

      expect(INNGEST_EVENTS.ANALYZE_COMPETITOR_REELS).toBe('content/analyze-competitor-reels')
      expect(INNGEST_EVENTS.EXTRACT_TOP_CONTENT).toBe('content/extract-top-content')
      expect(INNGEST_EVENTS.FIND_COMPETITORS).toBe('content/find-competitors')
      expect(INNGEST_EVENTS.GENERATE_CONTENT_SCRIPTS).toBe('content/generate-content-scripts')
      expect(INNGEST_EVENTS.GENERATE_DETAILED_SCRIPT).toBe('content/generate-detailed-script')
      expect(INNGEST_EVENTS.GENERATE_SCENARIO_CLIPS).toBe('content/generate-scenario-clips')
    })

    it('should export instagram events', async () => {
      const { INNGEST_EVENTS } = await import('@/inngest_app/client')

      expect(INNGEST_EVENTS.INSTAGRAM_SCRAPER_V2).toBe('instagram/scraper-v2')
      expect(INNGEST_EVENTS.INSTAGRAM_SCRAPER_V2_SIMPLE).toBe('instagram/scraper-v2-simple')
    })

    it('should export monitoring events', async () => {
      const { INNGEST_EVENTS } = await import('@/inngest_app/client')

      expect(INNGEST_EVENTS.CRITICAL_ERROR_MONITOR).toBe('monitoring/critical-error')
      expect(INNGEST_EVENTS.LOG_MONITOR).toBe('monitoring/log-monitor')
    })

    it('should export training events', async () => {
      const { INNGEST_EVENTS } = await import('@/inngest_app/client')

      expect(INNGEST_EVENTS.MODEL_TRAINING_V2).toBe('training/model-v2')
      expect(INNGEST_EVENTS.MORPH_IMAGES).toBe('training/morph-images')
    })

    it('should export generation events', async () => {
      const { INNGEST_EVENTS } = await import('@/inngest_app/client')

      expect(INNGEST_EVENTS.NEURO_IMAGE_GENERATION).toBe('generation/neuro-image')
    })

    it('should export payment events', async () => {
      const { INNGEST_EVENTS } = await import('@/inngest_app/client')

      expect(INNGEST_EVENTS.PAYMENT_PROCESSING).toBe('payments/process')
    })

    it('should export broadcast events', async () => {
      const { INNGEST_EVENTS } = await import('@/inngest_app/client')

      expect(INNGEST_EVENTS.BROADCAST_MESSAGE).toBe('broadcast/message')
    })

    it('should export render events', async () => {
      const { INNGEST_EVENTS } = await import('@/inngest_app/client')

      expect(INNGEST_EVENTS.RENDER).toBe('render/main')
      expect(INNGEST_EVENTS.RENDER_AVATAR_VIDEO).toBe('render/avatar-video')
      expect(INNGEST_EVENTS.RENDER_RIDDLE).toBe('render/riddle')
    })

    it('should export existing video events', async () => {
      const { INNGEST_EVENTS } = await import('@/inngest_app/client')

      expect(INNGEST_EVENTS.GENERATE_AI_REELS).toBe('video/generate-ai-reels')
      expect(INNGEST_EVENTS.GENERATE_ADVANCED_LOOPING).toBe('video/advanced-looping')
      expect(INNGEST_EVENTS.GENERATE_MODEL_TRAINING).toBe('training/generate-model')
    })
  })

  describe('isInngestConfigured', () => {
    it('should return false when both keys are missing', async () => {
      delete process.env.INNGEST_EVENT_KEY
      delete process.env.INNGEST_SIGNING_KEY

      const { isInngestConfigured } = await import('@/inngest_app/client')
      const result = isInngestConfigured()

      expect(result).toBe(false)
    })

    it('should return false when only event key is set', async () => {
      process.env.INNGEST_EVENT_KEY = 'test-event-key'
      delete process.env.INNGEST_SIGNING_KEY

      const { isInngestConfigured } = await import('@/inngest_app/client')
      const result = isInngestConfigured()

      expect(result).toBe(false)
    })

    it('should return false when only signing key is set', async () => {
      delete process.env.INNGEST_EVENT_KEY
      process.env.INNGEST_SIGNING_KEY = 'test-signing-key'

      const { isInngestConfigured } = await import('@/inngest_app/client')
      const result = isInngestConfigured()

      expect(result).toBe(false)
    })

    it('should return true when both keys are set', async () => {
      process.env.INNGEST_EVENT_KEY = 'test-event-key'
      process.env.INNGEST_SIGNING_KEY = 'test-signing-key'

      const { isInngestConfigured } = await import('@/inngest_app/client')
      const result = isInngestConfigured()

      expect(result).toBe(true)
    })
  })

  describe('sendInngestEvent', () => {
    beforeEach(() => {
      vi.resetModules()
      mockSend.mockReset()
    })

    it('should send event successfully', async () => {
      mockSend.mockResolvedValue({ ids: ['event-123'] })

      const { sendInngestEvent, INNGEST_EVENTS } = await import('@/inngest_app/client')
      const { logger } = await import('@/utils/logger')

      await sendInngestEvent(INNGEST_EVENTS.NEURO_IMAGE_GENERATION, {
        userId: '123',
        prompt: 'test prompt',
      })

      expect(mockSend).toHaveBeenCalledWith({
        name: 'generation/neuro-image',
        data: { userId: '123', prompt: 'test prompt' },
      })
      // Check that success was logged (without arguments check due to module init logs)
      expect(logger.info).toHaveBeenCalled()
    })

    it('should throw error on send failure', async () => {
      mockSend.mockRejectedValue(new Error('Network error'))

      const { sendInngestEvent, INNGEST_EVENTS } = await import('@/inngest_app/client')
      const { logger } = await import('@/utils/logger')

      await expect(
        sendInngestEvent(INNGEST_EVENTS.PAYMENT_PROCESSING, { paymentId: '456' })
      ).rejects.toThrow('Network error')

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send event'),
        expect.any(Object)
      )
    })

    it('should log event details before sending', async () => {
      mockSend.mockResolvedValue({ ids: ['event-123'] })

      const { sendInngestEvent, INNGEST_EVENTS } = await import('@/inngest_app/client')
      const { logger } = await import('@/utils/logger')

      await sendInngestEvent(INNGEST_EVENTS.BROADCAST_MESSAGE, {
        message: 'Hello',
        targets: ['user1', 'user2'],
      })

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Sending event'),
        expect.objectContaining({
          eventName: 'broadcast/message',
          dataKeys: ['message', 'targets'],
        })
      )
    })
  })
})
