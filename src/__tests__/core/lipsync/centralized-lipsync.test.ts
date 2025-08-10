import { describe, it, expect, vi, beforeEach } from 'vitest'

// Мокаем внешние зависимости
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/core/supabase/saveVideoUrlToSupabase', () => ({
  saveVideoUrlToSupabase: vi.fn().mockResolvedValue(true),
}))

// Мокаем Replicate
const mockRun = vi.fn()
const mockGet = vi.fn()
const mockModelsGet = vi.fn()

vi.mock('replicate', () => ({
  default: class MockReplicate {
    run = mockRun
    predictions = {
      get: mockGet,
    }
    models = {
      get: mockModelsGet,
    }
  },
}))

// Мокаем axios для Sync API
const mockAxios = {
  post: vi.fn(),
  get: vi.fn(),
}

vi.mock('axios', () => ({
  default: mockAxios,
  post: mockAxios.post,
  get: mockAxios.get,
}))

// Импортируем тестируемые модули
const {
  LipSyncModelManager,
  lipSyncProviderFactory,
  initializeDefaultProviders,
  getLipSyncManager,
  generateLipSyncVideo,
  getAvailableLipSyncModels,
  calculateLipSyncCost,
  LipSyncInputBuilder,
  validateLipSyncInput,
  LipSyncValidationError,
} = await import('@/core/lipsync')

