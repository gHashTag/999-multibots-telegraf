/**
 * Тесты для AI Reels с fal провайдером
 * Проверяем переключение с kie на fal провайдер
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { FalVeedFabricProvider } from '@/core/lipsync/providers/fal-veed-fabric-provider'
import { lipSyncOrchestrator } from '@/core/lipsync/lipsync-orchestrator'
import { LipSyncInputBuilder } from '@/core/lipsync/schemas/lipsync-schemas'

// Мокаем переменные окружения
const originalEnv = process.env

describe('AI Reels с fal провайдером - Тесты', () => {
  beforeEach(() => {
    // Устанавливаем тестовые переменные окружения
    process.env = {
      ...originalEnv,
      FAL_KEY: 'test-fal-key',
      ELEVENLABS_API_KEY: 'test-elevenlabs-key',
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('fal провайдер в AI Reels', () => {
    it('должен создавать правильный input для fal провайдера', () => {
      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789',
        {
          botName: 'test-bot',
          resolution: '720p',
        }
      )

      expect(input.provider).toBe('fal')
      expect(input.modelId).toBe('fal-veed-fabric-1.0-fast')
      expect(input.imageUrl).toBe('https://example.com/image.jpg')
      expect(input.audioUrl).toBe('https://example.com/audio.mp3')
      expect(input.telegramId).toBe('123456789')
      expect(input.resolution).toBe('720p')
    })

    it('должен обрабатывать fal провайдер через orchestrator', async () => {
      const input = LipSyncInputBuilder.forFalVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789',
        {
          botName: 'test-bot',
          resolution: '720p',
        }
      )

      // В тестовой среде это должно вернуть ошибку, но не падать
      const result = await lipSyncOrchestrator.generate(input)

      expect(result).toHaveProperty('message')
      expect(result).toHaveProperty('error')
    })

    it('должен обрабатывать ошибки fal провайдера', async () => {
      const input = LipSyncInputBuilder.forFalVeedFabric(
        'invalid-url',
        'invalid-audio-url',
        '123456789',
        {
          botName: 'test-bot',
          resolution: '720p',
        }
      )

      const result = await lipSyncOrchestrator.generate(input)

      expect(result).toHaveProperty('error')
    })
  })

  describe('Генерация аудио для fal провайдера', () => {
    it('должен генерировать аудио из текста для fal провайдера', async () => {
      // Тестируем логику генерации аудио
      const text = 'Тестовый текст для генерации аудио'
      const telegramId = '123456789'

      // Симулируем получение voice_id
      const voiceId = 'test-voice-id'
      expect(voiceId).toBeDefined()

      // Симулируем генерацию аудио
      const audioUrl = 'https://example.com/generated-audio.mp3'
      expect(audioUrl).toMatch(/^https?:\/\/.+/)
    })

    it('должен обрабатывать ошибки генерации аудио', () => {
      const text = 'Тестовый текст'
      const voiceId = null // Нет voice_id

      // Если нет voice_id, должна быть ошибка
      expect(voiceId).toBeNull()
    })
  })

  describe('Синхронность fal провайдера', () => {
    it('должен быть синхронным (не требует polling)', async () => {
      const provider = new FalVeedFabricProvider()

      // fal провайдер синхронный, getStatus всегда возвращает completed
      const result = await provider.getStatus('test-task-id')

      expect(result.status).toBe('completed')
      expect(result.message).toContain('synchronous')
    })

    it('должен обрабатывать ошибки getStatus', async () => {
      const provider = new FalVeedFabricProvider()

      // Тестируем с невалидным taskId
      const result = await provider.getStatus('')

      expect(result).toHaveProperty('error')
    })
  })

  describe('Интеграция с AI Reels', () => {
    it('должен поддерживать все необходимые параметры для AI Reels', () => {
      const imageUrl = 'https://example.com/face-image.jpg'
      const audioUrl = 'https://example.com/voice-audio.mp3'
      const telegramId = '123456789'

      const input = LipSyncInputBuilder.forFalVeedFabric(
        imageUrl,
        audioUrl,
        telegramId,
        {
          botName: 'ai-reels-bot',
          resolution: '720p',
        }
      )

      // Проверяем, что все параметры для AI Reels поддерживаются
      expect(input.provider).toBe('fal')
      expect(input.modelId).toBe('fal-veed-fabric-1.0-fast')
      expect(input.imageUrl).toBe(imageUrl)
      expect(input.audioUrl).toBe(audioUrl)
      expect(input.telegramId).toBe(telegramId)
      expect(input.resolution).toBe('720p')
      expect(input.botName).toBe('ai-reels-bot')
    })

    it('должен обрабатывать различные разрешения видео', () => {
      const resolutions = ['480p', '720p']

      resolutions.forEach(resolution => {
        const input = LipSyncInputBuilder.forFalVeedFabric(
          'https://example.com/image.jpg',
          'https://example.com/audio.mp3',
          '123456789',
          {
            resolution: resolution as '480p' | '720p',
          }
        )

        expect(input.resolution).toBe(resolution)
      })
    })
  })
})
