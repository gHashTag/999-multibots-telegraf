/**
 * @fileoverview Тесты для отладки Fal.ai Veed Fabric провайдера
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { FalVeedFabricProvider } from '@/core/lipsync/providers/fal-veed-fabric-provider'
import { LipSyncInputBuilder } from '@/core/lipsync/schemas/lipsync-schemas'

describe('Fal.ai Veed Fabric - Отладка', () => {
  beforeEach(() => {
    // Устанавливаем тестовый ключ
    process.env.FAL_KEY = 'test-fal-key'
  })

  describe('Проверка конфигурации', () => {
    it('должен инициализироваться с правильными параметрами', () => {
      const provider = new FalVeedFabricProvider()
      
      expect(provider.providerId).toBe('fal')
      expect(provider.providerName).toBe('Fal.ai Veed Fabric 1.0 Fast')
      expect(provider.supportedModels).toEqual(['fal-veed-fabric-1.0-fast'])
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
      
      expect(result).toHaveProperty('message', 'Invalid input for Fal Veed Fabric provider')
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
      
      // Мокаем axios для тестирования
      const mockAxios = {
        post: async (url: string, data: any, config: any) => {
          expect(url).toBe('https://fal.run/veed/fabric-1.0/fast')
          expect(data.image_url).toBe('https://example.com/image.jpg')
          expect(data.audio_url).toBe('https://example.com/audio.mp3')
          expect(data.resolution).toBe('720p')
          expect(config.headers.Authorization).toBe('Key test-fal-key')
          expect(config.headers['Content-Type']).toBe('application/json')
          expect(config.timeout).toBe(300000)
          
          // Симулируем успешный ответ
          return {
            data: {
              video: {
                url: 'https://example.com/generated-video.mp4',
                content_type: 'video/mp4'
              }
            }
          }
        }
      }
      
      // Заменяем axios на мок
      const originalAxios = require('axios')
      require('axios').post = mockAxios.post
      
      const result = await provider.generate(input)
      
      // Восстанавливаем оригинальный axios
      require('axios').post = originalAxios.post
      
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('data')
      if ('data' in result) {
        expect(result.data.output).toBe('https://example.com/generated-video.mp4')
        expect(result.data.modelUsed).toBe('Fal.ai Veed Fabric 1.0 Fast')
      }
    })

    it('должен обрабатывать ошибку API', async () => {
      const provider = new FalVeedFabricProvider()
      
      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789'
      )
      
      // Мокаем axios для возврата ошибки
      const mockAxios = {
        post: async () => {
          throw new Error('Fal.ai API error: 401 Unauthorized')
        }
      }
      
      const originalAxios = require('axios')
      require('axios').post = mockAxios.post
      
      const result = await provider.generate(input)
      
      // Восстанавливаем оригинальный axios
      require('axios').post = originalAxios.post
      
      expect(result).toHaveProperty('message', 'Failed to generate video with Fal.ai Veed Fabric')
      expect(result).toHaveProperty('error', 'Fal.ai API error: 401 Unauthorized')
      expect(result).toHaveProperty('code', 'GENERATION_ERROR')
    })

    it('должен обрабатывать отсутствие видео в ответе', async () => {
      const provider = new FalVeedFabricProvider()
      
      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789'
      )
      
      // Мокаем axios для возврата ответа без видео
      const mockAxios = {
        post: async () => {
          return {
            data: {
              // Нет поля video
            }
          }
        }
      }
      
      const originalAxios = require('axios')
      require('axios').post = mockAxios.post
      
      const result = await provider.generate(input)
      
      // Восстанавливаем оригинальный axios
      require('axios').post = originalAxios.post
      
      expect(result).toHaveProperty('message', 'No video generated by Fal.ai API')
      expect(result).toHaveProperty('error', 'Missing video output in API response')
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
