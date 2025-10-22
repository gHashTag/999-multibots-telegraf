/**
 * Простые тесты для Fal.ai Veed Fabric Provider
 */

import { describe, it, expect } from 'bun:test'
import { FalVeedFabricProvider } from '@/core/lipsync/providers/fal-veed-fabric-provider'
import { LipSyncInputBuilder } from '@/core/lipsync/schemas/lipsync-schemas'

describe('Fal.ai Veed Fabric Provider - Simple Tests', () => {
  it('должен создаваться с правильными параметрами', () => {
    process.env.FAL_KEY = 'test-key'
    
    const provider = new FalVeedFabricProvider()
    
    expect(provider.providerId).toBe('fal')
    expect(provider.providerName).toBe('Fal.ai Veed Fabric 1.0 Fast')
    expect(provider.supportedModels).toEqual(['fal-veed-fabric-1.0-fast'])
  })

  it('должен создавать правильные входные данные через LipSyncInputBuilder', () => {
    const input = LipSyncInputBuilder.forFalVeedFabric(
      'https://example.com/image.jpg',
      'https://example.com/audio.mp3',
      '123456789',
      {
        resolution: '720p',
        botName: 'test-bot',
      }
    )

    expect(input.provider).toBe('fal')
    expect(input.modelId).toBe('fal-veed-fabric-1.0-fast')
    expect(input.imageUrl).toBe('https://example.com/image.jpg')
    expect(input.audioUrl).toBe('https://example.com/audio.mp3')
    expect(input.telegramId).toBe('123456789')
    expect(input.resolution).toBe('720p')
    expect(input.botName).toBe('test-bot')
  })

  it('должен поддерживать метод getStatus', async () => {
    process.env.FAL_KEY = 'test-key'
    
    const provider = new FalVeedFabricProvider()
    const result = await provider.getStatus('test-task-id')

    expect(result.status).toBe('succeeded')
    expect(result.message).toContain('synchronous')
  })

  it('должен поддерживать метод generateLipSync', async () => {
    process.env.FAL_KEY = 'test-key'
    
    const provider = new FalVeedFabricProvider()
    
    // Проверяем, что метод существует
    expect(typeof provider.generateLipSync).toBe('function')
  })
})