describe('Централизованное управление Lip-Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Устанавливаем переменные окружения
    process.env.REPLICATE_API_TOKEN = 'test-replicate-token'
    process.env.SYNC_API_KEY = 'test-sync-key'

    // Мокаем доступность провайдеров
    mockModelsGet.mockResolvedValue({ id: 'test-model' })
    mockAxios.get.mockResolvedValue({ status: 200 })
  })

  describe('Zod схемы и валидация', () => {
    it('должен валидировать Kling входные данные', () => {
      const klingInput = LipSyncInputBuilder.forKling(
        'https://example.com/video.mp4',
        'https://example.com/audio.mp3',
        '123456789',
        { botName: 'test-bot' }
      )

      expect(klingInput).toMatchObject({
        videoUrl: 'https://example.com/video.mp4',
        audioUrl: 'https://example.com/audio.mp3',
        telegramId: '123456789',
        provider: 'replicate',
        modelId: 'kwaivgi/kling-lip-sync',
        botName: 'test-bot',
      })

      // Проверяем валидацию
      expect(() => validateLipSyncInput(klingInput)).not.toThrow()
    })

    it('должен валидировать Sync входные данные', () => {
      const syncInput = LipSyncInputBuilder.forSync(
        'https://example.com/video.mp4',
        'https://example.com/audio.mp3',
        '123456789',
        {
          botName: 'test-bot',
          enhance_quality: true,
          preserve_identity: true,
        }
      )

      expect(syncInput).toMatchObject({
        videoUrl: 'https://example.com/video.mp4',
        audioUrl: 'https://example.com/audio.mp3',
        telegramId: '123456789',
        provider: 'sync',
        modelId: 'sync/lipsync-2',
        botName: 'test-bot',
        parameters: {
          enhance_quality: true,
          preserve_identity: true,
        },
      })

      expect(() => validateLipSyncInput(syncInput)).not.toThrow()
    })

    it('должен выбросить ошибку валидации для некорректных данных', () => {
      const invalidInput = {
        videoUrl: 'not-a-url',
        audioUrl: 'also-not-a-url',
        telegramId: '',
        provider: 'unknown-provider',
      }

      expect(() => validateLipSyncInput(invalidInput)).toThrow(
        LipSyncValidationError
      )
    })
  })

  describe('Фабрика провайдеров', () => {
    it('должен создавать провайдер Replicate', () => {
      const provider = lipSyncProviderFactory.createProvider('replicate')

      expect(provider.providerId).toBe('replicate')
      expect(provider.providerName).toBe('Replicate Kling Lip-Sync')
      expect(provider.supportedModels).toContain('kling')
    })

    it('должен создавать провайдер Sync', () => {
      const provider = lipSyncProviderFactory.createProvider('sync')

      expect(provider.providerId).toBe('sync')
      expect(provider.providerName).toBe('Sync LipSync-2')
      expect(provider.supportedModels).toContain('sync_v2')
    })

    it('должен создавать все провайдеры одновременно', () => {
      const providers = initializeDefaultProviders()

      expect(providers.length).toBeGreaterThanOrEqual(2)
      expect(providers.some(p => p.providerId === 'replicate')).toBe(true)
      expect(providers.some(p => p.providerId === 'sync')).toBe(true)
    })

    it('должен использовать кэш для повторных создания', () => {
      const provider1 = lipSyncProviderFactory.createProvider('replicate')
      const provider2 = lipSyncProviderFactory.createProvider('replicate')

      expect(provider1).toBe(provider2) // Тот же экземпляр
    })
  })

  describe('Менеджер моделей', () => {
    let manager: LipSyncModelManager

    beforeEach(() => {
      manager = new LipSyncModelManager({
        defaultModel: 'kling',
        retryAttempts: 2,
        enableCaching: false, // Отключаем кэш для тестов
      })

      // Регистрируем провайдеры
      const providers = initializeDefaultProviders()
      providers.forEach(provider => manager.registerProvider(provider))
    })

    it('должен возвращать доступные модели', () => {
      const models = manager.getAvailableModels()

      expect(models.length).toBeGreaterThan(0)
      expect(models.some(m => m.id === 'kling')).toBe(true)
      expect(models.some(m => m.id === 'sync_v2')).toBe(true)
    })

    it('должен находить модель по ID', () => {
      const klingModel = manager.getModelById('kling')
      const syncModel = manager.getModelById('sync_v2')

      expect(klingModel).toBeDefined()
      expect(klingModel?.provider).toBe('replicate')

      expect(syncModel).toBeDefined()
      expect(syncModel?.provider).toBe('sync')
    })

    it('должен возвращать модель по умолчанию', () => {
      const defaultModel = manager.getDefaultModel()

      expect(defaultModel.id).toBe('kling')
    })

    it('должен рассчитывать стоимость', () => {
      const klingCost = manager.calculateCost(10, 'kling')
      const syncCost = manager.calculateCost(10, 'sync_v2')

      expect(klingCost).toBe(0.14) // 10 * 0.014
      expect(syncCost).toBe(0.5) // 10 * 0.05
    })

    it('должен генерировать видео через Kling', async () => {
      // Мокаем успешный ответ Replicate
      mockRun.mockResolvedValue('https://example.com/result.mp4')

      const input = LipSyncInputBuilder.forKling(
        'https://example.com/video.mp4',
        'https://example.com/audio.mp3',
        '123456789'
      )

      const result = await manager.generate(input, 'kling')

      expect(result.success).toBe(true)
      expect(result.data?.output).toBe('https://example.com/result.mp4')
      expect(mockRun).toHaveBeenCalledWith(
        'kwaivgi/kling-lip-sync',
        {
          input: {
            video_url: 'https://example.com/video.mp4',
            audio_url: 'https://example.com/audio.mp3',
          },
        },
        {}
      )
    })

    it('должен генерировать видео через Sync', async () => {
      // Мокаем успешный ответ Sync API
      mockAxios.post.mockResolvedValue({
        data: {
          id: 'sync-prediction-123',
          status: 'succeeded',
          output: 'https://example.com/sync-result.mp4',
        },
      })

      const input = LipSyncInputBuilder.forSync(
        'https://example.com/video.mp4',
        'https://example.com/audio.mp3',
        '123456789'
      )

      const result = await manager.generate(input, 'sync_v2')

      expect(result.success).toBe(true)
      expect(result.data?.output).toBe('https://example.com/sync-result.mp4')
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.sync.so/predictions',
        expect.objectContaining({
          model: 'lipsync-2',
          input: expect.objectContaining({
            face: 'https://example.com/video.mp4',
            audio: 'https://example.com/audio.mp3',
          }),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-sync-key',
          }),
        })
      )
    })

    it('должен обрабатывать ошибки', async () => {
      mockRun.mockRejectedValue(new Error('Replicate API error'))

      const input = LipSyncInputBuilder.forKling(
        'https://example.com/video.mp4',
        'https://example.com/audio.mp3',
        '123456789'
      )

      const result = await manager.generate(input, 'kling')

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain(
        'Ошибка при генерации видео с липсинком'
      )
    })
  })

  describe('Глобальные функции удобства', () => {
    beforeEach(() => {
      // Мокаем успешный ответ для тестов
      mockRun.mockResolvedValue('https://example.com/result.mp4')
    })

    it('должен возвращать доступные модели', () => {
      const models = getAvailableLipSyncModels()

      expect(models.length).toBeGreaterThan(0)
      expect(models.some(m => m.id === 'kling')).toBe(true)
    })

    it('должен рассчитывать стоимость', () => {
      const cost = calculateLipSyncCost(20, 'kling')
      expect(cost).toBe(0.28) // 20 * 0.014
    })

    it('должен генерировать видео через удобную функцию', async () => {
      const result = await generateLipSyncVideo(
        'https://example.com/video.mp4',
        'https://example.com/audio.mp3',
        '123456789',
        { modelId: 'kling' }
      )

      expect(result.success).toBe(true)
      expect(result.data?.output).toBe('https://example.com/result.mp4')
    })
  })

  describe('Интеграция с обновленным сервисом', () => {
    beforeEach(() => {
      mockRun.mockResolvedValue('https://example.com/result.mp4')
    })

    it('должен использовать новый менеджер через обновленный generateLipSync', async () => {
      // Импортируем обновленную функцию
      const { generateLipSync } = await import('@/services/generateLipSync')

      const result = await generateLipSync(
        'https://example.com/video.mp4',
        'https://example.com/audio.mp3',
        '123456789',
        'test-bot',
        'kling'
      )

      expect(result.message).toContain('Kling Lip-Sync')
      expect(result.resultUrl).toBe('https://example.com/result.mp4')
      expect(result.modelUsed).toContain('Kling')
      expect(typeof result.costEstimate).toBe('number')
    })
  })
})
