import { generateTextToVideo as PlanBGenerateTextToVideo } from './plan_b/generateTextToVideo'
import { MyContext } from '@/interfaces'
import { getBotByName } from '@/core/bot'

// TODO: добавить тесты (unit/integration) после ручной проверки
export const generateTextToVideo = async (
  prompt: string,
  videoModel: string,
  telegram_id: string,
  ctx: MyContext,
  botName: string,
  is_ru: boolean = false
) => {
  try {
    const username = ctx.from?.username || ''
    return await PlanBGenerateTextToVideo(
      prompt,
      videoModel,
      telegram_id,
      username,
      is_ru,
      botName
    )
  } catch (error) {
    throw error
  }
}
