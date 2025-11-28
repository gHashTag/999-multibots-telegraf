import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { createImagesZip } from '../../helpers/images/createImagesZip'
import { ensureSupabaseAuth } from '@/core/supabase'
import { inngestProvider } from '@/inngest_app/inngest-provider' // ✅ ПРАВИЛЬНЫЙ ПРОВАЙДЕР!
import { isRussian } from '@/helpers/language'

import { sendGenericErrorMessage } from '@/menu'
import { supabase } from '@/core/supabase'
import { getBotNameByToken } from '@/core/bot' // ✅ For correct bot_name detection

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

    // ✅ Загружаем ZIP файл в Supabase Storage (Inngest имеет лимит 256KB на событие)
    // Base64 ZIP файл может быть >1MB, поэтому используем URL вместо base64
    const zipFileName = `train/${ctx.session.targetUserId}/${Date.now()}_${path.basename(zipPath)}`
    const zipBuffer = await fs.promises.readFile(zipPath)

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(zipFileName, zipBuffer, {
        contentType: 'application/zip',
        upsert: true,
      })

    if (uploadError) {
      throw new Error(
        `Failed to upload ZIP to Supabase: ${uploadError.message}`
      )
    }

    const { data: publicUrlData } = supabase.storage
      .from('uploads')
      .getPublicUrl(zipFileName)

    const zipUrl = publicUrlData.publicUrl
    console.log('[uploadTrainFluxModelScene] ZIP uploaded to Supabase:', zipUrl)

    // ✅ Удаляем локальный ZIP файл после загрузки
    try {
      await fs.promises.unlink(zipPath)
      console.log('[uploadTrainFluxModelScene] Local ZIP file cleaned up')
    } catch (unlinkError) {
      console.warn(
        '[uploadTrainFluxModelScene] Failed to cleanup local ZIP (non-fatal)',
        unlinkError
      )
    }

    console.log(
      '[uploadTrainFluxModelScene] Sending Inngest event via BOT provider:',
      {
        modelName: ctx.session.modelName,
        triggerWord,
        steps: ctx.session.steps,
        zipUrl, // HTTP URL из Supabase
        bot_name,
        instance: 'BOT',
      }
    )

    try {
      const eventResult = await inngestProvider.sendEvent(
        'BOT',
        'model/training.start',
        {
          bot_name,
          is_ru: isRu,
          modelName: ctx.session.modelName,
          steps: ctx.session.steps,
          telegram_id: ctx.session.targetUserId.toString(),
          triggerWord,
          zipUrl, // ✅ HTTP URL из Supabase (Inngest лимит 256KB на событие)
          gender,
        }
      )

      console.log(
        '[uploadTrainFluxModelScene] ✅ Inngest event sent successfully:',
        {
          success: true,
          eventId: eventResult?.eventId,
        }
      )
    } catch (eventError) {
      console.error(
        '[uploadTrainFluxModelScene] ❌ Failed to send Inngest event:',
        eventError.message
      )
      console.error('[uploadTrainFluxModelScene] ❌ Full error:', eventError)
      throw eventError
    }

    await ctx.reply(
      isRu
        ? `✅ Тренировка модели запущена через Inngest!\n\n📦 Модель: ${ctx.session.modelName}\n⚡ Событие отправлено\n⏱️ Время: ~1-2 часа`
        : `✅ Model training started via Inngest!\n\n📦 Model: ${ctx.session.modelName}\n⚡ Event sent\n⏱️ Time: ~1-2 hours`
    )
  } catch (error) {
    console.error('Error in uploadTrainFluxModelScene:', error)
    await sendGenericErrorMessage(ctx, isRu, error)
  } finally {
    await ctx.scene.leave()
  }
})

export default uploadTrainFluxModelScene
