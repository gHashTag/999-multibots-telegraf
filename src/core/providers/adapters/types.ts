/**
 * Provider Types - Functional Provider Interface
 * 100% функциональный стиль, без классов
 */

import { TaskEither } from '../../../core/functional/utils/result'
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
  HealthStatus as MediaHealthStatus,
  Balance as MediaBalance
} from '../../../core/functional/types/media.types'

// Re-export imported types
export type HealthStatus = MediaHealthStatus
export type Balance = MediaBalance

// ===== PROVIDER FUNCTIONS =====

export type GenerateVideo = (request: VideoRequest) => TaskEither<Error, VideoResult>
export type GenerateImage = (request: ImageRequest) => TaskEither<Error, ImageResult>
export type GenerateAudio = (request: AudioRequest) => TaskEither<Error, AudioResult>
export type PerformFaceSwap = (request: FaceSwapRequest) => TaskEither<Error, FaceSwapResult>
export type HealthCheck = () => TaskEither<Error, HealthStatus>
export type GetBalance = () => TaskEither<Error, Balance>
export type RateLimit = (request: any) => TaskEither<Error, void>

// ===== PROVIDER OBJECT =====

export interface Provider {
  name: string
  config: ProviderConfig
  generateVideo: GenerateVideo
  generateImage: GenerateImage
  generateAudio: GenerateAudio
  performFaceSwap: PerformFaceSwap
  healthCheck: HealthCheck
  getBalance: GetBalance
  rateLimit: RateLimit
}

// ===== PROVIDER FACTORY =====

export type ProviderFactory = (config: ProviderConfig) => Provider

// ===== CIRCUIT BREAKER TYPES =====

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  failureThreshold: number
  timeout: number
  resetTimeout: number
}

export type CircuitBreakerConfig = {
  options: CircuitBreakerOptions
  state: CircuitState
  failures: number
  lastFailureTime: number
}

export type WrappedFunction<T extends (...args: any[]) => TaskEither<Error, any>> = (
  ...args: Parameters<T>
) => TaskEither<Error, ReturnType<ReturnType<T> extends Promise<infer R> ? (...args: any) => Promise<R> : never>>

// ===== PROVIDER REGISTRY TYPES =====

export interface ProviderRegistry {
  getProvider: (name: string) => Provider | undefined
  getProvidersByCapability: (capability: string) => Provider[]
  listProviders: () => Provider[]
  healthCheckAll: () => Promise<{ name: string; healthy: boolean }[]>
  getHealthyProviders: (capability: string) => Provider[]
}

// ===== LOAD BALANCER TYPES =====

export type LoadBalancingStrategy = 'round_robin' | 'least_connections' | 'random' | 'weighted'

export interface LoadBalancerOptions {
  strategy: LoadBalancingStrategy
  enabledProviders: string[]
  healthCheckInterval: number
}

export interface LoadBalancer {
  getProvider: (capability: string) => Provider | undefined
  markProviderFailed: (name: string) => void
  markProviderRecovered: (name: string) => void
  getStats: () => { [providerName: string]: { requests: number; failures: number; avgLatency: number } }
}

// ===== RATE LIMITER TYPES =====

export interface RateLimitConfig {
  requestsPerMinute: number
  burst: number
}

export type RateLimiter = (request: any) => TaskEither<Error, void>

// ===== HEALTH MONITOR TYPES =====

export interface HealthMonitor {
  startMonitoring: () => void
  stopMonitoring: () => void
  getProviderHealth: (name: string) => HealthStatus | undefined
  getAllHealth: () => { [name: string]: HealthStatus }
  isProviderHealthy: (name: string) => boolean
}

// ===== CACHE TYPES =====

export interface CacheOptions {
  ttl: number
  maxSize: number
}

export type Cache<T> = {
  get: (key: string) => T | undefined
  set: (key: string, value: T) => void
  delete: (key: string) => void
  clear: () => void
  has: (key: string) => boolean
}

