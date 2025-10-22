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

mock.module('axios', () => ({
  default: {
    post: mock(() => Promise.resolve({ data: {} })),
  },
}))

describe('Fal.ai Veed Fabric Integration', () => {
  let factory: LipSyncProviderFactory
  let orchestrator: LipSyncOrchestrator
  let mockAxios: any

  beforeEach(async () => {
    // Настраиваем переменные окружения
    process.env.FAL_KEY = 'test-fal-key'
    
    // Создаем фабрику и оркестратор
    factory = LipSyncProviderFactory.getInstance()
    orchestrator = LipSyncOrchestrator.getInstance()
    
    // Получаем мок axios
    const axios = await import('axios')
    mockAxios = axios.default
  })

  describe('Фабрика провайдеров', () => {
    it('должна создавать Fal провайдер', () => {
      const provider = factory.createProvider('fal')
      
      expect(provider).toBeDefined()
      expect(provider.providerId).toBe('fal')
      expect(provider.providerName).toBe('Fal.ai Veed Fabric 1.0 Fast')
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
      mockAxios.post.mockResolvedValue(mockResponse)

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

      // Проверяем результат
      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        status: 'succeeded',
        modelUsed: 'Fal.ai Veed Fabric 1.0 Fast',
      })
    })

    it('должен обрабатывать ошибки через оркестратор', async () => {
      // Настраиваем мок ошибки
      mockAxios.post.mockRejectedValue(new Error('Network Error'))

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789'
      )

      const result = await orchestrator.generate(input)

      expect(result.success).toBe(false)
      expect(result.message).toContain('Failed to generate video')
    })
  })

  describe('Конфигурация по умолчанию', () => {
    it('должна включать конфигурацию для Fal провайдера', () => {
      const { DEFAULT_PROVIDER_CONFIGS } = await import('@/core/lipsync/providers/provider-factory')
      
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
      mockAxios.post.mockResolvedValue(mockResponse)

      const input = {
        provider: 'fal',
        modelId: 'fal-veed-fabric-1.0-fast',
        imageUrl: 'https://example.com/image.jpg',
        audioUrl: 'https://example.com/audio.mp3',
        telegramId: '123456789',
        resolution: '720p',
      }

      const result = await orchestrator.generate(input)

      expect(result.success).toBe(true)
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
      mockAxios.post.mockResolvedValue(mockResponse)

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789',
        { resolution: '480p' }
      )

      const result = await orchestrator.generate(input)

      expect(result.success).toBe(true)
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          resolution: '480p',
        }),
        expect.any(Object)
      )
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
      mockAxios.post.mockResolvedValue(mockResponse)

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789',
        { resolution: '720p' }
      )

      const result = await orchestrator.generate(input)

      expect(result.success).toBe(true)
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          resolution: '720p',
        }),
        expect.any(Object)
      )
    })
  })
})
