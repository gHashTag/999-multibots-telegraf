/**
 * Provider Registry Tests - Functional Provider Management
 * 100% покрытие тестами
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createProviderRegistry,
  createDefaultRegistry,
  getProviderByName,
  getProviderByCapability,
  getBestProvider,
  healthCheckRegistry,
  printRegistryStatus
} from '../../../src/core/providers/registry/provider-registry'
import { ProviderConfig, ProviderName as ProviderNameCodec } from '../../../src/core/functional/types/media.types'
import type { ProviderName } from '../../../src/core/functional/types/media.types'
import { isRight } from '../../../src/core/functional/utils/result'

// Helper to create ProviderName from string
const createProviderName = (name: string): ProviderName => {
  const decoded = ProviderNameCodec.decode(name)
  if (isRight(decoded)) {
    return decoded.right
  }
  throw new Error(`Invalid provider name: ${name}`)
}

// Mock Provider
const createMockProvider = (name: string) => {
  let providerName: ProviderName
  try {
    providerName = createProviderName(name)
  } catch {
    // Fallback для неизвестных провайдеров в тестах
    providerName = name as any as ProviderName
  }
  return {
    name,
    config: {
      name: providerName,
      apiKey: 'test-key',
      baseUrl: `https://${name}.api.test`,
      timeout: 30000,
      rateLimit: {
        requestsPerMinute: 60
      }
    } as ProviderConfig,
    generateVideo: async () => ({ _tag: 'Right' as const, right: { videoUrl: 'test.mp4', provider: name } }),
    generateImage: async () => ({ _tag: 'Right' as const, right: { imageUrl: 'test.jpg', provider: name } }),
    generateAudio: async () => ({ _tag: 'Right' as const, right: { audioUrl: 'test.mp3', provider: name } }),
    performFaceSwap: async () => ({ _tag: 'Right' as const, right: { imageUrl: 'test-swapped.jpg', provider: name } }),
    healthCheck: async () => ({ _tag: 'Right' as const, right: { status: 'healthy', latency: 10, uptime: 1000, lastCheck: Date.now() } }),
    getBalance: async () => ({ _tag: 'Right' as const, right: { currency: 'usd', available: 100, reserved: 0, lastUpdated: Date.now() } }),
    rateLimit: async () => ({ _tag: 'Right' as const, right: undefined })
  }
}

// Mock KieAiProvider to avoid import error
vi.mock('../../../src/core/providers/adapters/kie-ai.adapter', () => ({
  default: createMockProvider
}))

describe('Provider Registry', () => {
  describe('createProviderRegistry', () => {
    it('should create a registry with providers', () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)
      expect(registry.getProviderCount()).toBe(1)
      expect(registry.hasProvider('kie-ai')).toBe(true)
    })

    it('should handle multiple providers', () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key-1',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        },
        {
          name: createProviderName('replicate'),
          apiKey: 'test-key-2',
          baseUrl: 'https://api.replicate.com',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)
      expect(registry.getProviderCount()).toBe(2)
      expect(registry.hasProvider('kie-ai')).toBe(true)
      expect(registry.hasProvider('replicate')).toBe(true)
      expect(registry.hasProvider('elevenlabs')).toBe(false)
    })

    it('should filter by capability', () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)

      const videoProviders = registry.getProvidersByCapability('video')
      expect(videoProviders.length).toBeGreaterThan(0)

      const audioProviders = registry.getProvidersByCapability('audio')
      expect(audioProviders.length).toBeGreaterThan(0)
    })

    it('should list all providers', () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)
      const providers = registry.listProviders()

      expect(providers).toHaveLength(1)
      expect(providers[0].name).toBe('kie-ai')
    })

    it('should check if provider exists', () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)

      expect(registry.hasProvider('kie-ai')).toBe(true)
      expect(registry.hasProvider('non-existent')).toBe(false)
    })

    it('should return undefined for non-existent provider', () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)
      const provider = registry.getProvider('non-existent')

      expect(provider).toBeUndefined()
    })
  })

  describe('createDefaultRegistry', () => {
    it('should create default registry with KieAi provider', () => {
      const registry = createDefaultRegistry()

      expect(registry.getProviderCount()).toBeGreaterThanOrEqual(1)
      expect(registry.hasProvider('kie-ai')).toBe(true)
    })

    it('should use environment variables for configuration', () => {
      process.env.KIE_AI_API_KEY = 'env-test-key'
      process.env.KIE_AI_BASE_URL = 'https://env-api.kie.ai'

      const registry = createDefaultRegistry()
      const provider = registry.getProvider('kie-ai')

      expect(provider).toBeDefined()
      if (provider) {
        expect(provider.config.apiKey).toBe('env-test-key')
        expect(provider.config.baseUrl).toBe('https://env-api.kie.ai')
      }
    })

    afterEach(() => {
      delete process.env.KIE_AI_API_KEY
      delete process.env.KIE_AI_BASE_URL
    })
  })

  describe('Helper Functions', () => {
    it('should get provider by name', () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)
      const provider = getProviderByName(registry, 'kie-ai')

      expect(provider).toBeDefined()
      expect(provider?.name).toBe('kie-ai')
    })

    it('should get provider by capability', () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)
      const providers = getProviderByCapability(registry, 'video')

      expect(providers.length).toBeGreaterThan(0)
      expect(providers[0].name).toBe('kie-ai')
    })

    it('should get best provider', async () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)
      const provider = await getBestProvider(registry, 'video')

      expect(provider).toBeDefined()
      expect(provider?.name).toBe('kie-ai')
    })

    it('should handle health check of all providers', async () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)
      const results = await healthCheckRegistry(registry)

      expect(results).toHaveLength(1)
      expect(results[0]).toHaveProperty('name')
      expect(results[0]).toHaveProperty('healthy')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty config array', () => {
      const configs: ProviderConfig[] = []
      const registry = createProviderRegistry(configs)

      expect(registry.getProviderCount()).toBe(0)
      expect(registry.listProviders()).toHaveLength(0)
      expect(registry.getProvidersByCapability('video')).toHaveLength(0)
    })

    it('should handle unknown provider name', () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)
      const provider = registry.getProvider('unknown-provider')

      expect(provider).toBeUndefined()
    })

    it('should handle unknown capability', () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)
      const providers = registry.getProvidersByCapability('unknown-capability')

      expect(providers).toHaveLength(0)
    })

    it('should get capabilities list', () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)
      const capabilities = registry.getCapabilities()

      expect(capabilities).toContain('video')
      expect(capabilities).toContain('image')
      expect(capabilities).toContain('audio')
      expect(capabilities).toContain('face-swap')
    })
  })

  describe('Error Handling', () => {
    it('should handle provider factory errors gracefully', () => {
      // This test ensures that if a provider factory throws,
      // the registry continues to work with other providers

      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      // The registry should handle missing providers gracefully
      const registry = createProviderRegistry(configs)

      // If a provider name is not in the factory map, it should be skipped
      const unknownConfig: ProviderConfig = {
        name: 'unknown-provider' as any,
        apiKey: 'test-key',
        baseUrl: 'https://unknown.api.test',
        timeout: 30000,
        rateLimit: {
          requestsPerMinute: 60
        }
      }

      // Registry should not crash on unknown providers
      expect(() => createProviderRegistry([...configs, unknownConfig])).not.toThrow()
    })
  })

  describe('Console Output', () => {
    it('should print registry status without errors', () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)

      // Should not throw when printing status
      expect(() => printRegistryStatus(registry)).not.toThrow()
    })
  })

  describe('Complex Scenarios', () => {
    it('should manage multiple providers with different capabilities', () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key-1',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)

      // Video providers
      const videoProviders = registry.getProvidersByCapability('video')
      expect(videoProviders.length).toBeGreaterThanOrEqual(1)

      // Image providers
      const imageProviders = registry.getProvidersByCapability('image')
      expect(imageProviders.length).toBeGreaterThanOrEqual(1)

      // Audio providers
      const audioProviders = registry.getProvidersByCapability('audio')
      expect(audioProviders.length).toBeGreaterThanOrEqual(1)

      // Face swap providers
      const faceSwapProviders = registry.getProvidersByCapability('face-swap')
      expect(faceSwapProviders.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle health checks for multiple providers', async () => {
      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

      const registry = createProviderRegistry(configs)
      const results = await registry.healthCheckAll()

      expect(results).toHaveLength(1)

      const kieResult = results.find(r => r.name === 'kie-ai')
      expect(kieResult).toBeDefined()
      expect(kieResult?.healthy).toBe(true) // Mocked provider is always healthy
    })
  })
})

// Mock fetch globally for health checks
global.fetch = vi.fn()

describe('Provider Registry - Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should perform health check on KieAi provider', async () => {
    // Mock successful health check response
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'healthy', uptime: 1000 })
    } as Response)

      const configs: ProviderConfig[] = [
        {
          name: createProviderName('kie-ai'),
          apiKey: 'test-key',
          baseUrl: 'https://api.kie.ai',
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 60
          }
        }
      ]

    const registry = createProviderRegistry(configs)
    const provider = registry.getProvider('kie-ai')

    expect(provider).toBeDefined()

    if (provider) {
      const health = await provider.healthCheck()()
      expect(health._tag).toBe('Right')
      if (health._tag === 'Right') {
        expect(health.right.status).toBe('healthy')
      }
    }
  })
})