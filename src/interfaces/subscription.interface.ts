export enum SubscriptionType {
  // --- New tier-based subscriptions ---
  FREE = 'FREE',
  BASIC = 'BASIC',
  PRO = 'PRO',
  STUDIO = 'STUDIO',

  // --- Клуб «Золотая Литейная» (@t27ai_bot) ---
  // Отдельный продукт: НЕ участвует в getSubscriptionTier / приоритете
  // платформенных подписок. Активность клуба читается напрямую из
  // payments_v2.subscription_type (см. handlers/foundryClub).
  CLUB_APPRENTICE = 'CLUB_APPRENTICE',
  CLUB_MASTER = 'CLUB_MASTER',
  CLUB_FOUNDER = 'CLUB_FOUNDER',

  // --- Legacy types (kept for backward compatibility) ---
  /** @deprecated Maps to PRO tier. Use SubscriptionType.PRO instead. */
  NEUROPHOTO = 'NEUROPHOTO',
  /** @deprecated Maps to PRO tier. Use SubscriptionType.PRO instead. */
  NEUROVIDEO = 'NEUROVIDEO',
  STARS = 'STARS',
  NEUROTESTER = 'NEUROTESTER',
}

/**
 * Maps any SubscriptionType to its canonical tier.
 * Legacy NEUROPHOTO/NEUROVIDEO subscribers are treated as PRO.
 */
export function getSubscriptionTier(
  type: SubscriptionType | null | undefined
): SubscriptionType {
  switch (type) {
    case SubscriptionType.STUDIO:
      return SubscriptionType.STUDIO
    case SubscriptionType.PRO:
    case SubscriptionType.NEUROPHOTO:
    case SubscriptionType.NEUROVIDEO:
      return SubscriptionType.PRO
    case SubscriptionType.BASIC:
      return SubscriptionType.BASIC
    case SubscriptionType.NEUROTESTER:
      return SubscriptionType.NEUROTESTER
    default:
      return SubscriptionType.FREE
  }
}

/**
 * Generation limits per subscription tier.
 * FREE: 3 per day, BASIC: 50 per month, PRO/STUDIO: unlimited.
 */
export const TIER_LIMITS: Record<
  string,
  { daily: number | null; monthly: number | null }
> = {
  [SubscriptionType.FREE]: { daily: 3, monthly: null },
  [SubscriptionType.BASIC]: { daily: null, monthly: 50 },
  [SubscriptionType.PRO]: { daily: null, monthly: null },
  [SubscriptionType.STUDIO]: { daily: null, monthly: null },
  [SubscriptionType.NEUROTESTER]: { daily: null, monthly: null },
}

/**
 * Pricing for each tier in RUB per month.
 */
export const TIER_PRICES_RUB: Record<string, number> = {
  [SubscriptionType.FREE]: 0,
  [SubscriptionType.BASIC]: 299,
  [SubscriptionType.PRO]: 699,
  [SubscriptionType.STUDIO]: 1999,
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
