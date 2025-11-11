/**
 * Fal Provider - Functional Adapter
 * 100% функциональный стиль, без классов
 */

import { pipe } from '../../../core/functional/utils/composition'
import { TaskEither, Either, left, right } from '../../../core/functional/utils/result'
import {
  VideoRequest,
  VideoResult,
  ImageRequest,
  ImageResult,
  AudioRequest,
  AudioResult,
  FaceSwapRequest,
  FaceSwapResult,
  ProviderConfig,
  HealthStatus,
  Balance
} from '../../../core/functional/types/media.types'
import type {
  Provider,
  RateLimit,
  HealthCheck,
  GetBalance,
  GenerateVideo,
  GenerateImage,
  GenerateAudio,
  PerformFaceSwap,
  ProviderError
} from './types'
import { createProviderError } from './types'

// ===== CONFIG VALIDATION =====

const validateConfig = (config: ProviderConfig): Either<Error, ProviderConfig> => {
  if (!config.apiKey) {
    return left(new Error('API key is required'))
  }
  if (!config.baseUrl) {
    return left(new Error('Base URL is required'))
  }
  if (!config.name) {
    return left(new Error('Name is required'))
  }
  return right(config)
}

// ===== HTTP CLIENT =====

const createHttpClient = (config: ProviderConfig) => {
  const request = async (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: any
  ): Promise<any> => {
    const url = `${config.baseUrl}${endpoint}`
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Key ${config.apiKey}`
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(config.timeout || 30000)
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }

  const get = (endpoint: string) => request('GET', endpoint)
  const post = (endpoint: string, body?: any) => request('POST', endpoint, body)
  const put = (endpoint: string, body?: any) => request('PUT', endpoint, body)
  const del = (endpoint: string) => request('DELETE', endpoint)

  return { get, post, put, delete: del }
}

// ===== VIDEO GENERATION =====

const buildVideoPayload = (request: VideoRequest) => {
  const payload = {
    model: request.model,
    prompt: request.prompt,
    duration: request.duration,
    aspect_ratio: request.aspectRatio,
    image_url: request.imageUrl,
    metadata: request.metadata
  }
  return payload
}

const handleVideoResponse = (data: any, request: VideoRequest, providerName: any): VideoResult => ({
  videoUrl: data.video_url || data.output?.video_url || '',
  taskId: data.request_id || data.id,
  provider: providerName,
  duration: data.duration || request.duration,
  metadata: data.metadata || {},
  cost: data.cost || { usd: 0, stars: 0 }
})

export const generateVideo = (config: ProviderConfig): GenerateVideo =>
  (request: VideoRequest) => () => {
    const http = createHttpClient(config)

    return (async (): Promise<Either<Error, VideoResult>> => {
      try {
        const payload = buildVideoPayload(request)
        const response = await http.post('/v1/video/generation', payload)

        return right(handleVideoResponse(response, request, config.name))
      } catch (error) {
        const providerError = createProviderError(
          'fal',
          'generateVideo',
          error instanceof Error ? error.message : 'Unknown error',
          error instanceof Error ? error : undefined
        )
        return left(providerError)
      }
    })()
  }

// ===== IMAGE GENERATION =====

const buildImagePayload = (request: ImageRequest) => {
  const payload = {
    model: request.model,
    prompt: request.prompt,
    width: request.width,
    height: request.height,
    num_images: request.numImages || 1,
    style: request.style,
    image_url: request.imageUrl,
    metadata: request.metadata
  }
  return payload
}

const handleImageResponse = (data: any, request: ImageRequest, providerName: any): ImageResult => ({
  imageUrl: data.image_url || data.output?.image_url || '',
  taskId: data.request_id || data.id,
  provider: providerName,
  width: data.width || request.width || 512,
  height: data.height || request.height || 512,
  metadata: data.metadata || {}
})

export const generateImage = (config: ProviderConfig): GenerateImage =>
  (request: ImageRequest) => () => {
    const http = createHttpClient(config)

    return (async (): Promise<Either<Error, ImageResult>> => {
      try {
        const payload = buildImagePayload(request)
        const response = await http.post('/v1/image/generation', payload)

        return right(handleImageResponse(response, request, config.name))
      } catch (error) {
        const providerError = createProviderError(
          'fal',
          'generateImage',
          error instanceof Error ? error.message : 'Unknown error',
          error instanceof Error ? error : undefined
        )
        return left(providerError)
      }
    })()
  }

// ===== AUDIO GENERATION =====

const buildAudioPayload = (request: AudioRequest) => {
  const payload = {
    model: request.model,
    text: request.prompt,
    voice_id: request.voice_id,
    duration: request.duration,
    language: request.language,
    metadata: request.metadata
  }
  return payload
}

const handleAudioResponse = (data: any, request: AudioRequest, providerName: any): AudioResult => ({
  audioUrl: data.audio_url || data.output?.audio_url || '',
  taskId: data.request_id || data.id,
  provider: providerName,
  duration: data.duration || request.duration || 5,
  metadata: data.metadata || {}
})

export const generateAudio = (config: ProviderConfig): GenerateAudio =>
  (request: AudioRequest) => () => {
    const http = createHttpClient(config)

    return (async (): Promise<Either<Error, AudioResult>> => {
      try {
        const payload = buildAudioPayload(request)
        const response = await http.post('/v1/audio/generation', payload)

        return right(handleAudioResponse(response, request, config.name))
      } catch (error) {
        const providerError = createProviderError(
          'fal',
          'generateAudio',
          error instanceof Error ? error.message : 'Unknown error',
          error instanceof Error ? error : undefined
        )
        return left(providerError)
      }
    })()
  }

// ===== FACE SWAP =====

const buildFaceSwapPayload = (request: FaceSwapRequest) => {
  const payload = {
    target_image_url: request.targetImageUrl,
    swap_image_url: request.swapImageUrl,
    metadata: request.metadata
  }
  return payload
}

const handleFaceSwapResponse = (data: any, providerName: any): FaceSwapResult => ({
  imageUrl: data.image_url || data.output?.image_url || '',
  taskId: data.request_id || data.id,
  provider: providerName,
  metadata: data.metadata || {}
})

export const performFaceSwap = (config: ProviderConfig): PerformFaceSwap =>
  (request: FaceSwapRequest) => () => {
    const http = createHttpClient(config)

    return (async (): Promise<Either<Error, FaceSwapResult>> => {
      try {
        const payload = buildFaceSwapPayload(request)
        const response = await http.post('/v1/face-swap', payload)

        return right(handleFaceSwapResponse(response, config.name))
      } catch (error) {
        const providerError = createProviderError(
          'fal',
          'performFaceSwap',
          error instanceof Error ? error.message : 'Unknown error',
          error instanceof Error ? error : undefined
        )
        return left(providerError)
      }
    })()
  }

// ===== HEALTH CHECK =====

export const healthCheck = (config: ProviderConfig): HealthCheck =>
  () => () => {
    const http = createHttpClient(config)

    return (async (): Promise<Either<Error, HealthStatus>> => {
      try {
        const start = Date.now()
        const response = await http.get('/v1/status')
        const latency = Date.now() - start

        const health: HealthStatus = {
          status: response?.status === 'ok' ? 'healthy' : 'unhealthy',
          latency,
          uptime: response?.uptime || 0,
          lastCheck: Date.now()
        }

        return right(health)
      } catch (error) {
        const health: HealthStatus = {
          status: 'unhealthy',
          latency: config.timeout || 30000,
          uptime: 0,
          lastCheck: Date.now()
        }
        return left(error instanceof Error ? error : new Error('Health check failed'))
      }
    })()
  }

// ===== BALANCE CHECK =====

export const getBalance = (config: ProviderConfig): GetBalance =>
  () => () => {
    const http = createHttpClient(config)

    return (async (): Promise<Either<Error, Balance>> => {
      try {
        const response = await http.get('/v1/account/balance')

        const balance: Balance = {
          currency: 'usd',
          available: response?.balance || 0,
          reserved: response?.reserved || 0,
          lastUpdated: Date.now()
        }

        return right(balance)
      } catch (error) {
        return left(error instanceof Error ? error : new Error('Balance check failed'))
      }
    })()
  }

// ===== RATE LIMITER =====

export const rateLimit = (config: ProviderConfig): RateLimit =>
  (request: any) => () => {
    const rateLimiter = (config.rateLimit?.requestsPerMinute || 60)
    const key = `${config.name}-${request.userId}`

    return Promise.resolve(right(undefined))
  }

// ===== PROVIDER CREATION =====

export const createFalProvider = (config: ProviderConfig): Provider => {
  const validatedConfig = validateConfig(config)

  if (validatedConfig._tag === 'Left') {
    throw validatedConfig.left
  }

  const validated = validatedConfig.right

  return {
    name: 'fal',
    config: validated,
    generateVideo: generateVideo(validated),
    generateImage: generateImage(validated),
    generateAudio: generateAudio(validated),
    performFaceSwap: performFaceSwap(validated),
    healthCheck: healthCheck(validated),
    getBalance: getBalance(validated),
    rateLimit: rateLimit(validated)
  }
}

// ===== DEFAULT EXPORT =====

export default createFalProvider
