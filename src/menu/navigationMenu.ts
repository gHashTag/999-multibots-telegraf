import { Markup } from 'telegraf'
import type { MyContext } from '@/interfaces' // Assuming MyContext is needed, adjust if not

/**
 * Creates a simple ReplyKeyboard with only navigation buttons.
 * @param isRussian - Boolean indicating user language preference.
 * @returns Telegraf Markup object for the reply keyboard.
 */
export const navigationMenu = (isRussian: boolean) => {
  const mainMenuButton = isRussian ? '🏠 Главное меню' : '🏠 Main menu'
  const helpButton = isRussian ? '❓ Справка' : '❓ Help'

  return Markup.keyboard([[mainMenuButton, helpButton]])
    .resize() // Make the keyboard fit the screen height
    .oneTime() // Hide the keyboard after a button is pressed (optional, consider removing if persistent nav is better)
}

// Example usage within a scene (adjust context/imports as needed):
/*
import { navigationMenu } from '@/menu/navigationMenu';
import { isRussianFromState } from '@/helpers/centralizedLanguage';

// ... inside an async function with ctx: MyContext ...
const isRussian = isRussianFromState(ctx);
await ctx.reply('Your message text...', {
  reply_markup: navigationMenu(isRussian).reply_markup,
  parse_mode: 'HTML',
});
*/
