/**
 * Media Types - Functional Type System
 * 100% функциональный стиль, без классов
 */

import * as t from 'io-ts'

// ===== BASE TYPES =====

// Branded types for type safety
export const Brand = <T, B extends string>(id: B) =>
  <C extends t.Mixed>(codec: C) =>
    t.brand(codec, (n): n is t.TypeOf<C> & { readonly [K in B]: B } => true, id)

// ===== MEDIA TYPES =====

export type MediaType = 'video' | 'image' | 'audio' | 'face-swap'

// ===== BRANDED TYPES =====

export const ModelId = Brand('ModelId')(t.string)
export type ModelId = t.TypeOf<typeof ModelId>

export const ProviderName = Brand('ProviderName')(
  t.union([
    t.literal('kie-ai'),
    t.literal('replicate'),
    t.literal('elevenlabs'),
    t.literal('fal'),
    t.literal('openrouter')
  ])
)
export type ProviderName = t.TypeOf<typeof ProviderName>

export const UserId = Brand('UserId')(t.string)
export type UserId = t.TypeOf<typeof UserId>

export const TaskId = Brand('TaskId')(t.string)
export type TaskId = t.TypeOf<typeof TaskId>

// ===== VIDEO REQUESTS =====

export const VideoRequest = t.strict({
  prompt: t.string,
  model: ModelId,
  duration: t.number,
  aspectRatio: t.union([
    t.literal('16:9'),
    t.literal('9:16'),
    t.literal('1:1')
  ]),
  userId: UserId,
  imageUrl: t.union([t.string, t.undefined]),
  metadata: t.union([
    t.strict({
      style: t.union([t.string, t.undefined]),
      quality: t.union([t.literal('low'), t.literal('medium'), t.literal('high'), t.undefined]),
      seed: t.union([t.number, t.undefined])
    }),
    t.undefined
  ])
})

export type VideoRequest = t.TypeOf<typeof VideoRequest>

export const VideoResult = t.strict({
  videoUrl: t.string,
  taskId: TaskId,
  provider: ProviderName,
  duration: t.number,
  metadata: t.record(t.string, t.unknown),
  cost: t.union([
    t.strict({
      usd: t.number,
      stars: t.number
    }),
    t.undefined
  ])
})

export type VideoResult = t.TypeOf<typeof VideoResult>

// ===== IMAGE REQUESTS =====

export const ImageRequest = t.strict({
  prompt: t.string,
  model: ModelId,
  width: t.union([t.number, t.undefined]),
  height: t.union([t.number, t.undefined]),
  numImages: t.union([t.number, t.undefined]),
  style: t.union([t.string, t.undefined]),
  imageUrl: t.union([t.string, t.undefined]),
  userId: UserId,
  metadata: t.union([
    t.strict({
      artistic_style: t.union([t.string, t.undefined]),
      negative_prompt: t.union([t.string, t.undefined])
    }),
    t.undefined
  ])
})

export type ImageRequest = t.TypeOf<typeof ImageRequest>

export const ImageResult = t.strict({
  imageUrl: t.string,
  taskId: TaskId,
  provider: ProviderName,
  width: t.number,
  height: t.number,
  metadata: t.record(t.string, t.unknown)
})

export type ImageResult = t.TypeOf<typeof ImageResult>

// ===== AUDIO REQUESTS =====

export const AudioRequest = t.strict({
  prompt: t.string,
  model: ModelId,
  voice_id: t.union([t.string, t.undefined]),
  duration: t.union([t.number, t.undefined]),
  language: t.union([t.string, t.undefined]),
  userId: UserId,
  metadata: t.union([
    t.strict({
      speed: t.union([t.number, t.undefined]),
      clarity: t.union([t.number, t.undefined])
    }),
    t.undefined
  ])
})

export type AudioRequest = t.TypeOf<typeof AudioRequest>

export const AudioResult = t.strict({
  audioUrl: t.string,
  taskId: TaskId,
  provider: ProviderName,
  duration: t.number,
  metadata: t.record(t.string, t.unknown)
})

export type AudioResult = t.TypeOf<typeof AudioResult>

// ===== FACE SWAP REQUESTS =====

export const FaceSwapRequest = t.strict({
  targetImageUrl: t.string,
  swapImageUrl: t.string,
  userId: UserId,
  metadata: t.union([
    t.strict({
      strength: t.union([t.number, t.undefined])
    }),
    t.undefined
  ])
})

export type FaceSwapRequest = t.TypeOf<typeof FaceSwapRequest>

export const FaceSwapResult = t.strict({
  imageUrl: t.string,
  taskId: TaskId,
  provider: ProviderName,
  metadata: t.record(t.string, t.unknown)
})

export type FaceSwapResult = t.TypeOf<typeof FaceSwapResult>

// ===== GENERIC MEDIA REQUEST =====

export const MediaRequest = t.union([VideoRequest, ImageRequest, AudioRequest, FaceSwapRequest])
export type MediaRequest = t.TypeOf<typeof MediaRequest>

