import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { createImagesZip } from '../../helpers/images/createImagesZip'
import { ensureSupabaseAuth } from '@/core/supabase'
import { createModelTrainingLocal } from '@/services/createModelTrainingLocal' // ✅ Локальная тренировка
import { isRussian } from '@/helpers/language'
import { deleteFile } from '@/helpers'
import { sendGenericErrorMessage } from '@/menu'
import { supabase } from '@/core/supabase'
import { getBotNameByToken } from '@/core/bot' // ✅ For correct bot_name detection
import fetch from 'node-fetch'
import { PUBLIC_URL, isDev } from '@/config'
const fs = require('fs')
const path = require('path')

export const uploadTrainFluxModelScene = new Scenes.BaseScene<MyContext>(
  'uploadTrainFluxModelScene'
)

uploadTrainFluxModelScene.enter(async ctx => {
  const isRu = isRussian(ctx)
  console.log('Scene: ZIP')
  try {
    await ctx.reply(isRu ? '⏳ Создаю архив...' : '⏳ Creating archive...')
    const zipPath = await createImagesZip(ctx.session.images)
    console.log('ZIP created at:', zipPath)

    // ✅ Файл будет отправлен напрямую через FormData в ai-server
    // AI-server multer сохранит его в правильную структуру /uploads/{telegram_id}/{type}/
    console.log('ZIP file ready for upload to ai-server:', zipPath)

    await ensureSupabaseAuth()

    // Получаем gender из состояния сцены или сессии
    const sceneState = ctx.scene.state as { gender?: string }
    const gender = sceneState?.gender || ctx.session.gender

    if (!gender) {
      console.error(
        'Error in uploadTrainFluxModelScene: Gender not found in session or scene state.'
      )
      await ctx.reply(
        isRu
          ? '❌ Ошибка: пол не определен. Попробуйте начать заново.'
          : '❌ Error: Gender not specified. Please try starting over.'
      )
      return ctx.scene.leave()
    }
    console.log(`[uploadTrainFluxModelScene] Using gender: ${gender}`)

    await ctx.reply(isRu ? '⏳ Загружаю архив...' : '⏳ Uploading archive...')

    const triggerWord = `${ctx.session.username?.toLocaleUpperCase()}`
    if (!triggerWord) {
      await ctx.reply(
        isRu ? '❌ Некорректный trigger word' : '❌ Invalid trigger word'
      )
      return ctx.scene.leave()
    }

    // ✅ Локальная тренировка на bot-farm (прямой вызов Replicate API)
    console.log('[uploadTrainFluxModelScene] Using LOCAL training on bot-farm')

    await ctx.reply(
      isRu
        ? `⏳ Начинаю обучение модели...\n\nВаша модель будет натренирована через 1-2 часа. После завершения вы сможете проверить её работу, используя раздел "Модели" в Нейрофото.`
        : `⏳ Starting model training...\n\nYour model will be trained in 1-2 hours. Once completed, you can check its performance using the "Models" section in Neurophoto.`
    )

    // ✅ Get correct bot name from token
    const botToken = (ctx.telegram as any).token || (ctx as any).botInfo?.token
    const { bot_name } = getBotNameByToken(botToken)

    const response = await createModelTrainingLocal(
      {
        filePath: zipPath,
        triggerWord,
        modelName: ctx.session.modelName,
        steps: ctx.session.steps,
        telegram_id: ctx.session.targetUserId.toString(),
        is_ru: isRu,
        botName: bot_name, // ✅ Use bot_name from token instead of ctx.botInfo?.username
        gender: gender,
      },
      ctx
    )

    console.log('[uploadTrainFluxModelScene] Training response:', response)

    await ctx.reply(
      isRu
        ? `✅ Тренировка модели запущена!\n\n📦 Модель: ${ctx.session.modelName}\n🆔 ID: ${response.training_id}\n⏱️ Время: ~1-2 часа`
        : `✅ Model training started!\n\n📦 Model: ${ctx.session.modelName}\n🆔 ID: ${response.training_id}\n⏱️ Time: ~1-2 hours`
    )
  } catch (error) {
    console.error('Error in uploadTrainFluxModelScene:', error)
    await sendGenericErrorMessage(ctx, isRu, error)
  } finally {
    await ctx.scene.leave()
  }
})

export default uploadTrainFluxModelScene
