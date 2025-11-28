import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { createImagesZip } from '../../helpers/images/createImagesZip'
import { ensureSupabaseAuth } from '@/core/supabase'
import { inngest } from '@/inngest_app/client' // ✅ ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ
import { isRussian } from '@/helpers/language'

import { sendGenericErrorMessage } from '@/menu'
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
    // ✅ ИСПРАВЛЕНО: Используем bucket 'images' вместо 'uploads' (bucket 'uploads' не существует)
    // ✅ ИСПРАВЛЕНО: Используем serviceClient с SUPABASE_SERVICE_ROLE_KEY для обхода RLS политик
    const { createClient } = await import('@supabase/supabase-js')
    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured in environment')
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const zipFileName = `train/${ctx.session.targetUserId}/${Date.now()}_${path.basename(zipPath)}`
    const zipBuffer = await fs.promises.readFile(zipPath)

    const { data: uploadData, error: uploadError } = await serviceClient.storage
      .from('images')
      .upload(zipFileName, zipBuffer, {
        contentType: 'application/zip',
        upsert: true,
      })

    if (uploadError) {
      throw new Error(
        `Failed to upload ZIP to Supabase: ${uploadError.message}`
      )
    }

    const { data: publicUrlData } = serviceClient.storage
      .from('images')
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
      '[uploadTrainFluxModelScene] Sending Inngest event (единственный источник правды):',
      {
        modelName: ctx.session.modelName,
        triggerWord,
        steps: ctx.session.steps,
        zipUrl, // HTTP URL из Supabase
        bot_name,
      }
    )

    try {
      // ✅ Используем единственный источник правды - прямой inngest клиент
      await inngest.send({
        name: 'model/training.start',
        data: {
          bot_name,
          is_ru: isRu,
          modelName: ctx.session.modelName,
          steps: ctx.session.steps,
          telegram_id: ctx.session.targetUserId.toString(),
          triggerWord,
          zipUrl, // ✅ HTTP URL из Supabase (Inngest лимит 256KB на событие)
          gender,
        },
      })

      console.log(
        '[uploadTrainFluxModelScene] ✅ Inngest event sent successfully'
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
