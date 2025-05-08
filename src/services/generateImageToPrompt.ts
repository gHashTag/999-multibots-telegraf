import { generateImageToPrompt as planBGenerateImageToPrompt } from './plan_b/generateImageToPrompt'
import { MyContext } from '@/interfaces'
// import { getBotByName } from '@/core/bot' // Больше не нужен, так как ctx передается напрямую
import logger from '@/utils/logger'
// import { BotName } from '@/interfaces/telegram-bot.interface' // Больше не нужен

/**
 * Обертка для вызова функции generateImageToPrompt из plan_b.
 * Теперь принимает ctx напрямую.
 */
export const generateImageToPrompt = async (
  imageUrl: string,
  telegram_id: string,
  username: string, // Добавлен username, как и в plan_b
  is_ru: boolean, // is_ru теперь явный параметр
  ctx: MyContext, // ctx передается напрямую
  botName: string // botName остается
) => {
  // const username = ctx.from?.username || '' // username теперь передается
  if (!ctx.from) {
    // Проверка на ctx.from остается, если нужна для других целей, но username уже есть
    logger.error(
      'ctx.from is undefined, cannot proceed in generateImageToPrompt wrapper',
      { telegram_id, botName }
    )
    throw new Error(
      'User information not found in context for generateImageToPrompt wrapper'
    )
  }
  // Логика получения bot инстанса больше не нужна, так как planBGenerateImageToPrompt ожидает ctx
  // const botResult = getBotByName(botName as BotName)
  // if (!botResult.bot) {
  //   logger.error('Bot instance not found by name', { botName, telegram_id })
  //   throw new Error(`Telegraf instance (bot) not found for botName: ${botName}`)
  // }
  // const bot = botResult.bot

  return await planBGenerateImageToPrompt(
    imageUrl,
    telegram_id,
    username, // Передаем username
    is_ru, // Передаем is_ru
    ctx, // Передаем ctx вместо bot
    botName
  )
}
