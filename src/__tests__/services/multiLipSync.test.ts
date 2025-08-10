import { describe, it, expect, vi, beforeEach } from 'vitest'

// Мокаем Replicate
const mockRun = vi.fn()
const mockGet = vi.fn()

vi.mock('replicate', () => ({
  default: class MockReplicate {
    run = mockRun
    predictions = {
      get: mockGet,
    }
  },
}))

// Мокаем модуль ПОСЛЕ определения функций мока
const { generateKlingLipSync, getKlingLipSyncStatus } = await import(
  '@/core/replicate/generateKlingLipSync'
)

// Импортируем новые функции для тестирования
const { generateLipSync } = await import('@/services/generateLipSync')
const {
  getAvailableLipSyncModels,
  getLipSyncModelById,
  calculateLipSyncCost,
  LipSyncModelType,
} = await import('@/config/lipsync-models.config')

// Мокаем модули Supabase
vi.mock('@/core/supabase/saveVideoUrlToSupabase', () => ({
  saveVideoUrlToSupabase: vi.fn().mockResolvedValue(true),
}))

// Мокаем logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Мокаем Sync сервис
vi.mock('@/core/sync/generateSyncLipSync', () => ({
  generateSyncLipSync: vi.fn(),
}))

describe('Multi-Model Lip-Sync Service Tests', () => {
  describe('Конфигурация моделей', () => {
    it('должен возвращать доступные модели', () => {
      const models = getAvailableLipSyncModels()

      expect(models).toBeDefined()
      expect(Array.isArray(models)).toBe(true)
      expect(models.length).toBeGreaterThan(0)

      // Проверяем что каждая модель имеет необходимые поля
      models.forEach(model => {
        expect(model.id).toBeDefined()
        expect(model.name).toBeDefined()
        expect(model.provider).toBeDefined()
        expect(model.costPerSecond).toBeGreaterThan(0)
        expect(model.isAvailable).toBe(true)
      })
    })

    it('должен найти модель по ID', () => {
      const klingModel = getLipSyncModelById('kling')
      const syncModel = getLipSyncModelById('sync_v2')

      expect(klingModel).toBeDefined()
      expect(klingModel?.name).toContain('Kling')
      expect(klingModel?.provider).toBe('replicate')

      expect(syncModel).toBeDefined()
      expect(syncModel?.name).toContain('Sync')
      expect(syncModel?.provider).toBe('sync')
    })

    it('должен правильно рассчитывать стоимость', () => {
      const cost10s = calculateLipSyncCost('kling', 10)
      const cost30s = calculateLipSyncCost('sync_v2', 30)

      expect(cost10s).toBe(0.14) // Kling: $0.014 * 10s
      expect(cost30s).toBe(1.5) // Sync: $0.05 * 30s
    })

    it('должен выбросить ошибку для неизвестной модели', () => {
      expect(() => calculateLipSyncCost('unknown_model', 10)).toThrow()
    })
  })

  describe('Универсальная функция generateLipSync', () => {
    const mockTelegramId = '123456789'
    const mockVideoUrl = 'https://example.com/test-video.mp4'
    const mockAudioUrl = 'https://example.com/test-audio.mp3'
    const mockBotName = 'test_bot'

    beforeEach(() => {
      vi.clearAllMocks()
      process.env.REPLICATE_API_TOKEN = 'test-token'
    })

    it('должен использовать Kling модель по умолчанию', async () => {
      // Arrange
      const mockPrediction = {
        id: 'test-prediction-id',
        status: 'succeeded',
        output: 'https://example.com/result-video.mp4',
      }
      mockRun.mockResolvedValue(mockPrediction)

      // Act
      const result = await generateLipSync(
        mockVideoUrl,
        mockAudioUrl,
        mockTelegramId,
        mockBotName
        // modelId не передан - должен использовать default (Kling)
      )

      // Assert
      expect(result.modelUsed).toContain('Kling')
      expect(result.costEstimate).toBe(0.14) // 10 секунд * $0.014
      expect(mockRun).toHaveBeenCalled()
    })

    it('должен использовать указанную модель Kling', async () => {
      // Arrange
      const mockPrediction = {
        id: 'test-prediction-id',
        status: 'succeeded',
        output: 'https://example.com/result-video.mp4',
      }
      mockRun.mockResolvedValue(mockPrediction)

      // Act
      const result = await generateLipSync(
        mockVideoUrl,
        mockAudioUrl,
        mockTelegramId,
        mockBotName,
        'kling'
      )

      // Assert
      expect(result.modelUsed).toContain('Kling')
      expect(result.message).toContain('Kling')
      expect(mockRun).toHaveBeenCalled()
    })

    it('должен выбросить ошибку для неизвестной модели', async () => {
      // Act & Assert
      await expect(
        generateLipSync(
          mockVideoUrl,
          mockAudioUrl,
          mockTelegramId,
          mockBotName,
          'unknown_model'
        )
      ).rejects.toThrow('Неизвестная модель')
    })

    it('должен включать информацию о модели в ответ', async () => {
      // Arrange
      const mockPrediction = {
        id: 'test-prediction-id',
        status: 'processing',
        output: null,
      }
      mockRun.mockResolvedValue(mockPrediction)

      // Act
      const result = await generateLipSync(
        mockVideoUrl,
        mockAudioUrl,
        mockTelegramId,
        mockBotName,
        'kling'
      )

      // Assert
      expect(result.modelUsed).toBeDefined()
      expect(result.costEstimate).toBeDefined()
      expect(result.message).toContain('Kling')
    })
  })

  describe('Kling Lip-Sync функциональность', () => {
    const mockTelegramId = '123456789'
    const mockVideoUrl = 'https://example.com/test-video.mp4'
    const mockAudioUrl = 'https://example.com/test-audio.mp3'

    beforeEach(() => {
      vi.clearAllMocks()
      process.env.REPLICATE_API_TOKEN = 'test-token'
    })

    it('должен успешно создать предсказание с ID', async () => {
      // Arrange
      const mockPrediction = {
        id: 'test-prediction-id',
        status: 'starting',
        urls: {
          get: 'https://api.replicate.com/v1/predictions/test-prediction-id',
          cancel:
            'https://api.replicate.com/v1/predictions/test-prediction-id/cancel',
        },
      }
      mockRun.mockResolvedValue(mockPrediction)

      // Act
      const result = await generateKlingLipSync(
        mockTelegramId,
        mockVideoUrl,
        mockAudioUrl
      )

      // Assert
      expect(result).toBeDefined()
      expect((result as any).id).toBe('test-prediction-id')
      expect(mockRun).toHaveBeenCalledWith('kwaivgi/kling-lip-sync', {
        input: {
          video_url: mockVideoUrl,
          audio_url: mockAudioUrl,
        },
      })
    })

    it('должен вернуть ошибку при неудачном запросе', async () => {
      // Arrange
      mockRun.mockRejectedValue(new Error('API Error'))

      // Act
      const result = await generateKlingLipSync(
        mockTelegramId,
        mockVideoUrl,
        mockAudioUrl
      )

      // Assert
      expect((result as any).message).toBe(
        'Ошибка при генерации видео с липсинком'
      )
    })
  })
})
