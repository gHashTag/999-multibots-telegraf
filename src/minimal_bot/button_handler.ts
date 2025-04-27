import type { MyContext } from '@/interfaces/context.interface'
import { Markup } from 'telegraf' // Re-enable Markup

export const testButtonCommand = 'testbutton'
export const testButtonCallbackData = 'test_button_pressed'

export const handleTestButtonCommand = async (ctx: MyContext) => {
  const text = 'Press the button!'
  // Revert to using Markup
  const keyboard = Markup.inlineKeyboard([
    Markup.button.callback('Test Me', testButtonCallbackData),
  ])

  try {
    await ctx.reply(text, keyboard)
  } catch (error) {
    console.error('Error sending test button reply:', error)
    // Handle error appropriately
  }
}
