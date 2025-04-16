import { PlanBGenerateImageToPrompt } from './index'
import { MyContext } from '@/interfaces'
import { getBotByName } from '@/core/bot'

export const generateImageToPrompt = async (
  imageUrl: string,
  telegram_id: string,
  ctx: MyContext,
  botName: string,
  is_ru: boolean = false
) => {
  try {
    const username = ctx.from?.username || ''
    // Получаем Telegraf<MyContext> инстанс из ctx.bot (или ctx.__bot, если используется кастомное поле)
    // Если не найден, ищем по botName через getBotByName
    // @ts-ignore
    let bot = ctx.bot || ctx.__bot
    if (!bot) {
      const botResult = getBotByName(botName)
      if (!botResult.bot) {
        throw new Error('Telegraf instance (bot) not found in context or by botName')
      }
      bot = botResult.bot
    }
    return await PlanBGenerateImageToPrompt(
      imageUrl,
      telegram_id,
      username,
      is_ru,
      bot,
      botName
    )
  } catch (error) {
    throw error
  }
} 