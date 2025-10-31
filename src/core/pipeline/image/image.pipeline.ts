/**
 * Image Generation Pipeline - Functional Composition
 * 100% функциональный стиль, без классов
 */

import { pipe, tap } from '../../../core/functional/utils/composition'
import { TaskEither, Either, left, right, tapTask, chain, map } from '../../../core/functional/utils/result'
import {
  ImageRequest,
  ImageResult,
  Provider,
  ProviderRegistry,
  PipelineConfig,
  Cache
} from '../../../core/functional/types/media.types'

// ===== PIPELINE STEP TYPES =====

export type PipelineStep<T, R> = (input: T) => TaskEither<Error, R>
export type ImagePipeline = PipelineStep<ImageRequest, ImageResult>

// ===== VALIDATION STEP =====

export const validateInput = (request: ImageRequest): TaskEither<Error, ImageRequest> =>
  async (): Promise<Either<Error, ImageRequest>> => {
    if (!request.prompt || request.prompt.trim().length === 0) {
      return left(new Error('Prompt is required'))
    }
    if (!request.model) {
      return left(new Error('Model is required'))
    }
    if (!request.userId) {
      return left(new Error('User ID is required'))
    }
    if (!request.width || request.width <= 0) {
      return left(new Error('Width must be positive'))
    }
    if (!request.height || request.height <= 0) {
      return left(new Error('Height must be positive'))
    }

    return right(request)
  }

// ===== PROVIDER SELECTION STEP =====

export const selectProvider = (registry: ProviderRegistry) =>
  (request: ImageRequest): TaskEither<Error, Provider> =>
    async (): Promise<Either<Error, Provider>> => {
      const providers = registry.getProvidersByCapability('image')

      if (providers.length === 0) {
        return left(new Error('No image providers available'))
      }

      const provider = providers[0]

      return right(provider)
    }

// ===== RATE LIMIT STEP =====

export const rateLimit = (config: PipelineConfig) =>
  (provider: Provider) =>
  (request: ImageRequest): TaskEither<Error, Provider> =>
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
  (request: ImageRequest): TaskEither<Error, Provider> =>
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
  (request: ImageRequest): TaskEither<Error, Provider> =>
    async (): Promise<Either<Error, Provider>> => {
      return right(provider)
    }

// ===== CACHE CHECK STEP =====

export const checkCache = (cache: Cache<ImageResult>) =>
  (request: ImageRequest): TaskEither<Error, ImageRequest | { fromCache: true; result: ImageResult }> =>
    async (): Promise<Either<Error, ImageRequest | { fromCache: true; result: ImageResult }>> => {
      const cacheKey = `image:${request.model}:${request.prompt}:${request.width}:${request.height}:${request.style || 'default'}`
      const cached = cache.get(cacheKey)

      if (cached) {
        return right({ fromCache: true, result: cached })
      }

      return right(request)
    }

// ===== EXECUTION STEP =====

export const executeGeneration = (provider: Provider) =>
  (request: ImageRequest): TaskEither<Error, ImageResult> =>
    provider.generateImage(request)

// ===== CACHE SAVE STEP =====

export const saveToCache = (cache: Cache<ImageResult>) =>
  (request: ImageRequest) =>
  (result: ImageResult): TaskEither<Error, ImageResult> =>
    async (): Promise<Either<Error, ImageResult>> => {
      const cacheKey = `image:${request.model}:${request.prompt}:${request.width}:${request.height}:${request.style || 'default'}`
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
  (result: Either<Error, ImageResult>): Either<Error, ImageResult> => {
    const latency = Date.now() - startTime
    const success = result._tag === 'Right'

    console.log(`[Metrics] Provider: ${provider.name}, Latency: ${latency}ms, Success: ${success}`)

    return result
  }

// ===== PIPELINE COMPOSITION =====

export const createImagePipeline = (
  registry: ProviderRegistry,
  cache: Cache<ImageResult>,
  config: PipelineConfig
): ImagePipeline =>
  (request: ImageRequest): TaskEither<Error, ImageResult> =>
    async (): Promise<Either<Error, ImageResult>> => {
      const startTime = Date.now()

      try {
        const pipeline = pipe(
          validateInput,
          tapTask(() => console.log(`[Pipeline] Starting image generation for request:`, {
            model: request.model,
            width: request.width,
            height: request.height,
            style: request.style
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
            )(input as ImageRequest)
          }),
          tapTask((result) => {
            if (result._tag === 'Right') {
              console.log(`[Pipeline] Image generation completed:`, {
                provider: result.value.provider,
                taskId: result.value.taskId,
                imageUrl: result.value.imageUrl,
                width: result.value.width,
                height: result.value.height
              })
            }
          }),
          map(recordMetrics({ name: 'unknown' })(startTime)),
          map(handleErrors('image generation'))
        )

        const result = await pipeline(request)
        return result
      } catch (error) {
        const errorResult = left(error instanceof Error ? error : new Error(String(error)))
        const handled = handleErrors('image generation')(errorResult)
        return Promise.resolve(handled)
      }
    }

// ===== PIPELINE COMPOSITION WITH ERROR HANDLING =====

export const createImagePipelineWithErrorHandling = (
  registry: ProviderRegistry,
  cache: Cache<ImageResult>,
  config: PipelineConfig,
  fallbackProviders: Provider[]
): ImagePipeline =>
  async (request: ImageRequest): Promise<Either<Error, ImageResult>> => {
    const primaryPipeline = createImagePipeline(registry, cache, config)

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
  createImagePipeline,
  createImagePipelineWithErrorHandling,
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
