import {
  ServiceType,
  ServiceConfig,
  ServiceUsageStats,
  ServiceValidationResult,
  ServiceAccessResult,
  ServiceMetadata,
} from '../interfaces/service.interface'
import { supabase } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
// Normalize transaction type to lowercase
export const normalizeTransactionType = (type: string): string => {
  return type.toLowerCase()
}

// Validate if service type is valid
export const validateServiceType = (type: string): type is ServiceType => {
  const validTypes: ServiceType[] = [
    'TextToImage',
    'TextToVideo',
    'ImageToVideo',
    'TextToSpeech',
    'SpeechToText',
    'Translation',
    'TopUpBalance',
    'Subscription',
    'Other',
  ]
  return validTypes.includes(type as ServiceType)
}

// Check if service is enabled
export const isServiceEnabled = (config: ServiceConfig): boolean => {
  return config.enabled
}

/**
 * Получает статистику использования сервиса
 */
export const getServiceUsageStats = async (
  serviceType: ModeEnum
): Promise<ServiceUsageStats> => {
  try {
    // Получаем статистику из базы данных
    const { data, error } = await supabase
      .from('service_usage_stats')
      .select('*')
      .eq('service_type', serviceType)
      .single()

    if (error) {
      throw error
    }

    if (!data) {
      // Если статистики нет, возвращаем начальные значения
      return {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        lastUsed: new Date().toISOString(),
        serviceType,
      }
    }

    return {
      totalRequests: data.total_requests || 0,
      successfulRequests: data.successful_requests || 0,
      failedRequests: data.failed_requests || 0,
      averageResponseTime: data.average_response_time || 0,
      lastUsed: data.last_used || new Date().toISOString(),
      serviceType,
    }
  } catch (error) {
    console.error('Error getting service usage stats:', error)
    // В случае ошибки возвращаем нулевые значения
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastUsed: new Date().toISOString(),
      serviceType,
    }
  }
}

// Validate service access based on user balance and service cost
export const validateServiceAccess = async (
  userBalance: number,
  serviceType: ServiceType,
  config: ServiceConfig
): Promise<ServiceAccessResult> => {
  if (!isServiceEnabled(config)) {
    return {
      hasAccess: false,
      reason: 'Service is currently disabled',
    }
  }

  if (userBalance < config.baseCost) {
    return {
      hasAccess: false,
      reason: 'Insufficient balance',
      cost: config.baseCost,
    }
  }

  return {
    hasAccess: true,
    cost: config.baseCost,
  }
}

// Format service cost
export const formatServiceCost = (cost: number): string => {
  return `${cost.toFixed(2)} stars`
}

// Get service metadata
export const getServiceMetadata = (type: ServiceType): ServiceMetadata => {
  const baseMetadata: ServiceMetadata = {
    maxTokens: 4000,
    maxDuration: 300, // 5 minutes
    maxImages: 4,
    quality: ['standard', 'high', 'premium'],
    models: ['gpt-4', 'gpt-3.5-turbo'],
  }

  switch (type) {
    case 'TextToImage':
      return {
        ...baseMetadata,
        formats: ['png', 'jpg', 'webp'],
        quality: ['standard', 'high', 'premium'],
      }
    case 'TextToVideo':
      return {
        ...baseMetadata,
        formats: ['mp4', 'webm'],
        maxDuration: 60, // 1 minute
      }
    case 'TextToSpeech':
      return {
        ...baseMetadata,
        formats: ['mp3', 'wav'],
        languages: ['en', 'ru', 'es', 'fr', 'de'],
      }
    default:
      return baseMetadata
  }
}

// Validate service parameters
export const validateServiceParameters = (
  type: ServiceType,
  params: Record<string, any>
): ServiceValidationResult => {
  const errors: string[] = []
  const metadata = getServiceMetadata(type)

  switch (type) {
    case 'TextToImage':
      if (!params.prompt) {
        errors.push('Prompt is required')
      }
      if (params.quality && !metadata.quality?.includes(params.quality)) {
        errors.push('Invalid quality value')
      }
      if (params.format && !metadata.formats?.includes(params.format)) {
        errors.push('Invalid format')
      }
      break

    case 'TextToVideo':
      if (!params.prompt) {
        errors.push('Prompt is required')
      }
      if (params.duration && params.duration > metadata.maxDuration!) {
        errors.push(`Duration cannot exceed ${metadata.maxDuration} seconds`)
      }
      break

    case 'TextToSpeech':
      if (!params.text) {
        errors.push('Text is required')
      }
      if (params.language && !metadata.languages?.includes(params.language)) {
        errors.push('Unsupported language')
      }
      break

    default:
      // No validation for other types
      break
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}
