export enum SubscriptionType {
  NEUROPHOTO = 'NEUROPHOTO',
  NEUROVIDEO = 'NEUROVIDEO',
  NEUROTESTER = 'NEUROTESTER',
  NEUROBLOGGER = 'NEUROBLOGGER',
  STARS = 'STARS',
}

export interface Subscription {
  id: string
  telegram_id: string
  type: SubscriptionType
  start_date: Date
  end_date: Date
  is_active: boolean
  metadata?: Record<string, any>
}

export interface SubscriptionCreateParams {
  telegram_id: string
  type: SubscriptionType
  duration_days: number
  metadata?: Record<string, any>
}

export interface SubscriptionUpdateParams {
  type?: SubscriptionType
  end_date?: Date
  is_active?: boolean
  metadata?: Record<string, any>
}

export interface SubscriptionOperationResult {
  success: boolean
  message: string
  subscription?: Subscription
  error?: string
}

export interface SubscriptionValidationResult {
  isValid: boolean
  errors: string[]
}

export interface SubscriptionStats {
  totalActive: number
  totalExpired: number
  byType: Record<SubscriptionType, number>
  averageDuration: number
}

export interface SubscriptionRenewalParams {
  telegram_id: string
  type: SubscriptionType
  extend_days: number
  subscription?: string | null
}

export const SUBSCRIPTION_ERROR_MESSAGES = {
  INVALID_TYPE: 'Invalid subscription type',
  ALREADY_EXISTS: 'Subscription already exists',
  NOT_FOUND: 'Subscription not found',
  EXPIRED: 'Subscription has expired',
  INACTIVE: 'Subscription is inactive',
  INVALID_DURATION: 'Invalid subscription duration',
  RENEWAL_FAILED: 'Subscription renewal failed',
  VALIDATION_FAILED: 'Subscription validation failed',
} as const

export const SUBSCRIPTION_SUCCESS_MESSAGES = {
  CREATED: 'Subscription created successfully',
  UPDATED: 'Subscription updated successfully',
  CANCELLED: 'Subscription cancelled successfully',
  RENEWED: 'Subscription renewed successfully',
  VALIDATED: 'Subscription validated successfully',
} as const

export const SUBSCRIPTION_DEFAULTS = {
  MIN_DURATION_DAYS: 1,
  MAX_DURATION_DAYS: 365,
  DEFAULT_DURATION_DAYS: 30,
} as const
