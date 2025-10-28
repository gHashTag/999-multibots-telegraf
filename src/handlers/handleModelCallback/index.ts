// src/handlers/modelHandler.ts
import { logger } from '@/utils/enhancedLogger'
import { MyContext } from '@/interfaces'
import { UserModel } from '@/interfaces/models.interface'
import { sendPhotoDescriptionRequest } from '@/menu/sendPhotoDescriptionRequest'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { updateUserModel } from '../../core/supabase'

export const handleModelCallback = async (ctx: MyContext) => {
  if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
    const data = ctx.callbackQuery.data
    const isRu = isRussianFromState(ctx)

    try {
      await updateUserModel(ctx.from.id.toString(), data)

      await ctx.reply(
        isRu
          ? `✅ Модель успешно изменена на ${data}`
          : `✅ Model successfully changed to ${data}`
      )
    } catch (error) {
      logger.error('Error setting model:', error)
      await ctx.reply(
        isRu ? '❌ Ошибка при изменении модели' : '❌ Error changing model'
      )
    }
  }
}
