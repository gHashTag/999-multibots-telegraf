/**
 * Тесты для Fal.ai Veed Fabric Provider
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { FalVeedFabricProvider } from '@/core/lipsync/providers/fal-veed-fabric-provider'
import { LipSyncInputBuilder } from '@/core/lipsync/schemas/lipsync-schemas'

// Мокаем зависимости
mock.module('@/utils/logger', () => ({
  logger: {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  },
}))

mock.module('@/core/supabase/saveVideoUrlToSupabase', () => ({
  saveVideoUrlToSupabase: mock(() => Promise.resolve(undefined)),
}))

// The provider reaches Fal through `fal.subscribe` from '@fal-ai/client'
// (fal-veed-fabric-provider.ts:120), not through axios. Mocking axios changed
// nothing: the requests went to the live fal.run and came back "Unauthorized"
// on a test key — the tests were checking for a network, not for the code.
const falSubscribe = mock(() =>
  Promise.resolve({ data: {}, requestId: 'test-request-id' })
)
mock.module('@fal-ai/client', () => ({
  fal: { subscribe: falSubscribe, config: mock(() => {}) },
}))

describe('FalVeedFabricProvider', () => {
  let provider: FalVeedFabricProvider

  beforeEach(async () => {
    // Настраиваем переменные окружения
    process.env.FAL_KEY = 'test-fal-key'

    // Создаем провайдер
    provider = new FalVeedFabricProvider()

    falSubscribe.mockReset()
  })

  describe('Инициализация', () => {
    it('должен инициализироваться с правильными параметрами', () => {
      expect(provider.providerId).toBe('fal')
      // Провайдер ведёт три модели (veed fabric, latentsync, hummingbird),
      // поэтому его имя стало общим. Имя КОНКРЕТНОЙ модели по-прежнему
      // 'Fal.ai Veed Fabric 1.0 Fast' — оно проверяется через modelUsed.
      expect(provider.providerName).toBe('Fal.ai Lip-Sync')
      // The list grew with the provider (see fal-veed-fabric-provider.ts:23).
      expect(provider.supportedModels).toEqual([
        'fal-veed-fabric-1.0-fast',
        'fal-ai/latentsync',
        'fal-ai/tavus/hummingbird-lipsync/v0',
      ])
    })

    it('должен предупреждать если FAL_KEY не установлен', () => {
      delete process.env.FAL_KEY

      new FalVeedFabricProvider()

      // Проверяем, что провайдер создался без ошибок
      expect(provider).toBeDefined()
    })
  })

  describe('Генерация lip-sync', () => {
    it('должен успешно генерировать видео', async () => {
      // Настраиваем мок ответа
      const mockResponse = {
        data: {
          video: {
            content_type: 'video/mp4',
            url: 'https://fal.media/files/test-video.mp4',
          },
        },
      }
      falSubscribe.mockResolvedValue({
        ...mockResponse,
        requestId: 'test-request-id',
      })

      // Создаем входные данные
      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789',
        {
          resolution: '720p',
          botName: 'test-bot',
        }
      )

      // Выполняем генерацию
      const result = await provider.generate(input)

      // Success is not marked by a `success` field — the response has none
      // (see the return at fal-veed-fabric-provider.ts:175) — but by the
      // status and the URL.
      expect(result.status).toBe('succeeded')
      expect(result.output).toBe('https://fal.media/files/test-video.mp4')
      // The fields sit at the top level; the response has no `data` wrapper.
      expect(result).toMatchObject({
        status: 'succeeded',
        modelUsed: 'Fal.ai Veed Fabric 1.0 Fast',
        metadata: {
          resolution: '720p',
          contentType: 'video/mp4',
          provider: 'fal',
          modelId: 'veed/fabric-1.0/fast',
        },
      })

      // Check the API call. URL, headers and timeout now live inside the Fal
      // client, so assert what the provider decides: endpoint and input.
      expect(falSubscribe).toHaveBeenCalledTimes(1)
      const [endpoint, options] = falSubscribe.mock.calls[0] as any[]
      expect(endpoint).toBe('veed/fabric-1.0/fast')
      expect(options.input).toEqual({
        image_url: 'https://example.com/image.jpg',
        audio_url: 'https://example.com/audio.mp3',
        resolution: '720p',
      })
    })

    it('должен обрабатывать ошибки API', async () => {
      // Настраиваем мок ошибки
      falSubscribe.mockRejectedValue(new Error('API Error'))

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789'
      )

      const result = await provider.generate(input)

      expect(result.success).toBeUndefined()
      expect(result.message).toContain('Failed to generate video')
      expect(result.error).toBe('API Error')
    })

    it('должен возвращать ошибку для неправильного провайдера', async () => {
      const input = {
        provider: 'sync',
        modelId: 'sync/lipsync-2',
        telegramId: '123456789',
      }

      const result = await provider.generate(input)

      expect(result.success).toBeUndefined()
      expect(result.message).toContain('Invalid input for Fal.ai provider')
    })

    it('должен возвращать ошибку если FAL_KEY не установлен', async () => {
      delete process.env.FAL_KEY
      const providerWithoutKey = new FalVeedFabricProvider()

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789'
      )

      const result = await providerWithoutKey.generate(input)

      expect(result.success).toBeUndefined()
      expect(result.message).toContain('Fal API key not configured')
    })

    it('должен обрабатывать ответ без видео', async () => {
      const mockResponse = {
        data: {
          // Нет поля video
        },
      }
      falSubscribe.mockResolvedValue(mockResponse)

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789'
      )

      const result = await provider.generate(input)

      expect(result.success).toBeUndefined()
      expect(result.message).toContain('No video generated by Fal.ai API')
    })
  })

  describe('Проверка статуса', () => {
    it('должен возвращать успешный статус', async () => {
      const result = await provider.getStatus('test-task-id')

      expect(result.status).toBe('completed')
      expect(result.message).toContain('synchronous')
    })
  })

  describe('Расчет стоимости', () => {
    it('должен правильно рассчитывать стоимость для 480p', () => {
      // Тестируем приватный метод через рефлексию
      // calculateCostByResolution prices BY RESOLUTION; the public
      // calculateCost takes (durationSeconds, modelId) and returned NaN when
      // handed a string. The price changed too: $0.10/$0.20 per second plus a
      // 50% markup (fal-veed-fabric-provider.ts:444).
      const calculateCost = (provider as any).calculateCostByResolution.bind(
        provider
      )
      const cost = calculateCost('480p')

      expect(cost).toBeCloseTo(0.15, 2)
    })

    it('должен правильно рассчитывать стоимость для 720p', () => {
      const calculateCost = (provider as any).calculateCostByResolution.bind(
        provider
      )
      const cost = calculateCost('720p')

      expect(cost).toBeCloseTo(0.3, 2)
    })
  })

  describe('Совместимость с интерфейсом', () => {
    it('должен поддерживать метод generateLipSync', async () => {
      const mockResponse = {
        data: {
          video: {
            content_type: 'video/mp4',
            url: 'https://fal.media/files/test-video.mp4',
          },
        },
      }
      falSubscribe.mockResolvedValue(mockResponse)

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789'
      )

      const result = await provider.generateLipSync(input)

      // generateLipSync is a thin wrapper over generate: the same response,
      // still without a `success` field.
      expect(result.status).toBe('succeeded')
      expect(result.output).toBe('https://fal.media/files/test-video.mp4')
    })
  })
})
