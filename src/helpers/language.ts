import { type MyContext } from '@/interfaces'

/**
 * Checks if the user's language code from the context indicates Russian.
 * Handles cases like 'ru', 'ru-RU', and is case-insensitive.
 * @param ctx - The Telegraf context.
 * @returns True if the language is Russian, false otherwise.
 */
export const isRussian = (ctx: MyContext): boolean => {
  // Safely access language code, converting to lower case
  const languageCode = ctx.from?.language_code?.toLowerCase()

  // Check if language code exists and starts with 'ru'
  if (languageCode) {
    return languageCode.startsWith('ru')
  }

  // Return false if no language code is available
  return false
}