export const MediaResult = t.union([VideoResult, ImageResult, AudioResult, FaceSwapResult])
export type MediaResult = t.TypeOf<typeof MediaResult>

// ===== VALIDATION ERRORS =====

export const ValidationError = t.strict({
  message: t.string,
  path: t.array(t.union([t.string, t.number])),
  expected: t.string,
  received: t.unknown
})

export type ValidationError = t.TypeOf<typeof ValidationError>

// ===== PROVIDER CAPABILITIES =====

export const ProviderCapabilities = t.array(t.union([
  t.literal('video'),
  t.literal('image'),
  t.literal('audio'),
  t.literal('face-swap')
]))

export type ProviderCapabilities = t.TypeOf<typeof ProviderCapabilities>

// ===== HEALTH STATUS =====

export const HealthStatus = t.strict({
  status: t.union([t.literal('healthy'), t.literal('degraded'), t.literal('unhealthy')]),
  latency: t.number,
  uptime: t.number,
  lastCheck: t.number
})

export type HealthStatus = t.TypeOf<typeof HealthStatus>

// ===== BALANCE INFO =====

export const Balance = t.strict({
  currency: t.union([t.literal('usd'), t.literal('stars')]),
  available: t.number,
  reserved: t.number,
  lastUpdated: t.number
})

export type Balance = t.TypeOf<typeof Balance>

// ===== PROVIDER CONFIG =====

export const ProviderConfig = t.strict({
  name: ProviderName,
  apiKey: t.string,
  baseUrl: t.string,
  timeout: t.union([t.number, t.undefined]),
  rateLimit: t.union([
    t.strict({
      requestsPerMinute: t.number
    }),
    t.undefined
  ])
})

export type ProviderConfig = t.TypeOf<typeof ProviderConfig>

// ===== PIPELINE CONFIG =====

export const PipelineConfig = t.strict({
  maxRetries: t.number,
  retryDelay: t.number,
  circuitBreaker: t.union([
    t.strict({
      failureThreshold: t.number,
      timeout: t.number,
      resetTimeout: t.number
    }),
    t.undefined
  ]),
  timeout: t.union([t.number, t.undefined]),
  cache: t.union([
    t.strict({
      ttl: t.number
    }),
    t.undefined
  ])
})

export type PipelineConfig = t.TypeOf<typeof PipelineConfig>

// ===== METADATA =====

export const GenerationMetadata = t.record(t.string, t.unknown)
export type GenerationMetadata = t.TypeOf<typeof GenerationMetadata>

// ===== UTILITY TYPES =====

export type MediaTypeFromRequest<T extends MediaRequest> =
  T extends VideoRequest ? 'video' :
  T extends ImageRequest ? 'image' :
  T extends AudioRequest ? 'audio' :
  'face-swap'

export type ResultFromRequest<T extends MediaRequest> =
  T extends VideoRequest ? VideoResult :
  T extends ImageRequest ? ImageResult :
  T extends AudioRequest ? AudioResult :
  FaceSwapResult

// ===== TYPE GUARDS =====

export const isVideoRequest = (req: MediaRequest): req is VideoRequest =>
  VideoRequest.is(req)

export const isImageRequest = (req: MediaRequest): req is ImageRequest =>
  ImageRequest.is(req)

export const isAudioRequest = (req: MediaRequest): req is AudioRequest =>
  AudioRequest.is(req)

export const isFaceSwapRequest = (req: MediaRequest): req is FaceSwapRequest =>
  FaceSwapRequest.is(req)

export const isHealthy = (status: HealthStatus): boolean =>
  status.status === 'healthy'

export const hasBalance = (balance: Balance): boolean =>
  balance.available > 0

// ===== PROVIDER INTERFACE =====

import { Either, TaskEither } from '../utils/result'

export interface Provider<Req extends MediaRequest, Res extends MediaResult> {
  readonly name: ProviderName
  readonly capabilities: ProviderCapabilities

  generate(request: Req): TaskEither<Error, Res>
  healthCheck(): TaskEither<Error, HealthStatus>
  getBalance(): TaskEither<Error, Balance>
}

// ===== PROVIDER REGISTRY =====

export interface ProviderRegistry {
  register<Req extends MediaRequest, Res extends MediaResult>(
    provider: Provider<Req, Res>
  ): void

  get(name: ProviderName): Provider<any, any> | undefined

  getByCapability(capability: MediaType): Provider<any, any>[]

  getAll(): Provider<any, any>[]
}

// ===== CACHE INTERFACE =====

export interface Cache<K = string, V = any> {
  get(key: K): Promise<V | undefined>
  set(key: K, value: V, ttl?: number): Promise<void>
  delete(key: K): Promise<void>
  clear(): Promise<void>
  has(key: K): Promise<boolean>
}

// ===== CIRCUIT BREAKER CONFIG =====

export interface CircuitBreakerConfig {
  failureThreshold: number
  timeout: number
  resetTimeout: number
}