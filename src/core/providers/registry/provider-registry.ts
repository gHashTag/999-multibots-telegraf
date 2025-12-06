/**
 * Provider Registry - Functional Registry
 * 100% функциональный стиль, без классов
 */

import * as t from 'io-ts'
import { Provider } from '../adapters/types'
import { ProviderConfig, ProviderName } from '../../../core/functional/types/media.types'
import createKieAiProvider from '../adapters/kie-ai.adapter'
import createReplicateProvider from '../adapters/replicate.adapter'
import createElevenLabsProvider from '../adapters/elevenlabs.adapter'
import createFalProvider from '../adapters/fal.adapter'

// ===== REGISTRY IMPLEMENTATION =====

export interface ProviderRegistry {
  getProvider: (name: string) => Provider | undefined
  getProvidersByCapability: (capability: string) => Provider[]
  listProviders: () => Provider[]
  healthCheckAll: () => Promise<{ name: string; healthy: boolean }[]>
  getHealthyProviders: (capability: string) => Promise<Provider[]>
  hasProvider: (name: string) => boolean
  getProviderCount: () => number
  getCapabilities: () => string[]
}

// ===== PROVIDER FACTORY MAP =====

const providerFactories = {
  'kie-ai': createKieAiProvider,
  'replicate': createReplicateProvider,
  'elevenlabs': createElevenLabsProvider,
  'fal': createFalProvider
  // 'openrouter': createOpenRouterProvider
} as const

// ===== REGISTRY CREATION =====

export const createProviderRegistry = (configs: ProviderConfig[]): ProviderRegistry => {
  const providers = new Map<string, Provider>()
  const capabilities = new Set<string>()

  // Initialize providers
  configs.forEach(config => {
    const providerName = config.name as keyof typeof providerFactories
    const factory = providerFactories[providerName]

    if (factory) {
      const provider = factory(config)
      providers.set(providerName, provider)

      // Extract capabilities
      const operationMethods = ['generateVideo', 'generateImage', 'generateAudio', 'performFaceSwap']
      operationMethods.forEach(method => {
        if (method in provider) {
          capabilities.add(method.replace('generate', '').replace('perform', ''))
        }
      })
    }
  })

  // ===== GET PROVIDER =====

  const getProvider = (name: string): Provider | undefined => {
    return providers.get(name)
  }

  // ===== GET PROVIDERS BY CAPABILITY =====

  const getProvidersByCapability = (capability: string): Provider[] => {
    return Array.from(providers.values()).filter(provider => {
      const hasCapability = (() => {
        switch (capability) {
          case 'video':
            return 'generateVideo' in provider
          case 'image':
            return 'generateImage' in provider
          case 'audio':
            return 'generateAudio' in provider
          case 'face-swap':
            return 'performFaceSwap' in provider
          default:
            return false
        }
      })()
      return hasCapability
    })
  }

  // ===== LIST ALL PROVIDERS =====

  const listProviders = (): Provider[] => {
    return Array.from(providers.values())
  }

  // ===== HEALTH CHECK ALL =====

  const healthCheckAll = async (): Promise<{ name: string; healthy: boolean }[]> => {
    const results = await Promise.all(
      Array.from(providers.entries()).map(async ([name, provider]) => {
        try {
          const health = await provider.healthCheck()()
          return {
            name,
            healthy: health._tag === 'Right'
          }
        } catch (error) {
          return {
            name,
            healthy: false
          }
        }
      })
    )

    return results
  }

  // ===== GET HEALTHY PROVIDERS =====

  const getHealthyProviders = async (capability: string): Promise<Provider[]> => {
    const providersByCapability = getProvidersByCapability(capability)
    const healthyProviders: Provider[] = []

    for (const provider of providersByCapability) {
      try {
        const health = await provider.healthCheck()()
        if (health._tag === 'Right' && health.right.status === 'healthy') {
          healthyProviders.push(provider)
        }
      } catch (error) {
        // Provider is not healthy, skip it
      }
    }

    return healthyProviders
  }

  // ===== HAS PROVIDER =====

  const hasProvider = (name: string): boolean => {
    return providers.has(name)
  }

  // ===== GET PROVIDER COUNT =====

  const getProviderCount = (): number => {
    return providers.size
  }

  // ===== GET CAPABILITIES =====

  const getCapabilities = (): string[] => {
    return Array.from(capabilities.values())
  }

  return {
    getProvider,
    getProvidersByCapability,
    listProviders,
    healthCheckAll,
    getHealthyProviders,
    hasProvider,
    getProviderCount,
    getCapabilities
  }
}

// ===== DEFAULT REGISTRY =====

export const createDefaultRegistry = (): ProviderRegistry => {
  // Validate and decode the provider name using the codec
  const kieAiNameResult = ProviderName.decode('kie-ai')
  if (kieAiNameResult._tag !== 'Right') {
    throw new Error('Invalid provider name: kie-ai')
  }

  // Type assertion is safe because we validated with codec above
  const providerName: t.TypeOf<typeof ProviderName> = kieAiNameResult.right

  const defaultConfigs: ProviderConfig[] = [
    {
      name: providerName,
      apiKey: process.env.KIE_AI_API_KEY || '',
      baseUrl: process.env.KIE_AI_BASE_URL || 'https://api.kie.ai',
      timeout: 30000,
      rateLimit: {
        requestsPerMinute: 60
      }
    }
  ]

  return createProviderRegistry(defaultConfigs)
}

// ===== REGISTRY HELPERS =====

export const getProviderByName = (registry: ProviderRegistry, name: string): Provider | undefined => {
  return registry.getProvider(name)
}

export const getProviderByCapability = (
  registry: ProviderRegistry,
  capability: string
): Provider[] => {
  return registry.getProvidersByCapability(capability)
}

export const getBestProvider = async (
  registry: ProviderRegistry,
  capability: string
): Promise<Provider | undefined> => {
  const healthyProviders = await registry.getHealthyProviders(capability)

  if (healthyProviders.length === 0) {
    return undefined
  }

  // Simple round-robin selection
  // In a real implementation, could use weighted selection based on performance
  const index = Math.floor(Math.random() * healthyProviders.length)
  return healthyProviders[index]
}

export const getAllHealthyProviders = async (
  registry: ProviderRegistry,
  capability: string
): Promise<Provider[]> => {
  return registry.getHealthyProviders(capability)
}

export const healthCheckRegistry = async (registry: ProviderRegistry) => {
  return registry.healthCheckAll()
}

export const printRegistryStatus = (registry: ProviderRegistry) => {
  const providers = registry.listProviders()
  console.log(`\n📋 Provider Registry Status:`)
  console.log(`   Total Providers: ${providers.length}`)
  console.log(`   Available Capabilities: ${registry.getCapabilities().join(', ')}`)

  providers.forEach(provider => {
    console.log(`   - ${provider.name}: ${provider.config.baseUrl}`)
  })
}

// ===== EXPORT ALL =====

export default {
  createProviderRegistry,
  createDefaultRegistry,
  getProviderByName,
  getProviderByCapability,
  getBestProvider,
  getAllHealthyProviders,
  healthCheckRegistry,
  printRegistryStatus
}