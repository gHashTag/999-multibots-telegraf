/**
 * Media Orchestrator - Functional Media Generation Orchestrator
 * 100% функциональный стиль, без классов
 */

import { pipe, tap } from '../functional/utils/composition'
import { TaskEither, Either, chain, map, left } from '../functional/utils/result'
import { MediaRequest, MediaResult } from '../functional/types/media.types'
import { ProviderRegistry } from '../providers/registry/provider-registry'
import { createVideoPipeline } from './video/video.pipeline'
import type { PipelineConfig, Cache } from '../functional/types/media.types'

// ===== ORCHESTRATOR INTERFACE =====

export interface MediaOrchestrator {
  generate: (request: MediaRequest) => TaskEither<Error, MediaResult>
  generateVideo: (request: any) => TaskEither<Error, any>
  generateImage: (request: any) => TaskEither<Error, any>
  generateAudio: (request: any) => TaskEither<Error, any>
  performFaceSwap: (request: any) => TaskEither<Error, any>
}

// ===== MEDIA TYPE GUARDS =====

const isVideoRequest = (request: MediaRequest): request is any =>
  'duration' in request && 'aspectRatio' in request

const isImageRequest = (request: MediaRequest): request is any =>
  'width' in request || 'height' in request

const isAudioRequest = (request: MediaRequest): request is any =>
  'voice_id' in request || 'language' in request

const isFaceSwapRequest = (request: MediaRequest): request is any =>
  'targetImageUrl' in request && 'swapImageUrl' in request

// ===== ROUTER FUNCTION =====

const routeToProvider = (
  registry: ProviderRegistry,
  cache: Cache<MediaResult>,
  config: PipelineConfig
) => (request: MediaRequest): TaskEither<Error, MediaResult> => {
  if (isVideoRequest(request)) {
    const videoPipeline = createVideoPipeline(registry, cache as any, config)
    return videoPipeline(request) as TaskEither<Error, MediaResult>
  }

  if (isImageRequest(request)) {
    // TODO: Implement image pipeline
    return async () => Promise.resolve(left(new Error('Image generation not implemented yet')))
  }

  if (isAudioRequest(request)) {
    // TODO: Implement audio pipeline
    return async () => Promise.resolve(left(new Error('Audio generation not implemented yet')))
  }

  if (isFaceSwapRequest(request)) {
    // TODO: Implement face swap pipeline
    return async () => Promise.resolve(left(new Error('Face swap not implemented yet')))
  }

  return async () => Promise.resolve(left(new Error('Unknown media type')))
}

// ===== ORCHESTRATOR CREATION =====

export const createMediaOrchestrator = (
  registry: ProviderRegistry,
  cache: Cache<MediaResult>,
  config: PipelineConfig
): MediaOrchestrator => {
  const router = routeToProvider(registry, cache, config)

  // ===== UNIFIED GENERATE =====

  const generate = (request: MediaRequest): TaskEither<Error, MediaResult> =>
    async (): Promise<Either<Error, MediaResult>> => {
      const startTime = Date.now()

      try {
        console.log('[Orchestrator] Starting media generation:', {
          type: isVideoRequest(request) ? 'video' :
                isImageRequest(request) ? 'image' :
                isAudioRequest(request) ? 'audio' :
                isFaceSwapRequest(request) ? 'face-swap' : 'unknown'
        })

        const result = await router(request)()

        if (result._tag === 'Right') {
          const latency = Date.now() - startTime
          console.log('[Orchestrator] Generation completed:', {
            latency: `${latency}ms`,
            provider: (result.value as any).provider,
            taskId: (result.value as any).taskId
          })
        }

        return result
      } catch (error) {
        console.error('[Orchestrator] Generation failed:', error)
        return left(error instanceof Error ? error : new Error(String(error)))
      }
    }

  // ===== SPECIFIC METHODS =====

  const generateVideo = (request: any): TaskEither<Error, any> =>
    async (): Promise<Either<Error, any>> => {
      if (!isVideoRequest(request)) {
        return left(new Error('Invalid video request'))
      }

      const videoPipeline = createVideoPipeline(registry, cache as any, config)
      return videoPipeline(request)()
    }

  const generateImage = (request: any): TaskEither<Error, any> =>
    async (): Promise<Either<Error, any>> => {
      if (!isImageRequest(request)) {
        return left(new Error('Invalid image request'))
      }
      return left(new Error('Image generation not implemented yet'))
    }

  const generateAudio = (request: any): TaskEither<Error, any> =>
    async (): Promise<Either<Error, any>> => {
      if (!isAudioRequest(request)) {
        return left(new Error('Invalid audio request'))
      }
      return left(new Error('Audio generation not implemented yet'))
    }

  const performFaceSwap = (request: any): TaskEither<Error, any> =>
    async (): Promise<Either<Error, any>> => {
      if (!isFaceSwapRequest(request)) {
        return left(new Error('Invalid face swap request'))
      }
      return left(new Error('Face swap not implemented yet'))
    }

  return {
    generate,
    generateVideo,
    generateImage,
    generateAudio,
    performFaceSwap
  }
}

// ===== HELPER FUNCTIONS =====

export const createDefaultCache = (): Cache<MediaResult> => {
  const store = new Map<string, { value: MediaResult; expires: number }>()

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
    set: (key: string, value: MediaResult) => {
      store.set(key, {
        value,
        expires: Date.now() + 300000 // 5 minutes
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

export const createDefaultConfig = (): PipelineConfig => ({
  maxRetries: 3,
  retryDelay: 1000,
  exponentialBase: 2,
  circuitBreaker: {
    failureThreshold: 5,
    timeout: 30000,
    resetTimeout: 60000
  },
  timeout: 30000,
  cache: {
    ttl: 300000 // 5 minutes
  }
})

// ===== EXPORT ALL =====

export default {
  createMediaOrchestrator,
  createDefaultCache,
  createDefaultConfig,
  isVideoRequest,
  isImageRequest,
  isAudioRequest,
  isFaceSwapRequest
}