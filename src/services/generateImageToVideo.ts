import { generateImageToVideo as PlanBGenerateImageToVideo } from './plan_b/generateImageToVideo'
import { MyContext } from '@/interfaces'
import { getBotByName } from '@/core/bot'

// TODO: добавить тесты (unit/integration) после ручной проверки
export const generateImageToVideo = async (
  imageUrl: string,
  prompt: string,
  videoModel: string,
  telegram_id: string,
  ctx: MyContext,
  botName: string,
  isRu: boolean = false
) => {
  try {
    const username = ctx.from?.username || ''
    return await PlanBGenerateImageToVideo(
      imageUrl,
      prompt,
      videoModel,
      telegram_id,
      username,
      isRu,
      botName
    )
  } catch (error) {
    throw error
  }
}