export type CacheKey = string

// ===== RETRY TYPES =====

export interface RetryOptions {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  exponentialBase: number
  jitter: boolean
}

export type RetryStrategy = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions
) => (...args: Parameters<T>) => Promise<ReturnType<T>>

// ===== TIMEOUT TYPES =====

export interface TimeoutOptions {
  timeout: number
}

export type WithTimeout = <T extends (...args: any[]) => TaskEither<Error, any>>(
  fn: T,
  options: TimeoutOptions
) => T

// ===== FALLBACK TYPES =====

export interface FallbackStrategy {
  attempt: (request: any, providers: Provider[]) => TaskEither<Error, any>
}

// ===== PIPELINE TYPES =====

export type PipelineStep<T, R> = (input: T) => TaskEither<Error, R>

export type MediaPipeline = PipelineStep<any, any>

export interface PipelineOptions {
  timeout: number
  retries: number
  circuitBreaker: CircuitBreakerOptions
  rateLimiter: RateLimitConfig
  cache: CacheOptions
}

// ===== ERROR TYPES =====

export interface ProviderError extends Error {
  provider: string
  operation: string
  cause?: Error
}

export const createProviderError = (
  provider: string,
  operation: string,
  message: string,
  cause?: Error
): ProviderError => {
  const error = new Error(`[${provider}] ${operation}: ${message}`) as ProviderError
  error.provider = provider
  error.operation = operation
  error.cause = cause
  return error
}

// ===== VALIDATION TYPES =====

export type ValidationResult<T> = TaskEither<Error, T>

// ===== MONITORING TYPES =====

export interface Metrics {
  requests: number
  successes: number
  failures: number
  averageLatency: number
  lastRequest: number
  lastSuccess: number
  lastFailure: number
}

export type MetricsCollector = {
  recordRequest: (provider: string, latency: number, success: boolean) => void
  getMetrics: (provider: string) => Metrics | undefined
  getAllMetrics: () => { [provider: string]: Metrics }
  reset: (provider: string) => void
  resetAll: () => void
}

// ===== CONFIG VALIDATION TYPES =====

export type ConfigValidator = (config: ProviderConfig) => ValidationResult<ProviderConfig>

// ===== UTILITY TYPES =====

export type ProviderOperation = 'generateVideo' | 'generateImage' | 'generateAudio' | 'performFaceSwap'

export type ProviderStatus = 'active' | 'inactive' | 'degraded' | 'error'

export interface ProviderMetadata {
  displayName: string
  description: string
  version: string
  author: string
  homepage?: string
  documentation?: string
}

// ===== PLUGIN TYPES =====

export interface ProviderPlugin {
  name: string
  version: string
  init: (config: ProviderConfig) => Provider
  destroy: (provider: Provider) => Promise<void>
}

// ===== EXPORT ALL =====

export default {
  GenerateVideo,
  GenerateImage,
  GenerateAudio,
  PerformFaceSwap,
  HealthCheck,
  GetBalance,
  RateLimit,
  Provider,
  ProviderFactory,
  CircuitState,
  CircuitBreakerOptions,
  CircuitBreakerConfig,
  WrappedFunction,
  ProviderRegistry,
  LoadBalancingStrategy,
  LoadBalancerOptions,
  LoadBalancer,
  RateLimitConfig,
  RateLimiter,
  HealthMonitor,
  CacheOptions,
  Cache,
  CacheKey,
  RetryOptions,
  RetryStrategy,
  TimeoutOptions,
  WithTimeout,
  FallbackStrategy,
  PipelineStep,
  MediaPipeline,
  PipelineOptions,
  ProviderError,
  createProviderError,
  ValidationResult,
  Metrics,
  MetricsCollector,
  ConfigValidator,
  ProviderOperation,
  ProviderStatus,
  ProviderMetadata,
  ProviderPlugin
}