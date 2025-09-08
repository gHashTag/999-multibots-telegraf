import { Markup } from 'telegraf'
import type { InlineKeyboardButton } from 'telegraf/types'
import { logger } from '@/utils/logger'

/**
 * Creates a mini app button that opens the TMA_RENDER_URL in a Telegram Web App.
 * This button will open the web app inside Telegram when clicked.
 * 
 * @param text - The button text to display
 * @param isRu - Whether to use Russian language
 * @returns {InlineKeyboardButton.WebAppButton} Telegram Web App button
 */
export const createMiniAppButton = (
  text?: string,
  isRu: boolean = true
): InlineKeyboardButton.WebAppButton => {
  // Use the correct production URL
  const tmaUrl = process.env.TMA_RENDER_URL || 'https://ui-production-57b7.up.railway.app/login'
  
  // Ensure the URL has proper protocol
  const webAppUrl = tmaUrl.startsWith('http') ? tmaUrl : `https://${tmaUrl}`
  
  const buttonText = text || (isRu ? '🎨 Открыть приложение' : '🎨 Open App')
  
  logger.info('[MiniApp] Creating mini app button', {
    webAppUrl,
    buttonText,
    isRu
  })
  
  return Markup.button.webApp(buttonText, webAppUrl)
}

/**
 * Creates an inline keyboard with the mini app button.
 * Can be combined with other buttons if needed.
 * 
 * @param isRu - Whether to use Russian language
 * @param additionalButtons - Optional additional buttons to include
 * @returns Inline keyboard markup with mini app button
 */
export const createMiniAppKeyboard = (
  isRu: boolean = true,
  additionalButtons: InlineKeyboardButton[][] = []
) => {
  const miniAppButton = createMiniAppButton(undefined, isRu)
  
  // Create keyboard with mini app button as the first button
  const keyboard = [[miniAppButton], ...additionalButtons]
  
  return Markup.inlineKeyboard(keyboard)
}

/**
 * Adds a mini app button to existing inline keyboard.
 * Places the mini app button as the first row.
 * 
 * @param existingKeyboard - Existing inline keyboard buttons
 * @param isRu - Whether to use Russian language
 * @returns Updated inline keyboard with mini app button
 */
export const addMiniAppButtonToKeyboard = (
  existingKeyboard: InlineKeyboardButton[][],
  isRu: boolean = true
): InlineKeyboardButton[][] => {
  const miniAppButton = createMiniAppButton(undefined, isRu)
  
  // Add mini app button as the first row
  return [[miniAppButton], ...existingKeyboard]
}
