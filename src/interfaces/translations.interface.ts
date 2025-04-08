import { TranslationButton } from './supabase.interface'

export const TranslationCategory = {
  SPECIFIC: 'specific',
  COMMON: 'common',
  SYSTEM: 'system',
} as const

export type TranslationCategoryType = typeof TranslationCategory[keyof typeof TranslationCategory]

export interface Translation {
  id: number
  created_at: string
  language_code: string
  bot_name: string
  key: string
  translation: string
  url?: string
  buttons?: TranslationButton[]
  category: TranslationCategoryType
  is_override?: boolean
}

// Helper function to create translation keys with proper typing
export function createTranslationKey<T extends string>(key: T): T {
  return key
}

// Common translation keys
export const CommonTranslationKeys = {
  HELP: createTranslationKey('help'),
  START: createTranslationKey('start'),
  CANCEL: createTranslationKey('cancel'),
  ERROR: createTranslationKey('error'),
  SUCCESS: createTranslationKey('success'),
} as const

// System translation keys
export const SystemTranslationKeys = {
  MAINTENANCE: createTranslationKey('maintenance'),
  RATE_LIMIT: createTranslationKey('rate_limit'),
  SUBSCRIPTION_REQUIRED: createTranslationKey('subscription_required'),
} as const 