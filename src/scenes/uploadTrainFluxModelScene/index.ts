import { Scenes } from 'telegraf'
import { MyContext } from '@/types'
import { createImagesZip } from '../../helpers/images/createImagesZip'
import { ensureSupabaseAuth } from '../../core/supabase'
import { createModelTraining } from '@/services/createModelTraining'
import { isRussian } from '@/helpers/language'
import { logger } from '@/utils/logger'
import { sendGenericErrorMessage } from '@/menu'

export const uploadTrainFluxModelScene = new Scenes.BaseScene<MyContext>(
  'uploadTrainFluxModelScene'
)

uploadTrainFluxModelScene.enter(async ctx => {
  const isRu = isRussian(ctx)
  logger.info('🎯 Вход в сцену загрузки модели', {
    description: 'Entering upload model scene',
    telegram_id: ctx.from?.id,
  })

  try {
    await ctx.reply(isRu ? '⏳ Создаю архив...' : '⏳ Creating archive...')
    logger.info('🎯 Начало создания ZIP архива', {
      description: 'Starting ZIP creation',
      telegram_id: ctx.from?.id,
    })

    const zipPath = await createImagesZip(ctx.session.images)
    logger.info('✅ ZIP архив создан', {
      description: 'ZIP archive created',
      telegram_id: ctx.from?.id,
      path: zipPath,
    })

    await ensureSupabaseAuth()

    await ctx.reply(isRu ? '⏳ Загружаю архив...' : '⏳ Uploading archive...')

    const triggerWord = `${ctx.session.username.toLocaleUpperCase()}`
    if (!triggerWord) {
      logger.error('❌ Некорректный trigger word', {
        description: 'Invalid trigger word',
        telegram_id: ctx.from?.id,
      })
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

    logger.info('🚀 Запуск обучения модели', {
      description: 'Starting model training',
      telegram_id: ctx.from?.id,
      trigger_word: triggerWord,
      model_name: ctx.session.modelName,
      steps: ctx.session.steps,
    })

    await createModelTraining(
      {
        filePath: zipPath,
        triggerWord,
        modelName: ctx.session.modelName,
        steps: ctx.session.steps,
        telegram_id: ctx.session.targetUserId.toString(),
        is_ru: isRu,
        botName: ctx.botInfo?.username,
      },
      ctx
    )

    logger.info('✅ Обучение модели запущено успешно', {
      description: 'Model training started successfully',
      telegram_id: ctx.from?.id,
    })
  } catch (error) {
    logger.error('❌ Ошибка в uploadTrainFluxModelScene:', {
      description: 'Error in upload model scene',
      telegram_id: ctx.from?.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    await sendGenericErrorMessage(ctx, isRu, error as Error)
  } finally {
    logger.info('🏁 Завершение сцены загрузки модели', {
      description: 'Finishing upload model scene',
      telegram_id: ctx.from?.id,
    })
    await ctx.scene.leave()
  }
})

export default uploadTrainFluxModelScene
