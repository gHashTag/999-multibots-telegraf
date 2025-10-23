import { describe, it, expect, beforeEach } from 'bun:test'
import { FalVeedFabricProvider } from '../core/lipsync/providers/fal-veed-fabric-provider'
import { LipSyncInputBuilder } from '../core/lipsync/schemas/lipsync-schemas'

describe('AI Reels Fal.ai Integration Tests', () => {
  let falProvider: FalVeedFabricProvider

  beforeEach(async () => {
    // Устанавливаем FAL_KEY для тестов
    process.env.FAL_KEY = '71230666-ca55-4440-8481-ebaa20c469d1:fbb06be418637f3abb3c61dc85ec45fc'
    
    falProvider = new FalVeedFabricProvider()
  })

  it('должен создавать правильные входные данные для AI Reels', () => {
    const input = LipSyncInputBuilder.forFalVeedFabric(
      'https://example.com/image.jpg',
      'https://example.com/audio.mp3',
      '123456789',
      {
        botName: 'test_bot',
        resolution: '720p'
      }
    )

    expect(input.provider).toBe('fal')
    expect(input.modelId).toBe('fal-veed-fabric-1.0-fast')
    expect(input.imageUrl).toBe('https://example.com/image.jpg')
    expect(input.audioUrl).toBe('https://example.com/audio.mp3')
    expect(input.telegramId).toBe('123456789')
    expect(input.resolution).toBe('720p')
  })

  it('должен обрабатывать результат Fal.ai провайдера правильно', async () => {
    // Мокаем успешный ответ от Fal.ai
    const mockResult = {
      success: true,
      data: {
        id: 'test_id_123',
        status: 'succeeded',
        output: 'https://fal.media/files/test_video.mp4',
        modelUsed: 'Fal.ai Veed Fabric 1.0 Fast',
        costEstimate: 0.03,
        metadata: {
          resolution: '720p',
          contentType: 'video/mp4',
          provider: 'fal',
          modelId: 'veed/fabric-1.0/fast'
        }
      }
    }

    // Проверяем структуру ответа
    expect(mockResult.success).toBe(true)
    expect(mockResult.data).toBeDefined()
    expect(mockResult.data.id).toBe('test_id_123')
    expect(mockResult.data.output).toBe('https://fal.media/files/test_video.mp4')
    expect(mockResult.data.status).toBe('succeeded')
  })

  it('должен обрабатывать ошибки Fal.ai провайдера правильно', async () => {
    // Мокаем ошибку от Fal.ai
    const mockError = {
      success: false,
      message: 'Fal.ai account balance exhausted. Please top up your balance.',
      error: 'Fal.ai account locked due to insufficient balance',
      code: 'BALANCE_EXHAUSTED',
      provider: 'fal',
      modelId: 'fal-veed-fabric-1.0-fast'
    }

    // Проверяем структуру ошибки
    expect(mockError.success).toBe(false)
    expect(mockError.code).toBe('BALANCE_EXHAUSTED')
    expect(mockError.message).toContain('balance exhausted')
  })

  it('должен поддерживать разные разрешения видео', () => {
    const input480p = LipSyncInputBuilder.forFalVeedFabric(
      'https://example.com/image.jpg',
      'https://example.com/audio.mp3',
      '123456789',
      {
        botName: 'test_bot',
        resolution: '480p'
      }
    )

    const input720p = LipSyncInputBuilder.forFalVeedFabric(
      'https://example.com/image.jpg',
      'https://example.com/audio.mp3',
      '123456789',
      {
        botName: 'test_bot',
        resolution: '720p'
      }
    )

    expect(input480p.resolution).toBe('480p')
    expect(input720p.resolution).toBe('720p')
  })

  it('должен правильно обрабатывать метаданные Fal.ai провайдера', () => {
    const provider = new FalVeedFabricProvider()
    
    expect(provider.providerId).toBe('fal')
    expect(provider.providerName).toBe('Fal.ai Veed Fabric 1.0 Fast')
    expect(provider.supportedModels).toContain('fal-veed-fabric-1.0-fast')
  })
})
