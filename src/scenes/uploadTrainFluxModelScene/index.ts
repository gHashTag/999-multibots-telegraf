import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { createImagesZip } from '../../helpers/images/createImagesZip'
import { ensureSupabaseAuth } from '../../core/supabase'
import { createModelTraining } from '@/services/createModelTraining'
import { isRussian } from '@/helpers/language'

export const uploadTrainFluxModelScene = new Scenes.BaseScene<MyContext>(
  'uploadTrainFluxModelScene'
)

uploadTrainFluxModelScene.enter(async ctx => {
  const isRu = isRussian(ctx)
  console.log('Scene: ZIP')
  try {
    await ctx.reply(isRu ? '⏳ Создаю архив...' : '⏳ Creating archive...')
    console.log('🎯 Starting ZIP creation process')
    const zipPath = await createImagesZip(ctx.session.images)
    console.log('ZIP created at:', zipPath)

    await ensureSupabaseAuth()

    await ctx.reply(isRu ? '⏳ Загружаю архив...' : '⏳ Uploading archive...')
    const triggerWord = `${ctx.session.username?.toLocaleUpperCase()}`
    if (!triggerWord) {
      await ctx.reply(
        isRu ? '❌ Некорректный trigger word' : '❌ Invalid trigger word'
      )
      return ctx.scene.leave()
    }

    await ctx.reply(
      isRu
        ? '✅ Архив успешно загружен! Начинаю обучение модели...'
        : '✅ Archive uploaded successfully! Starting model training...'
    )

    await ctx.reply(
      isRu
        ? `⏳ Начинаю обучение модели...\n\nВаша модель будет натренирована через 1-2 часа. После завершения вы сможете проверить её работу, используя раздел "Модели" в Нейрофото.`
        : `⏳ Starting model training...\n\nYour model will be trained in 1-2 hours. Once completed, you can check its performance using the "Models" section in Neurophoto.`
    )

    if (!ctx.session.targetUserId) {
      await ctx.reply(
        isRu ? '❌ Некорректный targetUserId' : '❌ Invalid targetUserId'
      )
      return ctx.scene.leave()
    }

    if (!ctx.session.modelName) {
      await ctx.reply(
        isRu ? '❌ Некорректный modelName' : '❌ Invalid modelName'
      )
      return ctx.scene.leave()
    }

    if (!ctx.session.steps) {
      await ctx.reply(isRu ? '❌ Некорректный steps' : '❌ Invalid steps')
      return ctx.scene.leave()
    }

    if (!ctx.botInfo?.username) {
      await ctx.reply(isRu ? '❌ Некорректный botName' : '❌ Invalid botName')
      return ctx.scene.leave()
    }
    if (!ctx.session.steps) {
      await ctx.reply(isRu ? '❌ Некорректный steps' : '❌ Invalid steps')
      return ctx.scene.leave()
    }

    await createModelTraining(
      {
        filePath: zipPath,
        triggerWord,
        modelName: ctx.session.modelName,
        telegram_id: ctx.session.targetUserId.toString(),
        is_ru: isRu,
        steps: Number(ctx.session.steps),
        botName: ctx.botInfo?.username,
      },
      ctx
    )

    // await deleteFile(zipPath)
  } catch (error) {
    console.error('Error in uploadTrainFluxModelScene:', error)
    //await sendGenericErrorMessage(ctx, isRu, error)
  } finally {
    await ctx.scene.leave()
  }
})

export default uploadTrainFluxModelScene
