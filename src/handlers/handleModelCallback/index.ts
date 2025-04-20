// src/handlers/modelHandler.ts
import { MyContext } from '../../interfaces'
import { updateUserModel } from '../../core/supabase'

export async function handleModelCallback(ctx: MyContext, model: string) {
  try {
    if (!ctx.from) {
      console.log('ctx.from is undefined')
      return
    }
    const isRu = ctx.from?.language_code === 'ru'

    try {
      await updateUserModel(ctx.from.id.toString(), model)

      await ctx.reply(
        isRu
          ? `✅ Модель успешно изменена на ${model}`
          : `✅ Model successfully changed to ${model}`
      )
    } catch (error) {
      console.error('Error setting model:', error)
      await ctx.reply(
        isRu ? '❌ Ошибка при изменении модели' : '❌ Error changing model'
      )
    }
  } catch (error) {
    console.error('Error in handleModelCallback:', error)
    throw error
  }
}
