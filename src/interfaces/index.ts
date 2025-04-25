import { Context, Scenes } from 'telegraf'

// Расширенный контекст для работы с Telegraf
export interface MyContext extends Context {
  session: {
    cursor: number
    images: string[]
    __scenes: {
      current?: string
      state?: {
        step: number
        [key: string]: any
      }
      cursor: number
    }
    balance?: number
    targetUserId?: string
    [key: string]: any
  }
  scene: Scenes.SceneContext['scene']
  [key: string]: any
}

// Другие общие интерфейсы проекта
export * from './telegram-bot.interface'
export * from './models.interface'
export * from './payments.interface'
export {
  VideoModelConfig,
  VIDEO_MODELS,
  AdditionalMode,
} from './cost.interface'
export * from './telegram-bot.interface'
export {
  CreateUserData,
  ModelTraining,
  UserType,
  TranslationContext,
  TranslationButton,
} from './supabase.interface'
export * from './api.interface'
export * from './translations.interface'
export {
  ModeEnum,
  CostCalculationParams,
  CostCalculationResult,
  Mode,
  BaseCosts,
  ModeCosts,
} from './modes'
export {
  SubscriptionType,
  Subscription,
  SubscriptionCreateParams,
  SubscriptionUpdateParams,
  SubscriptionOperationResult,
  SubscriptionValidationResult,
  SubscriptionStats,
  SubscriptionRenewalParams,
  SUBSCRIPTION_ERROR_MESSAGES,
  SUBSCRIPTION_SUCCESS_MESSAGES,
  SUBSCRIPTION_DEFAULTS,
} from './subscription.interface'
