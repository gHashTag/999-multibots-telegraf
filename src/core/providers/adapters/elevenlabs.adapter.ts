/**
 * ElevenLabs Provider - Functional Adapter
 * 100% функциональный стиль, без классов
 */

import { pipe } from '../../../core/functional/utils/composition'
import {
  TaskEither,
  Either,
  left,
  right,
} from '../../../core/functional/utils/result'
import {
  AudioRequest,
  AudioResult,
  ProviderConfig,
  HealthStatus,
  Balance,
  ProviderName,
} from '../../../core/functional/types/media.types'
import type {
  Provider,
  RateLimit,
  HealthCheck,
  GetBalance,
  GenerateAudio,
  ProviderError,
} from './types'
import { createProviderError } from './types'

// ===== CONFIG VALIDATION =====

const validateConfig = (
  config: ProviderConfig
): Either<Error, ProviderConfig> => {
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
      'xi-api-key': config.apiKey,
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(config.timeout || 30000),
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

// ===== AUDIO GENERATION =====

const buildAudioPayload = (request: AudioRequest) => {
  const payload = {
    text: request.prompt,
    model_id: request.model || 'eleven_monolingual_v1',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.5,
      style: 0.0,
      use_speaker_boost: true,
    },
  }

  if (request.voice_id) {
    Object.assign(payload, { voice_id: request.voice_id })
  }

  return payload
}

const handleAudioResponse =
  (providerName: ProviderName) =>
  (request: AudioRequest) =>
  (data: any): AudioResult => ({
    audioUrl: data.audio_url || '',
    taskId: data.task_id || data.id,
    provider: providerName,
    duration: request.duration || 5,
    metadata: data.metadata || {},
  })

export const generateAudio =
  (config: ProviderConfig): GenerateAudio =>
  (request: AudioRequest): TaskEither<Error, AudioResult> =>
  async () => {
    const http = createHttpClient(config)

    try {
      const payload = buildAudioPayload(request)
      const response = await http.post('/v1/text-to-speech', payload)

      return right(
        handleAudioResponse('elevenlabs' as ProviderName)(request)(response)
      )
    } catch (error) {
      const providerError = createProviderError(
        'elevenlabs',
        'generateAudio',
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      )
      return left(providerError)
    }
  }

// ===== VOICES ENDPOINT =====

export const getVoices =
  (config: ProviderConfig): TaskEither<Error, any> =>
  async () => {
    const http = createHttpClient(config)

    try {
      const response = await http.get('/v1/voices')
      return right(response)
    } catch (error) {
      return left(
        error instanceof Error ? error : new Error('Failed to get voices')
      )
    }
  }

// ===== HEALTH CHECK =====

export const healthCheck =
  (config: ProviderConfig): HealthCheck =>
  (): TaskEither<Error, HealthStatus> =>
  async () => {
    const http = createHttpClient(config)

    try {
      const start = Date.now()
      const response = await http.get('/v1/voices')
      const latency = Date.now() - start

      const health: HealthStatus = {
        status: response ? 'healthy' : 'unhealthy',
        latency,
        uptime: 0,
        lastCheck: Date.now(),
      }

      return right(health)
    } catch (error) {
      const health: HealthStatus = {
        status: 'unhealthy',
        latency: config.timeout || 30000,
        uptime: 0,
        lastCheck: Date.now(),
      }
      return left(
        error instanceof Error ? error : new Error('Health check failed')
      )
    }
  }

// ===== BALANCE CHECK =====

export const getBalance =
  (config: ProviderConfig): GetBalance =>
  (): TaskEither<Error, Balance> =>
  async () => {
    const http = createHttpClient(config)

    try {
      const response = await http.get('/v1/user')

      const balance: Balance = {
        currency: 'usd',
        available: response?.subscription?.character_count || 0,
        reserved: 0,
        lastUpdated: Date.now(),
      }

      return right(balance)
    } catch (error) {
      return left(
        error instanceof Error ? error : new Error('Balance check failed')
      )
    }
  }

// ===== RATE LIMITER =====

export const rateLimit =
  (config: ProviderConfig): RateLimit =>
  (request: any): TaskEither<Error, void> =>
  async () => {
    const rateLimiter = config.rateLimit?.requestsPerMinute || 60
    const key = `${config.name}-${request.userId}`

    return right(undefined)
  }

// ===== PROVIDER CREATION =====

export const createElevenLabsProvider = (config: ProviderConfig): Provider => {
  const validatedConfig = validateConfig(config)

  if (validatedConfig._tag === 'Left') {
    throw validatedConfig.left
  }

  const validated = validatedConfig.right

  return {
    name: 'elevenlabs',
    config: validated,
    generateVideo: request => async () =>
      left(new Error('ElevenLabs does not support video generation')),
    generateImage: request => async () =>
      left(new Error('ElevenLabs does not support image generation')),
    generateAudio: generateAudio(validated),
    performFaceSwap: request => async () =>
      left(new Error('ElevenLabs does not support face swap')),
    healthCheck: healthCheck(validated),
    getBalance: getBalance(validated),
    rateLimit: rateLimit(validated),
  }
}

// ===== DEFAULT EXPORT =====

export default createElevenLabsProvider
