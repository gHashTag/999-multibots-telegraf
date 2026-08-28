/**
 * Function Invocation Tests via MCP
 * Tests all Inngest functions through MCP interface
 */

import { describe, it, expect, beforeAll } from 'vitest'
import axios from 'axios'

// Требуется ЗАПУЩЕННЫЙ dev-сервер Inngest (npx inngest-cli@latest dev).
// Без него файл падал с «Inngest dev server is not running» — это состояние
// окружения, а не дефект кода. Включается переменной INNGEST_DEV_SERVER=1.
const HAS_INNGEST_DEV = process.env.INNGEST_DEV_SERVER === '1'

const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL || 'http://127.0.0.1:8288'

interface EventResponse {
  ids: string[]
  status: number
}

async function sendEvent(
  name: string,
  data: Record<string, any>
): Promise<EventResponse> {
  const response = await axios.post(`${INNGEST_DEV_URL}/e/local`, {
    name,
    data,
    ts: Date.now(),
  })
  return response.data
}

describe.skipIf(!HAS_INNGEST_DEV)('Function Invocation via MCP', () => {
  beforeAll(async () => {
    // Verify dev server is running
    const response = await axios.get(`${INNGEST_DEV_URL}/health`)
    expect(response.status).toBe(200)
  })

  describe('Test Functions', () => {
    it('should invoke testSimpleFunction', async () => {
      const result = await sendEvent('test/simple', {
        message: 'Test simple function via MCP',
        userId: 'mcp-test-user',
      })

      expect(result.ids).toBeInstanceOf(Array)
      expect(result.ids.length).toBeGreaterThan(0)
      expect(result.status).toBe(200)
    })

    it('should invoke testSimpleMessageFunction', async () => {
      const result = await sendEvent('test/simple-message', {
        message: 'Test message function',
        chatId: 123456,
      })

      expect(result.ids).toBeInstanceOf(Array)
      expect(result.status).toBe(200)
    })

    it('should invoke testAdvancedLoopFunction', async () => {
      const result = await sendEvent('test/advanced-loop', {
        userId: 'loop-test',
        iterations: 3,
      })

      expect(result.ids).toBeInstanceOf(Array)
      expect(result.status).toBe(200)
    })
  })

  describe('Content Functions', () => {
    it('should invoke analyzeCompetitorReels', async () => {
      const result = await sendEvent('content/analyze-competitor-reels', {
        userId: 'content-test',
        competitors: ['competitor1', 'competitor2'],
      })

      expect(result.status).toBe(200)
    })

    it('should invoke extractTopContent', async () => {
      const result = await sendEvent('content/extract-top', {
        userId: 'content-test',
        count: 10,
      })

      expect(result.status).toBe(200)
    })

    it('should invoke findCompetitors', async () => {
      const result = await sendEvent('content/find-competitors', {
        userId: 'content-test',
        niche: 'tech',
      })

      expect(result.status).toBe(200)
    })

    it('should invoke generateContentScripts', async () => {
      const result = await sendEvent('content/generate-scripts', {
        userId: 'content-test',
        topic: 'AI trends',
      })

      expect(result.status).toBe(200)
    })

    it('should invoke generateDetailedScript', async () => {
      const result = await sendEvent('content/generate-detailed-script', {
        userId: 'content-test',
        scriptId: 1,
      })

      expect(result.status).toBe(200)
    })

    it('should invoke generateScenarioClips', async () => {
      const result = await sendEvent('content/generate-scenario-clips', {
        userId: 'content-test',
        scenarioId: 1,
      })

      expect(result.status).toBe(200)
    })
  })

  describe('Render Functions', () => {
    it('should invoke render function', async () => {
      const result = await sendEvent('render/start', {
        userId: 'render-test',
        templateId: 1,
        videoId: 'test-video',
      })

      expect(result.status).toBe(200)
    })

    it('should invoke renderAvatarVideo', async () => {
      const result = await sendEvent('render/avatar', {
        userId: 'render-test',
        avatarId: 'test-avatar',
        script: 'Test script',
      })

      expect(result.status).toBe(200)
    })

    it('should invoke renderRiddle', async () => {
      const result = await sendEvent('render/riddle', {
        userId: 'render-test',
        riddleId: 1,
      })

      expect(result.status).toBe(200)
    })
  })

  describe('Training Functions', () => {
    it('should invoke modelTrainingV2', async () => {
      const result = await sendEvent('training/model.v2', {
        userId: 'training-test',
        modelName: 'test-model',
        images: ['img1.jpg', 'img2.jpg'],
      })

      expect(result.status).toBe(200)
    })

    it('should invoke morphImages', async () => {
      const result = await sendEvent('training/morph', {
        userId: 'training-test',
        sourceImage: 'source.jpg',
        targetImage: 'target.jpg',
      })

      expect(result.status).toBe(200)
    })
  })

  describe('Generation Functions', () => {
    it('should invoke neuroImageGeneration', async () => {
      const result = await sendEvent('generation/neuro-image', {
        userId: 'generation-test',
        prompt: 'A beautiful landscape',
        style: 'realistic',
      })

      expect(result.status).toBe(200)
    })
  })

  describe('Payment Functions', () => {
    it('should invoke paymentProcessing', async () => {
      const result = await sendEvent('payment/process', {
        userId: 'payment-test',
        amount: 100,
        currency: 'USD',
      })

      expect(result.status).toBe(200)
    })
  })

  describe('Broadcast Functions', () => {
    it('should invoke broadcastMessage', async () => {
      const result = await sendEvent('broadcast/message', {
        userId: 'broadcast-test',
        message: 'Test broadcast',
        recipients: ['user1', 'user2'],
      })

      expect(result.status).toBe(200)
    })
  })

  describe('Instagram Functions', () => {
    it('should invoke instagramScraper-v2', async () => {
      const result = await sendEvent('instagram/scrape.v2', {
        userId: 'instagram-test',
        username: 'test_user',
      })

      expect(result.status).toBe(200)
    })

    it('should invoke instagramScraper-v2-simple', async () => {
      const result = await sendEvent('instagram/scrape.v2.simple', {
        userId: 'instagram-test',
        username: 'test_user',
      })

      expect(result.status).toBe(200)
    })
  })

  describe('Monitoring Functions', () => {
    it('should invoke criticalErrorMonitor', async () => {
      const result = await sendEvent('monitoring/critical-error', {
        error: 'Test critical error',
        severity: 'high',
      })

      expect(result.status).toBe(200)
    })

    it('should invoke logMonitor', async () => {
      const result = await sendEvent('monitoring/log', {
        level: 'info',
        message: 'Test log entry',
      })

      expect(result.status).toBe(200)
    })
  })

  describe('Existing Functions', () => {
    it('should invoke generateAIReelsFunction', async () => {
      const result = await sendEvent('ai-reels/generate', {
        userId: 'ai-reels-test',
        topic: 'Test topic',
      })

      expect(result.status).toBe(200)
    })

    it('should invoke generateAdvancedLoopingVideoFunction', async () => {
      const result = await sendEvent('video/advanced-loop', {
        userId: 'loop-test',
        videoUrl: 'https://example.com/video.mp4',
      })

      expect(result.status).toBe(200)
    })

    it('should invoke generateModelTrainingFunction', async () => {
      const result = await sendEvent('training/model', {
        userId: 'training-test',
        modelName: 'test-model-existing',
      })

      expect(result.status).toBe(200)
    })
  })

  describe('Callback Functions', () => {
    it('should invoke aiReelsCallbackFunction', async () => {
      const result = await sendEvent('ai-reels/callback', {
        jobId: 'test-job-123',
        status: 'completed',
        result: { videoUrl: 'https://example.com/result.mp4' },
      })

      expect(result.status).toBe(200)
    })
  })

  describe('Batch Processing', () => {
    it('should handle multiple events in sequence', async () => {
      const events = [
        { name: 'test/simple', data: { message: 'Batch 1' } },
        { name: 'test/simple', data: { message: 'Batch 2' } },
        { name: 'test/simple', data: { message: 'Batch 3' } },
      ]

      for (const event of events) {
        const result = await sendEvent(event.name, event.data)
        expect(result.status).toBe(200)
      }
    })

    it('should handle concurrent events', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        sendEvent('test/simple', {
          message: `Concurrent ${i}`,
          index: i,
        })
      )

      const results = await Promise.all(promises)

      results.forEach(result => {
        expect(result.status).toBe(200)
      })
    })
  })

  describe('Error Scenarios', () => {
    it('should handle events with missing data', async () => {
      const result = await sendEvent('test/simple', {})
      expect(result.status).toBe(200)
    })

    it('should handle events with invalid data types', async () => {
      const result = await sendEvent('test/simple', {
        userId: null,
        message: undefined,
      })
      expect(result.status).toBe(200)
    })

    it('should handle non-existent event names', async () => {
      const result = await sendEvent('does/not/exist', {
        data: 'test',
      })
      expect(result.status).toBe(200)
    })
  })

  describe('Performance', () => {
    it('should handle rapid event submission', async () => {
      const start = Date.now()

      const promises = Array.from({ length: 20 }, (_, i) =>
        sendEvent('test/simple', {
          message: `Performance test ${i}`,
        })
      )

      await Promise.all(promises)

      const duration = Date.now() - start

      // Should complete quickly
      expect(duration).toBeLessThan(10000)
    })

    it('should maintain performance under load', async () => {
      const iterations = 50
      const batchSize = 10
      const results: number[] = []

      for (let i = 0; i < iterations / batchSize; i++) {
        const start = Date.now()

        const promises = Array.from({ length: batchSize }, (_, j) =>
          sendEvent('test/simple', {
            iteration: i,
            batch: j,
          })
        )

        await Promise.all(promises)

        results.push(Date.now() - start)
      }

      const avgDuration = results.reduce((a, b) => a + b, 0) / results.length

      // Average batch should be fast
      expect(avgDuration).toBeLessThan(3000)
    })
  })
})
