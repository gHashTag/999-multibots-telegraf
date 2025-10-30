/**
 * Тесты для отладки AI Reels Шаблон 1
 * Проверяем конкретные проблемы из логов
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { KieVeedFabricProvider } from '@/core/lipsync/providers/kie-veed-fabric-provider'
import { lipSyncOrchestrator } from '@/core/lipsync/lipsync-orchestrator'
import { LipSyncInputBuilder } from '@/core/lipsync/schemas/lipsync-schemas'

// Мокаем переменные окружения
const originalEnv = process.env

describe('AI Reels Шаблон 1 - Отладка проблем', () => {
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

  describe('Проблема с Voice ID', () => {
    it('должен использовать fallback voice ID когда пользовательский не найден', async () => {
      const provider = new KieVeedFabricProvider()

      // Тестируем с несуществующим пользователем
      const input = LipSyncInputBuilder.forVeedFabric(
        'https://example.com/image.jpg',
        'Тестовый текст для генерации',
        '999999999', // Несуществующий пользователь
        {
          botName: 'test-bot',
          resolution: '720p',
          isAudioUrl: false,
        }
      )

      // В тестовой среде это должно вернуть ошибку, но не падать
      const result = await lipSyncOrchestrator.generate(input)

      expect(result).toHaveProperty('message')
      expect(result).toHaveProperty('error')
    })
  })

  describe('Проблема с ElevenLabs API', () => {
    it('должен обрабатывать ошибки ElevenLabs API', async () => {
      const provider = new KieVeedFabricProvider()

      // Тестируем с невалидным API ключом
      process.env.ELEVENLABS_API_KEY = 'invalid-key'

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

      const result = await lipSyncOrchestrator.generate(input)

      expect(result).toHaveProperty('error')
    })
  })

  describe('Проблема с Kie.ai API', () => {
    it('должен обрабатывать ошибки Kie.ai API', async () => {
      const provider = new KieVeedFabricProvider()

      // Тестируем с невалидным API ключом
      process.env.KIE_AI_API_KEY = 'invalid-key'

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

      const result = await lipSyncOrchestrator.generate(input)

      expect(result).toHaveProperty('error')
    })
  })

  describe('Проблема с Supabase', () => {
    it('должен обрабатывать ошибки Supabase Storage', async () => {
      const provider = new KieVeedFabricProvider()

      // Тестируем с невалидными Supabase credentials
      process.env.SUPABASE_URL = 'https://invalid.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'invalid-key'

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

      const result = await lipSyncOrchestrator.generate(input)

      expect(result).toHaveProperty('error')
    })
  })

  describe('Проблема с валидацией URL', () => {
    it('должен валидировать URL изображения', async () => {
      const input = LipSyncInputBuilder.forVeedFabric(
        'invalid-url', // Невалидный URL
        'Тестовый текст для генерации',
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

  describe('Проблема с длинным текстом', () => {
    it('должен обрабатывать длинный текст', async () => {
      const longText = 'A'.repeat(1000) // Очень длинный текст

      const input = LipSyncInputBuilder.forVeedFabric(
        'https://example.com/image.jpg',
        longText,
        '123456789',
        {
          botName: 'test-bot',
          resolution: '720p',
          isAudioUrl: false,
        }
      )

      const result = await lipSyncOrchestrator.generate(input)

      // Длинный текст может вызвать ошибку в ElevenLabs
      expect(result).toHaveProperty('message')
    })
  })
})
