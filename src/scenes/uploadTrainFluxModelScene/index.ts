import { Scenes } from 'telegraf'
import type { MyContext } from '@/interfaces'
import { createImagesZip } from '../../helpers/images/createImagesZip'
import { ensureSupabaseAuth } from '@/core/supabase'
import { createModelTraining } from '@/services/createModelTraining'
import { isRussian } from '@/helpers/language'
import { deleteFile } from '@/helpers'
import { sendGenericErrorMessage } from '@/menu'
import { writeFile, mkdir, rm } from 'fs/promises'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'

export const uploadTrainFluxModelScene = new Scenes.BaseScene<MyContext>(
  'uploadTrainFluxModelScene'
)

uploadTrainFluxModelScene.enter(async ctx => {
  const isRu = isRussian(ctx)
  console.log('Scene: ZIP')
  let tempZipPath: string | null = null

  try {
    await ctx.reply(isRu ? '⏳ Создаю архив...' : '⏳ Creating archive...')
    const zipBuffer = createImagesZip(ctx.session.images)

    const tempDir = path.join(os.tmpdir(), 'neuroblogger-uploads')
    await mkdir(tempDir, { recursive: true })
    tempZipPath = path.join(tempDir, `training-${uuidv4()}.zip`)

    await writeFile(tempZipPath, zipBuffer)
    console.log('ZIP created and saved temporarily at:', tempZipPath)

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
        ? `⏳ Начинаю обучение модели...\n\nВаша модель будет натренирована через 1-2 часа. После завершения вы сможете проверить её работу, используя раздел "Модели" в Нейрофото.`
        : `⏳ Starting model training...\n\nYour model will be trained in 1-2 hours. Once completed, you can check its performance using the "Models" section in Neurophoto.`
    )

    await createModelTraining(
      {
        filePath: tempZipPath,
        triggerWord,
        modelName: ctx.session.modelName || '',
        steps: ctx.session.steps || 100,
        telegram_id: ctx.session.targetUserId.toString(),
        is_ru: isRu,
        botName: ctx.botInfo?.username || '',
      },
      ctx
    )

    // Закомментировано, так как файл уже удаляется в createModelTraining.js
    // await deleteFile(zipPath)
  } catch (error) {
    console.error('Error in uploadTrainFluxModelScene:', error)
    //await sendGenericErrorMessage(ctx, isRu, error)
  } finally {
    if (tempZipPath) {
      try {
        await rm(tempZipPath)
        console.log('Temporary ZIP file deleted:', tempZipPath)
      } catch (deleteError) {
        console.error(
          'Error deleting temporary ZIP file:',
          tempZipPath,
          deleteError
        )
        // Опционально: уведомить админа об ошибке удаления
      }
    }
    await ctx.scene.leave()
  }
})

export default uploadTrainFluxModelScene
