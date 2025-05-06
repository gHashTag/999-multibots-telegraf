import { MyContext } from '@/interfaces'
import { Scenes } from 'telegraf'
import { getUserBalance } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils'

export const balanceScene = new Scenes.WizardScene<MyContext>(
  'balanceScene',
  async (ctx: MyContext) => {
    const telegramId = ctx.from?.id?.toString() || 'unknown_telegram_id'
    const isRu = ctx.from?.language_code === 'ru'

    try {
      console.log('CASE: balanceScene')

      const balance = await getUserBalance(telegramId)
      logger.info(
        `[balanceScene] User: ${telegramId}, Fetched Balance: ${balance}`
      )

      await ctx.reply(
        isRu
          ? `💰✨ <b>Ваш баланс:</b> ${balance} ⭐️`
          : `💰✨ <b>Your balance:</b> ${balance} ⭐️`,
        { parse_mode: 'HTML' }
      )
      await ctx.scene.enter(ModeEnum.MainMenu)
    } catch (error) {
      console.error('Error sending balance:', error)
      logger.error(`[balanceScene] Error for user ${telegramId}:`, error)
      const errorMessage = isRu
        ? 'Произошла ошибка при получении баланса. Попробуйте позже.'
        : 'An error occurred while fetching your balance. Please try again later.'
      try {
        await ctx.reply(errorMessage)
      } catch (replyError) {
        logger.error(
          `[balanceScene] Failed to send error message to user ${telegramId}:`,
          replyError
        )
      }
      await ctx.scene.leave()
    }
  }
)
