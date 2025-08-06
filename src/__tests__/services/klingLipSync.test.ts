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

describe('Kling Lip-Sync Service Tests', () => {
  const mockTelegramId = '123456789'
  const mockVideoUrl = 'https://example.com/test-video.mp4'
  const mockAudioUrl = 'https://example.com/test-audio.mp3'

  beforeEach(() => {
    vi.clearAllMocks()

    // Устанавливаем переменную окружения
    process.env.REPLICATE_API_TOKEN = 'test-token'
  })

  describe('generateKlingLipSync', () => {
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
      expect(mockRun).toHaveBeenCalledWith('kwaivgi/kling-lip-sync', {
        input: {
          video_url: mockVideoUrl,
          audio_url: mockAudioUrl,
        },
      })

      expect(result).toEqual({
        id: 'test-prediction-id',
        status: 'starting',
        output: mockPrediction,
        urls: mockPrediction.urls,
      })
    })

    it('должен обработать синхронный результат (строка)', async () => {
      // Arrange
      const mockVideoResultUrl = 'https://example.com/result-video.mp4'
      mockRun.mockResolvedValue(mockVideoResultUrl)

      // Act
      const result = await generateKlingLipSync(
        mockTelegramId,
        mockVideoUrl,
        mockAudioUrl
      )

      // Assert
      expect(result).toMatchObject({
        status: 'succeeded',
        output: mockVideoResultUrl,
      })
      expect((result as any).id).toMatch(/^kling_lipsync_\d+_123456789$/)
    })

    it('должен обработать синхронный результат (массив)', async () => {
      // Arrange
      const mockVideoResultUrl = 'https://example.com/result-video.mp4'
      mockRun.mockResolvedValue([mockVideoResultUrl])

      // Act
      const result = await generateKlingLipSync(
        mockTelegramId,
        mockVideoUrl,
        mockAudioUrl
      )

      // Assert
      expect(result).toMatchObject({
        status: 'succeeded',
        output: mockVideoResultUrl,
      })
      expect((result as any).id).toMatch(/^kling_lipsync_\d+_123456789$/)
    })

    it('должен обработать ошибку Replicate API', async () => {
      // Arrange
      const mockError = new Error('Replicate API Error')
      mockRun.mockRejectedValue(mockError)

      // Act
      const result = await generateKlingLipSync(
        mockTelegramId,
        mockVideoUrl,
        mockAudioUrl
      )

      // Assert
      expect(result).toEqual({
        message: 'Ошибка при генерации видео с липсинком',
        error: 'Replicate API Error',
      })
    })

    it('должен обработать неожиданный формат ответа', async () => {
      // Arrange
      mockRun.mockResolvedValue(null)

      // Act
      const result = await generateKlingLipSync(
        mockTelegramId,
        mockVideoUrl,
        mockAudioUrl
      )

      // Assert
      expect(result).toEqual({
        message: 'Неожиданный формат ответа от сервиса генерации',
        error: 'UNEXPECTED_RESPONSE_FORMAT',
      })
    })
  })

  describe('getKlingLipSyncStatus', () => {
    it('должен получить статус предсказания', async () => {
      // Arrange
      const mockPredictionId = 'test-prediction-id'
      const mockStatusResponse = {
        id: mockPredictionId,
        status: 'succeeded',
        output: 'https://example.com/result-video.mp4',
        error: null,
        urls: {
          get: `https://api.replicate.com/v1/predictions/${mockPredictionId}`,
          cancel: `https://api.replicate.com/v1/predictions/${mockPredictionId}/cancel`,
        },
      }
      mockGet.mockResolvedValue(mockStatusResponse)

      // Act
      const result = await getKlingLipSyncStatus(mockPredictionId)

      // Assert
      expect(mockGet).toHaveBeenCalledWith(mockPredictionId)
      expect(result).toEqual(mockStatusResponse)
    })

    it('должен обработать ошибку при получении статуса', async () => {
      // Arrange
      const mockPredictionId = 'test-prediction-id'
      const mockError = new Error('API Error')
      mockGet.mockRejectedValue(mockError)

      // Act
      const result = await getKlingLipSyncStatus(mockPredictionId)

      // Assert
      expect(result).toEqual({
        message: 'Ошибка при проверке статуса генерации',
        error: 'API Error',
      })
    })
  })

  describe('Интеграционные тесты', () => {
    it('должен корректно обработать полный цикл генерации', async () => {
      // Arrange
      const mockPrediction = {
        id: 'integration-test-id',
        status: 'starting',
        urls: {
          get: 'https://api.replicate.com/v1/predictions/integration-test-id',
        },
      }
      mockRun.mockResolvedValue(mockPrediction)

      // Act - создаем предсказание
      const createResult = await generateKlingLipSync(
        mockTelegramId,
        mockVideoUrl,
        mockAudioUrl
      )

      // Assert - проверяем создание
      expect(createResult).toMatchObject({
        id: 'integration-test-id',
        status: 'starting',
      })

      // Arrange - мокаем получение статуса
      const mockCompletedStatus = {
        id: 'integration-test-id',
        status: 'succeeded',
        output: 'https://example.com/final-result.mp4',
        error: null,
        urls: mockPrediction.urls,
      }
      mockGet.mockResolvedValue(mockCompletedStatus)

      // Act - проверяем статус
      const statusResult = await getKlingLipSyncStatus('integration-test-id')

      // Assert - проверяем завершение
      expect(statusResult).toEqual(mockCompletedStatus)
    })
  })

  describe('Валидация параметров', () => {
    it('должен работать с валидными URL', async () => {
      // Arrange
      const validVideoUrl = 'https://example.com/valid-video.mp4'
      const validAudioUrl = 'https://example.com/valid-audio.mp3'
      mockRun.mockResolvedValue('https://example.com/result.mp4')

      // Act
      const result = await generateKlingLipSync(
        mockTelegramId,
        validVideoUrl,
        validAudioUrl
      )

      // Assert
      expect(result).toMatchObject({
        status: 'succeeded',
        output: 'https://example.com/result.mp4',
      })
    })

    it('должен работать с разными ID пользователей', async () => {
      // Arrange
      const differentTelegramId = '987654321'
      mockRun.mockResolvedValue('https://example.com/result.mp4')

      // Act
      const result = await generateKlingLipSync(
        differentTelegramId,
        mockVideoUrl,
        mockAudioUrl
      )

      // Assert
      expect((result as any).id).toMatch(/^kling_lipsync_\d+_987654321$/)
    })
  })
})
