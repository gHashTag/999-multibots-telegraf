import { Markup } from 'telegraf'

/**
 * Creates a keyboard with "Cancel" and "Help" buttons.
 * @deprecated This keyboard might be redundant if global handlers are used.
 */
export const createHelpCancelKeyboard = (isRu: boolean) => {
  // Assuming cancelHelpArray is removed/deprecated, return an empty keyboard or basic nav?
  // Let's return the basic navigation menu for now.
  const mainMenuButton = isRu ? '🏠 Главное меню' : '🏠 Main menu'
  const helpButton = isRu ? '❓ Справка' : '❓ Help'

  return Markup.keyboard([[mainMenuButton, helpButton]]).resize()
}
