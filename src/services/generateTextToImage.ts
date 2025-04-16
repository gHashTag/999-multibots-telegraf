import { generateTextToImage as PlanBGenerateTextToImage } from './plan_b/generateTextToImage'
import { MyContext } from '@/interfaces'
import { getBotByName } from '@/core/bot'

// TODO: добавить тесты (unit/integration) после ручной проверки
export const generateTextToImage = async (
  prompt: string,
  model_type: string,
  num_images: number,
  telegram_id: string,
  ctx: MyContext,
  botName: string,
  is_ru: boolean = false
) => {
  // Всегда используем Plan B (Direct)
  try {
    const username = ctx.from?.username || ''
    // Получаем Telegraf<MyContext> инстанс
    // @ts-ignore
    let bot = ctx.bot || ctx.__bot
    if (!bot) {
      const botResult = getBotByName(botName)
      if (!botResult.bot) {
        throw new Error('Telegraf instance (bot) not found in context or by botName')
      }
      bot = botResult.bot
    }
    return await PlanBGenerateTextToImage(
      prompt,
      model_type,
      num_images,
      telegram_id,
      username,
      is_ru,
      bot,
      botName
    )
  } catch (error) {
    // TODO: добавить логирование ошибок
    throw error
  }
}
