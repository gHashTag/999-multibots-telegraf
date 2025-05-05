import { MyContext } from '@/interfaces'
import { TextToVideoWizardDependencies } from '../interfaces/TextToVideoWizardDependencies'
import { Markup } from 'telegraf'

export const processTextToVideoWizardStep = async (
  ctx: MyContext,
  dependencies: TextToVideoWizardDependencies
): Promise<void> => {
  const isRu = dependencies.isRussian(ctx)
  const message = ctx.message

  if (message && 'text' in message) {
    const prompt = message.text

    if (!prompt) {
      await dependencies.sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    // Получаем ключ модели из существующего поля сессии
    const videoModelKey = ctx.session.videoModel as
      | keyof typeof import('@/modules/videoGenerator/config/models.config').VIDEO_MODELS_CONFIG
      | undefined
    console.log('Selected video model key:', videoModelKey)

    if (!videoModelKey) {
      console.error('Video model key not found in session')
      await dependencies.sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    if (ctx.from && ctx.from.username) {
      await dependencies.generateTextToVideo(
        prompt,
        ctx.from.id.toString(),
        ctx.from.username,
        isRu,
        ctx.botInfo?.username || 'unknown_bot'
      )

      ctx.session.prompt = prompt
    } else {
      console.error('User information missing for video generation')
      await dependencies.sendGenericErrorMessage(ctx, isRu)
    }

    await ctx.scene.leave()
  } else {
    await dependencies.sendGenericErrorMessage(ctx, isRu)
    await ctx.scene.leave()
  }
}
