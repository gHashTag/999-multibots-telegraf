import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { isDev } from '@/config'
/**
 * Handles the logic for restarting the correct video generation scene
 * based on the *last completed* video scene stored in the session.
 * Called when the user clicks '🎥 Сгенерировать новое видео?'.
 */
export async function handleRestartVideoGeneration(
  ctx: MyContext
): Promise<void> {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  // Получаем последнюю завершенную сцену видео
  const lastCompletedScene = ctx.session.lastCompletedVideoScene
  logger.info({
    message:
      '🔄 [handleRestartVideoGeneration] Attempting to restart video scene',
    telegramId,
    lastCompletedScene: lastCompletedScene ?? 'undefined',
  })

  // Определяем ID сцен на основе ModeEnum
  const textToVideoSceneId = ModeEnum.TextToVideo
  const imageToVideoSceneId = ModeEnum.ImageToVideo

  // Сравниваем lastCompletedScene с ID сцен
  if (lastCompletedScene === textToVideoSceneId) {
    logger.info({
      message: `[handleRestartVideoGeneration] Entering ${textToVideoSceneId}`,
      telegramId,
    })
    await ctx.scene.enter(textToVideoSceneId)
  } else if (lastCompletedScene === imageToVideoSceneId) {
    logger.info({
      message: `[handleRestartVideoGeneration] Entering ${imageToVideoSceneId}`,
      telegramId,
    })
    await ctx.scene.enter(imageToVideoSceneId)
  } else {
    // Если поле не установлено или имеет неожиданное значение
    logger.warn({
      message: `[handleRestartVideoGeneration] Cannot determine scene to restart. lastCompletedVideoScene: ${
        lastCompletedScene ?? 'undefined'
      }`,
      telegramId,
    })
    // В режиме разработки для удобства можем все равно перейти куда-то
    if (isDev) {
      await ctx.reply(
        '⚠️ Не удалось определить последнюю сцену, но в DEV режиме переходим в TextToVideo.'
      )
      await ctx.scene.enter(textToVideoSceneId)
      return
    }

    await ctx.reply(
      isRussianFromState(ctx)
        ? 'Не удалось определить предыдущий режим генерации видео. Пожалуйста, вернитесь в /start.'
        : 'Could not determine the previous video generation mode. Please return to /start.'
    )
    // Выходим из любой возможной текущей сцены и переходим в главное меню
    await ctx.scene.leave()
    const { showMainMenu } = await import('@/navigation')
    await showMainMenu(ctx)
  }
}
