/**
 * Replicate Provider - Functional Adapter
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
  ProviderConfig
} from '../../../core/functional/types/media.types'
import type {
  Provider,
  HealthStatus,
  Balance,
  RateLimit,
  HealthCheck,
  GetBalance,
  GenerateVideo,
  GenerateImage,
  GenerateAudio,
  PerformFaceSwap,
  ProviderError,
  createProviderError
} from './types'

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
      'Authorization': `Token ${config.apiKey}`
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
    version: request.model,
    input: {
      prompt: request.prompt,
      duration: request.duration,
      aspect_ratio: request.aspectRatio,
      image_url: request.imageUrl,
      metadata: request.metadata
    }
  }
  return payload
}

const handleVideoResponse = (data: any): VideoResult => ({
  videoUrl: data.output?.video_url || data.output?.[0] || '',
  taskId: data.id,
  provider: 'replicate' as const,
  duration: data.input?.duration || 5,
  metadata: data.metadata || {}
})

export const generateVideo = (config: ProviderConfig): GenerateVideo =>
  async (request: VideoRequest): Promise<Either<Error, VideoResult>> => {
    const http = createHttpClient(config)

    try {
      const payload = buildVideoPayload(request)
      const response = await http.post('/v1/predictions', payload)

      return right(handleVideoResponse(response))
    } catch (error) {
      const providerError = createProviderError(
        'replicate',
        'generateVideo',
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      )
      return left(providerError)
    }
  }

// ===== IMAGE GENERATION =====

const buildImagePayload = (request: ImageRequest) => {
  const payload = {
    version: request.model,
    input: {
      prompt: request.prompt,
      width: request.width,
      height: request.height,
      num_images: request.numImages || 1,
      style: request.style,
      image_url: request.imageUrl,
      metadata: request.metadata
    }
  }
  return payload
}

const handleImageResponse = (data: any): ImageResult => ({
  imageUrl: data.output?.[0] || data.output,
  taskId: data.id,
  provider: 'replicate' as const,
  width: data.input?.width || 512,
  height: data.input?.height || 512,
  metadata: data.metadata || {}
})

export const generateImage = (config: ProviderConfig): GenerateImage =>
  async (request: ImageRequest): Promise<Either<Error, ImageResult>> => {
    const http = createHttpClient(config)

    try {
      const payload = buildImagePayload(request)
      const response = await http.post('/v1/predictions', payload)

      return right(handleImageResponse(response))
    } catch (error) {
      const providerError = createProviderError(
        'replicate',
        'generateImage',
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      )
      return left(providerError)
    }
  }

// ===== AUDIO GENERATION =====

const buildAudioPayload = (request: AudioRequest) => {
  const payload = {
    version: request.model,
    input: {
      text: request.prompt,
      voice_id: request.voice_id,
      duration: request.duration,
      language: request.language,
      metadata: request.metadata
    }
  }
  return payload
}

const handleAudioResponse = (data: any): AudioResult => ({
  audioUrl: data.output?.audio_url || data.output,
  taskId: data.id,
  provider: 'replicate' as const,
  duration: data.input?.duration || 5,
  metadata: data.metadata || {}
})

export const generateAudio = (config: ProviderConfig): GenerateAudio =>
  async (request: AudioRequest): Promise<Either<Error, AudioResult>> => {
    const http = createHttpClient(config)

    try {
      const payload = buildAudioPayload(request)
      const response = await http.post('/v1/predictions', payload)

      return right(handleAudioResponse(response))
    } catch (error) {
      const providerError = createProviderError(
        'replicate',
        'generateAudio',
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      )
      return left(providerError)
    }
  }

// ===== FACE SWAP =====

const buildFaceSwapPayload = (request: FaceSwapRequest) => {
  const payload = {
    version: 'face-swap-model-version',
    input: {
      target_image_url: request.targetImageUrl,
      swap_image_url: request.swapImageUrl,
      metadata: request.metadata
    }
  }
  return payload
}

const handleFaceSwapResponse = (data: any): FaceSwapResult => ({
  imageUrl: data.output?.[0] || data.output,
  taskId: data.id,
  provider: 'replicate' as const,
  metadata: data.metadata || {}
})

export const performFaceSwap = (config: ProviderConfig): PerformFaceSwap =>
  async (request: FaceSwapRequest): Promise<Either<Error, FaceSwapResult>> => {
    const http = createHttpClient(config)

    try {
      const payload = buildFaceSwapPayload(request)
      const response = await http.post('/v1/predictions', payload)

      return right(handleFaceSwapResponse(response))
    } catch (error) {
      const providerError = createProviderError(
        'replicate',
        'performFaceSwap',
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      )
      return left(providerError)
    }
  }

// ===== HEALTH CHECK =====

export const healthCheck = (config: ProviderConfig): HealthCheck =>
  async (): Promise<Either<Error, HealthStatus>> => {
    const http = createHttpClient(config)

    try {
      const start = Date.now()
      const response = await http.get('/v1/account')
      const latency = Date.now() - start

      const health: HealthStatus = {
        status: response ? 'healthy' : 'unhealthy',
        latency,
        uptime: response?.usage?.uptime || 0,
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
  }

// ===== BALANCE CHECK =====

export const getBalance = (config: ProviderConfig): GetBalance =>
  async (): Promise<Either<Error, Balance>> => {
    const http = createHttpClient(config)

    try {
      const response = await http.get('/v1/account')

      const balance: Balance = {
        currency: 'usd',
        available: response?.billing?.balance || 0,
        reserved: response?.billing?.credits_used || 0,
        lastUpdated: Date.now()
      }

      return right(balance)
    } catch (error) {
      return left(error instanceof Error ? error : new Error('Balance check failed'))
    }
  }

// ===== RATE LIMITER =====

export const rateLimit = (config: ProviderConfig): RateLimit =>
  async (request: any): Promise<Either<Error, void>> => {
    const rateLimiter = (config.rateLimit?.requestsPerMinute || 60)
    const key = `${config.name}-${request.userId}`

    return right(undefined)
  }

// ===== PROVIDER CREATION =====

export const createReplicateProvider = (config: ProviderConfig): Provider => {
  const validatedConfig = validateConfig(config)

  if (validatedConfig._tag === 'Left') {
    throw validatedConfig.value
  }

  const validated = validatedConfig.value

  return {
    name: 'replicate',
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

export default createReplicateProvider
