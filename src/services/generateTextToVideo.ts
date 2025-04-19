import { generateTextToVideo as PlanBGenerateTextToVideo } from './plan_b/generateTextToVideo'
import { MyContext } from '@/interfaces'

// TODO: добавить тесты (unit/integration) после ручной проверки
export const generateTextToVideo = async (
  prompt: string,
  videoModel: string,
  telegram_id: string,
  ctx: MyContext,
  botName: string,
  is_ru = false
) => {
  const username = ctx.from?.username || ''
  return await PlanBGenerateTextToVideo(
    prompt,
    videoModel,
    telegram_id,
    username,
    is_ru,
    botName
  )
}
