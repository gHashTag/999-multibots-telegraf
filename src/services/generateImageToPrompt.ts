import { generateImageToPrompt as planBGenerateImageToPrompt } from './plan_b/generateImageToPrompt'
import { MyContext } from '@/interfaces'
import { getBotByName } from '@/core/bot'
import logger from '@/utils/logger'
import { BotName } from '@/interfaces/telegram-bot.interface'
/**
 * Обертка для вызова функции generateImageToPrompt из plan_b.
 * Получает bot instance по имени.
 */
export const generateImageToPrompt = async (
  imageUrl: string,
  telegram_id: string,
  ctx: MyContext,
  botName: string,
  is_ru = false
) => {
  const username = ctx.from?.username || ''
  if (!ctx.from) {
    console.error('❌ Telegram ID не найден')
    return
  }
  const botResult = getBotByName(botName as BotName)
  if (!botResult.bot) {
    logger.error('Bot instance not found by name', { botName, telegram_id })
    throw new Error(`Telegraf instance (bot) not found for botName: ${botName}`)
  }
  const bot = botResult.bot

  return await planBGenerateImageToPrompt(
    imageUrl,
    telegram_id,
    username,
    is_ru,
    bot,
    botName
  )
}
