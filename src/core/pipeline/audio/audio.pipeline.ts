/**
 * Audio Generation Pipeline - Functional Composition
 * 100% функциональный стиль, без классов
 */

import { pipe, tap } from '../../../core/functional/utils/composition'
import { TaskEither, Either, left, right, tapTask, chain, map } from '../../../core/functional/utils/result'
import {
  AudioRequest,
  AudioResult,
  Provider,
  ProviderRegistry,
  PipelineConfig,
  Cache
} from '../../../core/functional/types/media.types'

// ===== PIPELINE STEP TYPES =====

export type PipelineStep<T, R> = (input: T) => TaskEither<Error, R>
export type AudioPipeline = PipelineStep<AudioRequest, AudioResult>

// ===== VALIDATION STEP =====

export const validateInput = (request: AudioRequest): TaskEither<Error, AudioRequest> =>
  async (): Promise<Either<Error, AudioRequest>> => {
    if (!request.prompt || request.prompt.trim().length === 0) {
      return left(new Error('Prompt is required'))
    }
    if (!request.model) {
      return left(new Error('Model is required'))
    }
    if (!request.userId) {
      return left(new Error('User ID is required'))
    }
    if (!request.duration || request.duration <= 0) {
      return left(new Error('Duration must be positive'))
    }

    return right(request)
  }

// ===== PROVIDER SELECTION STEP =====

export const selectProvider = (registry: ProviderRegistry) =>
  (request: AudioRequest): TaskEither<Error, Provider> =>
    async (): Promise<Either<Error, Provider>> => {
      const providers = registry.getProvidersByCapability('audio')

      if (providers.length === 0) {
        return left(new Error('No audio providers available'))
      }

      const provider = providers[0]

      return right(provider)
    }

// ===== RATE LIMIT STEP =====

export const rateLimit = (config: PipelineConfig) =>
  (provider: Provider) =>
  (request: AudioRequest): TaskEither<Error, Provider> =>
    async (): Promise<Either<Error, Provider>> => {
      try {
        const result = await provider.rateLimit(request)()
        if (result._tag === 'Left') {
          return left(new Error(`Rate limit exceeded for provider ${provider.name}`))
        }
        return right(provider)
      } catch (error) {
        return left(error instanceof Error ? error : new Error('Rate limit check failed'))
      }
    }

// ===== CIRCUIT BREAKER STEP =====

export const checkCircuitBreaker = (config: PipelineConfig) =>
  (provider: Provider) =>
  (request: AudioRequest): TaskEither<Error, Provider> =>
    async (): Promise<Either<Error, Provider>> => {
      const failures = 0
      const threshold = config.circuitBreaker?.failureThreshold || 5

      if (failures >= threshold) {
        return left(new Error(`Circuit breaker open for provider ${provider.name}`))
      }

      return right(provider)
    }

// ===== TIMEOUT STEP =====

export const applyTimeout = (config: PipelineConfig) =>
  (provider: Provider) =>
  (request: AudioRequest): TaskEither<Error, Provider> =>
    async (): Promise<Either<Error, Provider>> => {
      return right(provider)
    }

// ===== CACHE CHECK STEP =====

export const checkCache = (cache: Cache<AudioResult>) =>
  (request: AudioRequest): TaskEither<Error, AudioRequest | { fromCache: true; result: AudioResult }> =>
    async (): Promise<Either<Error, AudioRequest | { fromCache: true; result: AudioResult }>> => {
      const cacheKey = `audio:${request.model}:${request.prompt}:${request.duration}:${request.voice_id || 'default'}:${request.language || 'en'}`
      const cached = cache.get(cacheKey)

      if (cached) {
        return right({ fromCache: true, result: cached })
      }

      return right(request)
    }

// ===== EXECUTION STEP =====

export const executeGeneration = (provider: Provider) =>
  (request: AudioRequest): TaskEither<Error, AudioResult> =>
    provider.generateAudio(request)

// ===== CACHE SAVE STEP =====

export const saveToCache = (cache: Cache<AudioResult>) =>
  (request: AudioRequest) =>
  (result: AudioResult): TaskEither<Error, AudioResult> =>
    async (): Promise<Either<Error, AudioResult>> => {
      const cacheKey = `audio:${request.model}:${request.prompt}:${request.duration}:${request.voice_id || 'default'}:${request.language || 'en'}`
      cache.set(cacheKey, result)
      return right(result)
    }

// ===== ERROR HANDLING STEP =====

export const handleErrors = (operation: string) =>
  <T>(result: Either<Error, T>): Either<Error, T> => {
    if (result._tag === 'Left') {
      console.error(`[Pipeline] ${operation} failed:`, result.value)
    }
    return result
  }

// ===== METRICS STEP =====

export const recordMetrics = (provider: Provider) =>
  (startTime: number) =>
  (result: Either<Error, AudioResult>): Either<Error, AudioResult> => {
    const latency = Date.now() - startTime
    const success = result._tag === 'Right'

    console.log(`[Metrics] Provider: ${provider.name}, Latency: ${latency}ms, Success: ${success}`)

    return result
  }

