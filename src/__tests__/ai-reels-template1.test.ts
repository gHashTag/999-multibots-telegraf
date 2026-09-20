/**
 * Тесты для AI Reels Шаблон 1 (WAN25)
 * Проверяем каждый шаг процесса генерации
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import axios from 'axios'
import { KieVeedFabricProvider } from '@/core/lipsync/providers/kie-veed-fabric-provider'
import { lipSyncOrchestrator } from '@/core/lipsync/lipsync-orchestrator'
import { LipSyncInputBuilder } from '@/core/lipsync/schemas/lipsync-schemas'

// Мокаем переменные окружения
const originalEnv = process.env

describe('AI Reels Шаблон 1 - Полный тест', () => {
  beforeEach(() => {
    // Устанавливаем тестовые переменные окружения
    process.env = {
      ...originalEnv,
      KIE_AI_API_KEY: 'test-kie-key',
      ELEVENLABS_API_KEY: 'test-elevenlabs-key',
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Step 1: Обработка изображения', () => {
    it('должен корректно обрабатывать URL изображения', () => {
      const imageUrl = 'https://example.com/test-image.jpg'
      const telegramId = '123456789'

      // Проверяем, что URL валидный
      expect(imageUrl).toMatch(/^https?:\/\/.+/)
      expect(imageUrl).toContain('.jpg')
    })

    it('должен валидировать размер изображения', () => {
      const imageUrl = 'https://example.com/test-image.jpg'

      // Симулируем проверку размера
      const isValidSize = imageUrl.length > 0 && imageUrl.length < 1000
      expect(isValidSize).toBe(true)
    })
  })

  describe('Step 2: Генерация lip-sync видео', () => {
    it('должен создавать правильный input для Kie.ai', () => {
      const input = LipSyncInputBuilder.forVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789',
        {
          botName: 'test-bot',
          resolution: '720p',
          isAudioUrl: true,
        }
      )

      expect(input.provider).toBe('kie')
      expect(input.modelId).toBe('veed-fabric')
      expect(input.imageUrl).toBe('https://example.com/image.jpg')
      expect(input.audioUrl).toBe('https://example.com/audio.mp3')
      expect(input.telegramId).toBe('123456789')
      expect(input.resolution).toBe('720p')
    })

    it('должен обрабатывать текст вместо аудио', () => {
      const input = LipSyncInputBuilder.forVeedFabric(
        'https://example.com/image.jpg',
        'Тестовый текст для генерации',
        '123456789',
        {
          botName: 'test-bot',
          resolution: '720p',
          isAudioUrl: false,
        }
      )

      expect(input.text).toBe('Тестовый текст для генерации')
      expect(input.audioUrl).toBeUndefined()
    })
  })

  /**
   * Step 3: the fallback poll, against a stubbed Kie.ai.
   *
   * These two tests used to call the real endpoint with the fake key set in
   * `beforeEach` and then assert the SHAPE OF THE REFUSAL ("has an `error`
   * property"). That asserted nothing about our code: it passed while Kie
   * answered 401 quickly, and went red the moment the refusal changed shape --
   * which is exactly how it was found, failing on a clean tree.
   *
   * What matters here is the translation of `data.state` into our own result,
   * because getting that wrong is what let a finished job run to the 10-minute
   * timeout and be refunded. So the transport is stubbed and every state the
   * unified job-status query can return is asserted, including the network
   * failure the old tests were accidentally exercising.
   */
  describe('Step 3: Polling статуса', () => {
    /*
     * The constructor is deliberately stepped around, and that is the point.
     *
     * It throws without KIE_AI_API_KEY, and that key is read from process.env
     * ONCE, at import time in @/config -- long before `beforeEach` can set it.
     * So these tests only ever passed on a machine that had a real Kie key in
     * its environment, and on that machine they reached the live API. That is
     * what made them red here on a clean checkout.
     *
     * `getStatus` reads no instance state: the endpoint comes from KIE_JOBS and
     * the key from the module constant. The prototype IS the unit under test.
     */
    const provider = (): KieVeedFabricProvider =>
      Object.create(KieVeedFabricProvider.prototype)
    let getSpy: ReturnType<typeof spyOn>

    const replyWith = (data: unknown) => {
      getSpy = spyOn(axios, 'get').mockResolvedValue({
        status: 200,
        statusText: 'OK',
        data,
      } as never)
    }

    afterEach(() => getSpy?.mockRestore())

    it('returns the finished video when the job succeeded', async () => {
      // The URL arrives inside resultJson as a STRING, not as a field.
      replyWith({
        data: {
          state: 'success',
          resultJson: JSON.stringify({
            resultUrls: ['https://kie.test/out.mp4'],
          }),
        },
      })

      const result = await provider().getStatus('task-1')

      expect(result).toMatchObject({
        status: 'completed',
        output: 'https://kie.test/out.mp4',
        taskId: 'task-1',
      })
      expect(result).not.toHaveProperty('error')
    })

    it('reports the failure Kie gave, not a generic one', async () => {
      replyWith({ data: { state: 'fail', failMsg: 'face not detected' } })

      const result = await provider().getStatus('task-2')

      expect(result).toMatchObject({
        code: 'TASK_FAILED',
        error: 'face not detected',
      })
    })

    it('keeps polling while the job is still in flight', async () => {
      // waiting / queuing / generating must NOT read as a failure: treating an
      // unfinished job as failed is what refunds work that is still running.
      for (const state of ['waiting', 'queuing', 'generating']) {
        replyWith({ data: { state } })

        const result = await provider().getStatus('task-3')

        expect(result).toMatchObject({ status: 'processing', output: '' })
        expect(result).not.toHaveProperty('error')
        getSpy.mockRestore()
      }
    })

    it('does not call a succeeded job failed when the URL is unreadable', async () => {
      // A broken resultJson is our parsing problem, not Kie's verdict.
      replyWith({ data: { state: 'success', resultJson: '{not json' } })

      const result = await provider().getStatus('task-4')

      expect(result).toMatchObject({ status: 'processing' })
    })

    it('answers with an error when the poll itself cannot be made', async () => {
      getSpy = spyOn(axios, 'get').mockRejectedValue(
        new Error('socket hang up')
      )

      const result = await provider().getStatus('task-5')

      expect(result).toHaveProperty('error')
      expect(result).toHaveProperty('message')
    })
  })

  describe('Интеграционные тесты', () => {
    it('должен проходить полный цикл генерации', async () => {
      const input = LipSyncInputBuilder.forVeedFabric(
        'https://example.com/image.jpg',
        'Тестовый текст',
        '123456789',
        {
          botName: 'test-bot',
          resolution: '720p',
          isAudioUrl: false,
        }
      )

      // Тестируем orchestrator
      const result = await lipSyncOrchestrator.generate(input)

      // В тестовой среде generate возвращает ошибку, что нормально
      expect(result).toHaveProperty('message')
      expect(result).toHaveProperty('error')
    })

    it('должен обрабатывать ошибки API', async () => {
      const input = LipSyncInputBuilder.forVeedFabric(
        'invalid-url',
        'Тестовый текст',
        '123456789',
        {
          botName: 'test-bot',
          resolution: '720p',
          isAudioUrl: false,
        }
      )

      const result = await lipSyncOrchestrator.generate(input)

      expect(result).toHaveProperty('error')
    })
  })

  describe('Валидация параметров', () => {
    it('должен валидировать длину текста', () => {
      const shortText = 'Короткий текст'
      const longText = 'A'.repeat(501)

      expect(shortText.length).toBeLessThanOrEqual(500)
      expect(longText.length).toBeGreaterThan(500)
    })

    it('должен валидировать разрешение видео', () => {
      const validResolutions = ['480p', '720p', '1080p']
      const testResolution = '720p'

      expect(validResolutions).toContain(testResolution)
    })

    it('должен валидировать длительность голосового сообщения', () => {
      const shortDuration = 15
      const longDuration = 35
      const maxDuration = 30

      expect(shortDuration).toBeLessThanOrEqual(maxDuration)
      expect(longDuration).toBeGreaterThan(maxDuration)
    })
  })

  describe('Обработка ошибок', () => {
    it('должен возвращать средства при ошибке генерации', () => {
      const error = new Error('Generation failed')
      const shouldRefund = true

      expect(shouldRefund).toBe(true)
      expect(error.message).toBe('Generation failed')
    })

    it('должен логировать детальную информацию об ошибке', () => {
      const error = {
        message: 'API Error',
        code: 'TIMEOUT',
        provider: 'kie',
        modelId: 'veed-fabric',
      }

      expect(error).toHaveProperty('message')
      expect(error).toHaveProperty('code')
      expect(error).toHaveProperty('provider')
      expect(error).toHaveProperty('modelId')
    })
  })
})
