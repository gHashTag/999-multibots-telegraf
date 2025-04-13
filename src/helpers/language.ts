import { Context } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'

export const isRussian = (ctx: Context) => ctx.from?.language_code === 'ru'

/**
 * Get user's preferred language code
 * First checks session language, then falls back to Telegram language_code, defaults to 'en'
 */
export const getUserLanguage = (ctx: MyContext): string => {
  // First check if there's a language in session (user preference)
  if (ctx.session && ctx.session.language) {
    return ctx.session.language
  }
  
  // Then check language from Telegram
  if (ctx.from?.language_code) {
    return ctx.from.language_code
  }
  
  // Default to English
  return 'en'
}

/**
 * Set user language preference in session
 */
export const setUserLanguage = (ctx: MyContext, language: string): string => {
  if (!ctx.session) return language
  
  ctx.session.language = language
  return language
}

/**
 * Get supported languages list
 */
export const getSupportedLanguages = (): string[] => {
  return ['en', 'ru']
}

/**
 * Check if language code is supported
 */
export const isLanguageSupported = (langCode: string): boolean => {
  return getSupportedLanguages().includes(langCode)
}