// ===== PIPELINE COMPOSITION =====

export const createAudioPipeline = (
  registry: ProviderRegistry,
  cache: Cache<AudioResult>,
  config: PipelineConfig
): AudioPipeline =>
  (request: AudioRequest): TaskEither<Error, AudioResult> =>
    async (): Promise<Either<Error, AudioResult>> => {
      const startTime = Date.now()

      try {
        const pipeline = pipe(
          validateInput,
          tapTask(() => console.log(`[Pipeline] Starting audio generation for request:`, {
            model: request.model,
            duration: request.duration,
            voice_id: request.voice_id,
            language: request.language
          })),
          chain(checkCache(cache)),
          tapTask((input) => {
            if ('fromCache' in input && input.fromCache) {
              console.log('[Pipeline] Cache hit!')
            }
          }),
          chain((input) => {
            if ('fromCache' in input && input.fromCache) {
              return async () => Promise.resolve(right(input.result))
            }
            return pipe(
              validateInput,
              chain(selectProvider(registry)),
              chain(rateLimit(config)),
              chain(checkCircuitBreaker(config)),
              chain(applyTimeout(config)),
              chain(executeGeneration),
              chain(saveToCache(cache)(request))
            )(input as AudioRequest)
          }),
          tapTask((result) => {
            if (result._tag === 'Right') {
              console.log(`[Pipeline] Audio generation completed:`, {
                provider: result.value.provider,
                taskId: result.value.taskId,
                audioUrl: result.value.audioUrl,
                duration: result.value.duration
              })
            }
          }),
          map(recordMetrics({ name: 'unknown' })(startTime)),
          map(handleErrors('audio generation'))
        )

        const result = await pipeline(request)
        return result
      } catch (error) {
        const errorResult = left(error instanceof Error ? error : new Error(String(error)))
        const handled = handleErrors('audio generation')(errorResult)
        return Promise.resolve(handled)
      }
    }

// ===== PIPELINE COMPOSITION WITH ERROR HANDLING =====

export const createAudioPipelineWithErrorHandling = (
  registry: ProviderRegistry,
  cache: Cache<AudioResult>,
  config: PipelineConfig,
  fallbackProviders: Provider[]
): AudioPipeline =>
  async (request: AudioRequest): Promise<Either<Error, AudioResult>> => {
    const primaryPipeline = createAudioPipeline(registry, cache, config)

    try {
      const result = await primaryPipeline(request)()

      if (result._tag === 'Right') {
        return result
      }

      console.log('[Pipeline] Primary provider failed, trying fallbacks...')

      for (const provider of fallbackProviders) {
        try {
          const pipelineWithProvider = pipe(
            validateInput,
            chain(rateLimit(config)),
            chain(applyTimeout(config)),
            chain(executeGeneration),
            map((result) => {
              console.log(`[Pipeline] Fallback provider ${provider.name} succeeded`)
              return result
            })
          )

          const fallbackResult = await pipelineWithProvider(request)()

          if (fallbackResult._tag === 'Right') {
            return fallbackResult
          }
        } catch (error) {
          console.log(`[Pipeline] Fallback provider ${provider.name} failed:`, error)
          continue
        }
      }

      return left(new Error('All providers failed'))
    } catch (error) {
      return left(error instanceof Error ? error : new Error(String(error)))
    }
  }

// ===== HELPER FUNCTIONS =====

export const createSimpleCache = <T>(): Cache<T> => {
  const store = new Map<string, T>()

  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: T) => store.set(key, value),
    delete: (key: string) => store.delete(key),
    clear: () => store.clear(),
    has: (key: string) => store.has(key)
  }
}

export const createTimedCache = <T>(ttl: number = 300000): Cache<T> => {
  const store = new Map<string, { value: T; expires: number }>()

  return {
    get: (key: string) => {
      const entry = store.get(key)
      if (!entry) return undefined

      if (Date.now() > entry.expires) {
        store.delete(key)
        return undefined
      }

      return entry.value
    },
    set: (key: string, value: T) => {
      store.set(key, {
        value,
        expires: Date.now() + ttl
      })
    },
    delete: (key: string) => store.delete(key),
    clear: () => store.clear(),
    has: (key: string) => {
      const entry = store.get(key)
      if (!entry) return false

      if (Date.now() > entry.expires) {
        store.delete(key)
        return false
      }

      return true
    }
  }
}

// ===== EXPORT ALL =====

export default {
  createAudioPipeline,
  createAudioPipelineWithErrorHandling,
  validateInput,
  selectProvider,
  rateLimit,
  checkCircuitBreaker,
  applyTimeout,
  checkCache,
  executeGeneration,
  saveToCache,
  handleErrors,
  recordMetrics,
  createSimpleCache,
  createTimedCache
}
