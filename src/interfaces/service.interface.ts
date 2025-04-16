import { ModeEnum } from './modes'

export type ServiceType =
  | 'TextToImage'
  | 'TextToVideo'
  | 'ImageToVideo'
  | 'TextToSpeech'
  | 'SpeechToText'
  | 'Translation'
  | 'TopUpBalance'
  | 'Subscription'
  | 'Other'

export interface ServiceConfig {
  name: string
  type: ServiceType
  description: string
  baseCost: number
  enabled: boolean
  metadata: Record<string, any>
}

export interface ServiceUsageStats {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  lastUsed: string
  serviceType: ModeEnum
}

export interface ServiceValidationResult {
  isValid: boolean
  errors: string[]
}

export interface ServiceAccessResult {
  hasAccess: boolean
  reason?: string
  cost?: number
}

export interface ServiceMetadata {
  maxTokens?: number
  maxDuration?: number
  maxImages?: number
  languages?: string[]
  formats?: string[]
  quality?: string[]
  models?: string[]
}

export interface ServicePricing {
  baseCost: number
  discountPercent?: number
  minimumCost?: number
  maximumCost?: number
}

export const SERVICE_ERROR_MESSAGES = {
  SERVICE_DISABLED: 'This service is currently disabled',
  INVALID_CONFIG: 'Invalid service configuration',
  USAGE_LIMIT_EXCEEDED: 'Service usage limit exceeded',
  INSUFFICIENT_CREDITS: 'Insufficient credits for this service',
} as const
