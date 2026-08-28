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

// Провайдер ходит в Fal через `fal.subscribe` из '@fal-ai/client'
// (fal-veed-fabric-provider.ts:120), а не через axios. Подмена axios ни на
// что не влияла: запросы уходили в живой fal.run и возвращались как
// «Unauthorized» на тестовом ключе — тесты проверяли наличие сети, а не код.
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
      // Список расширен вместе с провайдером (см. fal-veed-fabric-provider.ts:23).
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

      // Успех у провайдера обозначен не полем success (его в ответе нет —
      // см. return в fal-veed-fabric-provider.ts:175), а статусом и ссылкой.
      expect(result.status).toBe('succeeded')
      expect(result.output).toBe('https://fal.media/files/test-video.mp4')
      // Поля лежат верхним уровнем, обёртки data у ответа нет.
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

      // Проверяем вызов API. Адрес, заголовки и timeout теперь внутри
      // клиента Fal — проверяем то, что задаёт провайдер: эндпоинт и вход.
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
      // Цену по РАЗРЕШЕНИЮ считает calculateCostByResolution; публичный
      // calculateCost принимает (durationSeconds, modelId) и на строке
      // возвращал NaN. Прайс тоже сменился: $0.10/$0.20 за секунду + 50%
      // наценки (fal-veed-fabric-provider.ts:444).
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

      // generateLipSync — тонкая обёртка над generate: тот же ответ без
      // поля success.
      expect(result.status).toBe('succeeded')
      expect(result.output).toBe('https://fal.media/files/test-video.mp4')
    })
  })
})
