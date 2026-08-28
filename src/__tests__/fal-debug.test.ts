/**
 * @fileoverview Тесты для отладки Fal.ai Veed Fabric провайдера
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { FalVeedFabricProvider } from '@/core/lipsync/providers/fal-veed-fabric-provider'
import { LipSyncInputBuilder } from '@/core/lipsync/schemas/lipsync-schemas'

// Провайдер вызывает `fal.subscribe` из '@fal-ai/client'
// (fal-veed-fabric-provider.ts:120). Тесты ниже подменяли axios
// (`require('axios').post = ...`), которого в провайдере нет вовсе, — поэтому
// запросы уходили в живой fal.run и возвращали «Unauthorized» на тестовом
// ключе. Подменяем настоящий транспорт.
const falSubscribe = mock(() =>
  Promise.resolve({ data: {}, requestId: 'test-request-id' })
)
mock.module('@fal-ai/client', () => ({
  fal: { subscribe: falSubscribe, config: mock(() => {}) },
}))

// The success path saves the URL to Supabase; unmocked that is a live
// request, it fails, and the result is diverted into the error branch.
mock.module('@/core/supabase/saveVideoUrlToSupabase', () => ({
  saveVideoUrlToSupabase: mock(() => Promise.resolve(undefined)),
}))

describe('Fal.ai Veed Fabric - Отладка', () => {
  beforeEach(() => {
    // Устанавливаем тестовый ключ
    process.env.FAL_KEY = 'test-fal-key'
  })

  describe('Проверка конфигурации', () => {
    it('должен инициализироваться с правильными параметрами', () => {
      const provider = new FalVeedFabricProvider()

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

    it('должен предупреждать об отсутствии FAL_KEY', () => {
      delete process.env.FAL_KEY
      const provider = new FalVeedFabricProvider()

      // Проверяем, что провайдер создается, но с предупреждением
      expect(provider.providerId).toBe('fal')
    })
  })

  describe('Проверка входных данных', () => {
    it('должен создавать правильный input для Fal.ai', () => {
      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789',
        { botName: 'test-bot', resolution: '720p' }
      )

      expect(input.provider).toBe('fal')
      expect(input.modelId).toBe('fal-veed-fabric-1.0-fast')
      expect(input.imageUrl).toBe('https://example.com/image.jpg')
      expect(input.audioUrl).toBe('https://example.com/audio.mp3')
      expect(input.resolution).toBe('720p')
    })

    it('должен обрабатывать неправильный provider', async () => {
      const provider = new FalVeedFabricProvider()

      const wrongInput = {
        provider: 'kie' as any,
        modelId: 'fal-veed-fabric-1.0-fast',
        imageUrl: 'https://example.com/image.jpg',
        audioUrl: 'https://example.com/audio.mp3',
        telegramId: '123456789',
        botName: 'test-bot',
        resolution: '720p' as const,
      }

      const result = await provider.generate(wrongInput)

      expect(result).toHaveProperty(
        'message',
        'Invalid input for Fal.ai provider'
      )
      expect(result).toHaveProperty('code', 'INVALID_INPUT')
    })

    it('должен обрабатывать отсутствие FAL_KEY', async () => {
      delete process.env.FAL_KEY
      const provider = new FalVeedFabricProvider()

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789'
      )

      const result = await provider.generate(input)

      expect(result).toHaveProperty('message', 'Fal API key not configured')
      expect(result).toHaveProperty('code', 'CONFIGURATION_ERROR')
    })
  })

  describe('Проверка API запроса', () => {
    it('должен правильно формировать запрос к Fal.ai API', async () => {
      const provider = new FalVeedFabricProvider()

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789',
        { resolution: '720p' }
      )

      falSubscribe.mockResolvedValue({
        data: {
          video: {
            url: 'https://example.com/generated-video.mp4',
            content_type: 'video/mp4',
          },
        },
        requestId: 'test-request-id',
      })

      const result = await provider.generate(input)

      // URL, headers and timeout moved inside the Fal client — assert what the
      // provider decides: the model endpoint and the request body.
      const [endpoint, options] = falSubscribe.mock.calls.at(-1) as any[]
      expect(endpoint).toBe('veed/fabric-1.0/fast')
      expect(options.input.image_url).toBe('https://example.com/image.jpg')
      expect(options.input.audio_url).toBe('https://example.com/audio.mp3')
      expect(options.input.resolution).toBe('720p')

      // The response fields sit at the top level; there is no `data` wrapper
      // (see the return at fal-veed-fabric-provider.ts:175).
      expect(result.output).toBe('https://example.com/generated-video.mp4')
      expect(result.modelUsed).toBe('Fal.ai Veed Fabric 1.0 Fast')
    })

    it('должен обрабатывать ошибку API', async () => {
      const provider = new FalVeedFabricProvider()

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789'
      )

      falSubscribe.mockRejectedValue(
        new Error('Fal.ai API error: 401 Unauthorized')
      )

      const result = await provider.generate(input)

      // The provider drives three models, so the message carries the generic
      // name.
      expect(result).toHaveProperty(
        'message',
        'Failed to generate video with Fal.ai Lip-Sync'
      )
      expect(result).toHaveProperty(
        'error',
        'Fal.ai API error: 401 Unauthorized'
      )
      expect(result).toHaveProperty('code', 'GENERATION_ERROR')
    })

    it('должен обрабатывать отсутствие видео в ответе', async () => {
      const provider = new FalVeedFabricProvider()

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789'
      )

      falSubscribe.mockResolvedValue({
        data: {}, // без поля video
        requestId: 'test-request-id',
      })

      const result = await provider.generate(input)

      expect(result).toHaveProperty(
        'message',
        'No video generated by Fal.ai API'
      )
      expect(result).toHaveProperty(
        'error',
        'Missing video output in API response'
      )
      expect(result).toHaveProperty('code', 'NO_VIDEO_OUTPUT')
    })
  })

  describe('Проверка синхронности', () => {
    it('должен быть синхронным провайдером', async () => {
      const provider = new FalVeedFabricProvider()

      const result = await provider.getStatus('test-task-id')

      expect(result.status).toBe('completed')
      expect(result.message).toContain('synchronous')
    })
  })
})
