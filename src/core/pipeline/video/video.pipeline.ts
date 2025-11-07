/**
 * Video Generation Pipeline - Functional Composition
 * 100% функциональный стиль, без классов
 */

import { pipe, tap } from '../../../core/functional/utils/composition'
import { TaskEither, Either, left, right, tapTask, chain, map } from '../../../core/functional/utils/result'
import {
  VideoRequest,
  VideoResult,
  Provider,
  ProviderRegistry,
  PipelineConfig,
  CircuitBreakerConfig,
  Cache
} from '../../../core/functional/types/media.types'
import type { MediaRequest } from '../../../core/functional/types/media.types'

// ===== PIPELINE STEP TYPES =====

export type PipelineStep<T, R> = (input: T) => TaskEither<Error, R>
export type VideoPipeline = PipelineStep<VideoRequest, VideoResult>

// ===== VALIDATION STEP =====

export const validateInput = (request: VideoRequest): TaskEither<Error, VideoRequest> =>
  async (): Promise<Either<Error, VideoRequest>> => {
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
  (request: VideoRequest): TaskEither<Error, Provider> =>
    async (): Promise<Either<Error, Provider>> => {
      const providers = registry.getProvidersByCapability('video')

      if (providers.length === 0) {
        return left(new Error('No video providers available'))
      }

      // Simple selection - could be enhanced with:
      // - Load balancing
      // - Performance metrics
      // - Cost optimization
      const provider = providers[0]

      return right(provider)
    }

// ===== RATE LIMIT STEP =====

export const rateLimit = (config: PipelineConfig) =>
  (provider: Provider) =>
  (request: VideoRequest): TaskEither<Error, Provider> =>
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
  (request: VideoRequest): TaskEither<Error, Provider> =>
    async (): Promise<Either<Error, Provider>> => {
      // Simple implementation - in real scenario would track failures
      // and open circuit breaker when threshold reached
      const failures = 0 // Track failures externally
      const threshold = config.circuitBreaker?.failureThreshold || 5

      if (failures >= threshold) {
        return left(new Error(`Circuit breaker open for provider ${provider.name}`))
      }

      return right(provider)
    }

// ===== TIMEOUT STEP =====

export const applyTimeout = (config: PipelineConfig) =>
  (provider: Provider) =>
  (request: VideoRequest): TaskEither<Error, Provider> =>
    async (): Promise<Either<Error, Provider>> => {
      // Timeout is handled in the provider itself via AbortSignal
      // This step could add additional timeout logic
      return right(provider)
    }

// ===== CACHE CHECK STEP =====

export const checkCache = (cache: Cache<VideoResult>) =>
  (request: VideoRequest): TaskEither<Error, VideoRequest | { fromCache: true; result: VideoResult }> =>
    async (): Promise<Either<Error, VideoRequest | { fromCache: true; result: VideoResult }>> => {
      const cacheKey = `video:${request.model}:${request.prompt}:${request.duration}:${request.aspectRatio}`
      const cached = cache.get(cacheKey)

      if (cached) {
        return right({ fromCache: true, result: cached })
      }

      return right(request)
    }

// ===== EXECUTION STEP =====

export const executeGeneration = (provider: Provider) =>
  (request: VideoRequest): TaskEither<Error, VideoResult> =>
    provider.generateVideo(request)

// ===== CACHE SAVE STEP =====

export const saveToCache = (cache: Cache<VideoResult>) =>
  (request: VideoRequest) =>
  (result: VideoResult): TaskEither<Error, VideoResult> =>
    async (): Promise<Either<Error, VideoResult>> => {
      const cacheKey = `video:${request.model}:${request.prompt}:${request.duration}:${request.aspectRatio}`
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
  (result: Either<Error, VideoResult>): Either<Error, VideoResult> => {
    const latency = Date.now() - startTime
    const success = result._tag === 'Right'

    // Record metrics (could send to monitoring system)
    console.log(`[Metrics] Provider: ${provider.name}, Latency: ${latency}ms, Success: ${success}`)

    return result
  }

// ===== PIPELINE COMPOSITION =====

export const createVideoPipeline = (
  registry: ProviderRegistry,
  cache: Cache<VideoResult>,
  config: PipelineConfig
): VideoPipeline =>
  (request: VideoRequest): TaskEither<Error, VideoResult> =>
    async (): Promise<Either<Error, VideoResult>> => {
      const startTime = Date.now()

      try {
        const pipeline = pipe(
          validateInput,
          tapTask(() => console.log(`[Pipeline] Starting video generation for request:`, {
            model: request.model,
            duration: request.duration,
            aspectRatio: request.aspectRatio
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
            )(input as VideoRequest)
          }),
          tapTask((result) => {
            if (result._tag === 'Right') {
              console.log(`[Pipeline] Video generation completed:`, {
                provider: result.value.provider,
                taskId: result.value.taskId,
                videoUrl: result.value.videoUrl
              })
            }
          }),
          map(recordMetrics({ name: 'unknown' })(startTime)),
          map(handleErrors('video generation'))
        )

        const result = await pipeline(request)
        return result
      } catch (error) {
        const errorResult = left(error instanceof Error ? error : new Error(String(error)))
        const handled = handleErrors('video generation')(errorResult)
        return Promise.resolve(handled)
      }
    }

// ===== PIPELINE COMPOSITION WITH ERROR HANDLING =====

export const createVideoPipelineWithErrorHandling = (
  registry: ProviderRegistry,
  cache: Cache<VideoResult>,
  config: PipelineConfig,
  fallbackProviders: Provider[]
): VideoPipeline =>
  async (request: VideoRequest): Promise<Either<Error, VideoResult>> => {
    const primaryPipeline = createVideoPipeline(registry, cache, config)

    try {
      const result = await primaryPipeline(request)()

      if (result._tag === 'Right') {
        return result
      }

      // Primary failed, try fallback providers
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
  createVideoPipeline,
  createVideoPipelineWithErrorHandling,
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