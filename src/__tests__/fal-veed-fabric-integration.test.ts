/**
 * Интеграционные тесты для Fal.ai Veed Fabric Provider
 * Тестирует интеграцию с оркестратором и фабрикой провайдеров
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { LipSyncProviderFactory } from '@/core/lipsync/providers/provider-factory'
import { LipSyncOrchestrator } from '@/core/lipsync/lipsync-orchestrator'
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
// (fal-veed-fabric-provider.ts:120). Mocking axios had no effect — the
// requests went to the live fal.run and came back "Unauthorized".
const falSubscribe = mock(() =>
  Promise.resolve({ data: {}, requestId: 'test-request-id' })
)
mock.module('@fal-ai/client', () => ({
  fal: { subscribe: falSubscribe, config: mock(() => {}) },
}))

describe('Fal.ai Veed Fabric Integration', () => {
  let factory: LipSyncProviderFactory
  let orchestrator: LipSyncOrchestrator

  beforeEach(async () => {
    // Настраиваем переменные окружения
    process.env.FAL_KEY = 'test-fal-key'

    // Создаем фабрику и оркестратор
    factory = LipSyncProviderFactory.getInstance()
    orchestrator = LipSyncOrchestrator.getInstance()

    falSubscribe.mockReset()
  })

  describe('Фабрика провайдеров', () => {
    it('должна создавать Fal провайдер', () => {
      const provider = factory.createProvider('fal')

      expect(provider).toBeDefined()
      expect(provider.providerId).toBe('fal')
      // Провайдер ведёт три модели (veed fabric, latentsync, hummingbird),
      // поэтому его имя стало общим. Имя КОНКРЕТНОЙ модели по-прежнему
      // 'Fal.ai Veed Fabric 1.0 Fast' — оно проверяется через modelUsed.
      expect(provider.providerName).toBe('Fal.ai Lip-Sync')
    })

    it('должна включать Fal в список поддерживаемых провайдеров', () => {
      const supportedTypes = factory.getSupportedProviderTypes()

      expect(supportedTypes).toContain('fal')
    })

    it('должна создавать все провайдеры включая Fal', () => {
      const providers = factory.createAllProviders()

      const falProvider = providers.find(p => p.providerId === 'fal')
      expect(falProvider).toBeDefined()
    })
  })

  describe('Оркестратор', () => {
    it('должен успешно генерировать через Fal провайдер', async () => {
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

      // Выполняем генерацию через оркестратор
      const result = await orchestrator.generate(input)

      // The orchestrator returns the provider's response UNWRAPPED
      // (lipsync-orchestrator.ts:82 — `return result`): no success, no data.
      expect(result).toMatchObject({
        status: 'succeeded',
        modelUsed: 'Fal.ai Veed Fabric 1.0 Fast',
      })
    })

    it('должен обрабатывать ошибки через оркестратор', async () => {
      // Настраиваем мок ошибки
      falSubscribe.mockRejectedValue(new Error('Network Error'))

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789'
      )

      const result = await orchestrator.generate(input)

      expect(result.code).toBe('GENERATION_ERROR')
      expect(result.message).toContain('Failed to generate video')
    })
  })

  describe('Конфигурация по умолчанию', () => {
    it('должна включать конфигурацию для Fal провайдера', async () => {
      const { DEFAULT_PROVIDER_CONFIGS } = await import(
        '@/core/lipsync/providers/provider-factory'
      )

      expect(DEFAULT_PROVIDER_CONFIGS.fal).toBeDefined()
      expect(DEFAULT_PROVIDER_CONFIGS.fal.timeout).toBe(300000)
      expect(DEFAULT_PROVIDER_CONFIGS.fal.retryAttempts).toBe(2)
      expect(DEFAULT_PROVIDER_CONFIGS.fal.defaultResolution).toBe('720p')
    })
  })

  describe('Совместимость с существующими интерфейсами', () => {
    it('должен работать с универсальным интерфейсом', async () => {
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

      const input = {
        provider: 'fal',
        modelId: 'fal-veed-fabric-1.0-fast',
        imageUrl: 'https://example.com/image.jpg',
        audioUrl: 'https://example.com/audio.mp3',
        telegramId: '123456789',
        resolution: '720p',
      }

      const result = await orchestrator.generate(input)

      expect(result.status).toBe('succeeded')
    })
  })

  describe('Обработка различных разрешений', () => {
    it('должен поддерживать 480p разрешение', async () => {
      const mockResponse = {
        data: {
          video: {
            content_type: 'video/mp4',
            url: 'https://fal.media/files/test-video-480p.mp4',
          },
        },
      }
      falSubscribe.mockResolvedValue({
        ...mockResponse,
        requestId: 'test-request-id',
      })

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789',
        { resolution: '480p' }
      )

      const result = await orchestrator.generate(input)

      expect(result.status).toBe('succeeded')
      const [, options] = falSubscribe.mock.calls.at(-1) as any[]
      expect(options.input).toMatchObject({ resolution: '480p' })
    })

    it('должен поддерживать 720p разрешение', async () => {
      const mockResponse = {
        data: {
          video: {
            content_type: 'video/mp4',
            url: 'https://fal.media/files/test-video-720p.mp4',
          },
        },
      }
      falSubscribe.mockResolvedValue({
        ...mockResponse,
        requestId: 'test-request-id',
      })

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789',
        { resolution: '720p' }
      )

      const result = await orchestrator.generate(input)

      expect(result.status).toBe('succeeded')
      const [, options] = falSubscribe.mock.calls.at(-1) as any[]
      expect(options.input).toMatchObject({ resolution: '720p' })
    })
  })
})
