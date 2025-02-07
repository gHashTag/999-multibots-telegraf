import { getPrompt, getUserBalance } from '@/core/supabase'
import { generateNeuroImage } from '@/services/generateNeuroImage'
import { MyContext } from '@/interfaces'
import {
  imageNeuroGenerationCost,
  sendInsufficientStarsMessage,
} from '@/price/helpers'
import { sendGenerationErrorMessage } from '@/menu'

export async function handleNeuroGenerate(
  ctx: MyContext,
  data: string,
  isRu: boolean
) {
  console.log('CASE: handleNeuroGenerate')

  try {
    if (!ctx || !ctx.from) {
      await ctx.reply(
        isRu ? 'Ошибка идентификации пользователя' : 'User identification error'
      )
      return
    }

    const userId = ctx.from.id

    const currentBalance = await getUserBalance(userId)
    if (currentBalance < imageNeuroGenerationCost) {
      await sendInsufficientStarsMessage(ctx, currentBalance, isRu)
      return
    }

    console.log('Received neuro_generate_ callback with data:', data)

    const parts = data.split('_')
    console.log('Split parts:', parts)

    const count = parts[2]
    const promptId = parts[3]
    console.log('Extracted count and promptId:', { count, promptId })

    const promptData = await getPrompt(promptId)
    console.log('Retrieved prompt data:', promptData)

    if (!promptData) {
      console.log('No prompt data found for ID:', promptId)
      await ctx.reply(
        isRu
          ? 'Не удалось найти информацию о промпте'
          : 'Could not find prompt information'
      )
      return
    }

    try {
      const numImages = parseInt(count)
      console.log('Generating', numImages, 'images')

      await generateNeuroImage(
        promptData.prompt,
        promptData.model_type,
        numImages,
        ctx.from.id,
        ctx,
        ctx.botInfo?.username
      )
    } catch (error) {
      console.error('Error in generation loop:', error)
      throw error
    }
  } catch (error) {
    console.error('Error in neuro_generate_ handler:', error)
    await sendGenerationErrorMessage(ctx, isRu)
  }
}
