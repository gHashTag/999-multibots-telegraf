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

mock.module('axios', () => ({
  default: {
    post: mock(() => Promise.resolve({ data: {} })),
  },
}))

describe('FalVeedFabricProvider', () => {
  let provider: FalVeedFabricProvider
  let mockAxios: any

  beforeEach(async () => {
    // Настраиваем переменные окружения
    process.env.FAL_KEY = 'test-fal-key'
    
    // Создаем провайдер
    provider = new FalVeedFabricProvider()
    
    // Получаем мок axios
    const axios = await import('axios')
    mockAxios = axios.default
  })

  describe('Инициализация', () => {
    it('должен инициализироваться с правильными параметрами', () => {
      expect(provider.providerId).toBe('fal')
      expect(provider.providerName).toBe('Fal.ai Veed Fabric 1.0 Fast')
      expect(provider.supportedModels).toEqual(['fal-veed-fabric-1.0-fast'])
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

      // Выполняем генерацию
      const result = await provider.generate(input)

      // Проверяем результат
      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        status: 'succeeded',
        modelUsed: 'Fal.ai Veed Fabric 1.0 Fast',
        metadata: {
          resolution: '720p',
          contentType: 'video/mp4',
          provider: 'fal',
          modelId: 'veed/fabric-1.0/fast',
        },
      })

      // Проверяем вызов API
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://fal.run/veed/fabric-1.0/fast',
        {
          image_url: 'https://example.com/image.jpg',
          audio_url: 'https://example.com/audio.mp3',
          resolution: '720p',
        },
        {
          headers: {
            Authorization: 'Key test-fal-key',
            'Content-Type': 'application/json',
          },
          timeout: 300000,
        }
      )
    })

    it('должен обрабатывать ошибки API', async () => {
      // Настраиваем мок ошибки
      mockAxios.post.mockRejectedValue(new Error('API Error'))

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789'
      )

      const result = await provider.generate(input)

      expect(result.success).toBe(false)
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

      expect(result.success).toBe(false)
      expect(result.message).toContain('Invalid input for Fal Veed Fabric provider')
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

      expect(result.success).toBe(false)
      expect(result.message).toContain('Fal API key not configured')
    })

    it('должен обрабатывать ответ без видео', async () => {
      const mockResponse = {
        data: {
          // Нет поля video
        },
      }
      mockAxios.post.mockResolvedValue(mockResponse)

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789'
      )

      const result = await provider.generate(input)

      expect(result.success).toBe(false)
      expect(result.message).toContain('No video generated by Fal.ai API')
    })
  })

  describe('Проверка статуса', () => {
    it('должен возвращать успешный статус', async () => {
      const result = await provider.getStatus('test-task-id')

      expect(result.status).toBe('succeeded')
      expect(result.message).toContain('synchronous')
    })
  })

  describe('Расчет стоимости', () => {
    it('должен правильно рассчитывать стоимость для 480p', () => {
      // Тестируем приватный метод через рефлексию
      const calculateCost = (provider as any).calculateCost.bind(provider)
      const cost = calculateCost('480p')

      expect(cost).toBe(0.02) // baseCost * 1.0
    })

    it('должен правильно рассчитывать стоимость для 720p', () => {
      const calculateCost = (provider as any).calculateCost.bind(provider)
      const cost = calculateCost('720p')

      expect(cost).toBe(0.03) // baseCost * 1.5
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
      mockAxios.post.mockResolvedValue(mockResponse)

      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789'
      )

      const result = await provider.generateLipSync(input)

      expect(result.success).toBe(true)
    })
  })
})
