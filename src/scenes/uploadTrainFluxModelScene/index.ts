/**
 * Scene: Upload and Train Flux Model
 *
 * Flow:
 * 1. Create ZIP from session images
 * 2. Upload ZIP to Supabase Storage (bypasses Inngest size limit)
 * 3. Send Inngest event with ZIP URL (not base64)
 * 4. Inngest processes training with Replicate
 */

import { Scenes, Markup } from 'telegraf'
import type { MyContext } from '@/interfaces'
import { createImagesZip } from '@/helpers/images/createImagesZip'
import { ensureSupabaseAuth } from '@/core/supabase'
import { inngest } from '@/inngest_app/client'
import { isRussian } from '@/helpers/language'
import { sendGenericErrorMessage } from '@/navigation'
import { getBotNameByToken } from '@/core/bot'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const uploadTrainFluxModelScene = new Scenes.BaseScene<MyContext>(
  'uploadTrainFluxModelScene'
)

uploadTrainFluxModelScene.enter(async ctx => {
  const isRu = isRussian(ctx)
  console.log('Scene: ZIP')

  try {
    await ctx.reply(isRu ? '⏳ Создаю архив...' : '⏳ Creating archive...')

    const zipPath = await createImagesZip(ctx.session.images)
    console.log('ZIP created at:', zipPath)

    await ensureSupabaseAuth()

    // Get gender from scene state or session
    const sceneState = ctx.scene.state as any
    const gender = sceneState?.gender || (ctx.session as any).gender

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

    // Use triggerWord from session (set in digitalAvatarBodyWizard)
    const triggerWord =
      ctx.session.triggerWord ||
      ctx.session.modelName?.toUpperCase() ||
      ctx.session.username?.toUpperCase()

    if (!triggerWord) {
      await ctx.reply(
        isRu ? '❌ Некорректный trigger word' : '❌ Invalid trigger word'
      )
      return ctx.scene.leave()
    }

    console.log(
      '[uploadTrainFluxModelScene] Using triggerWord from session:',
      triggerWord
    )

    console.log('[uploadTrainFluxModelScene] Using LOCAL training on bot-farm')

    await ctx.reply(
      isRu
        ? `⏳ Начинаю обучение модели...\n\nВаша модель будет натренирована через 1-2 часа. После завершения вы сможете проверить её работу, используя раздел "Модели" в Нейрофото.`
        : `⏳ Starting model training...\n\nYour model will be trained in 1-2 hours. Once completed, you can check its performance using "Models" section in Neurophoto.`
    )

    // Get correct bot name from token
    const botToken = ctx.telegram.token || ctx.botInfo?.token
    const { bot_name } = getBotNameByToken(botToken)

    // Upload ZIP file to Supabase Storage (bypasses Inngest 256KB size limit)
    // Base64 ZIP file can be >1MB, so we use URL instead of base64
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
    // Log the object path, not the public URL. This ZIP holds the user's face
    // photos, and getPublicUrl on a public bucket is a permanent, unauthenticated
    // link — it must not sit in aggregated logs (same class as #1105). The bucket
    // being public at all is the larger exposure and is owner-side: a private
    // bucket + signed URLs.
    console.log(
      '[uploadTrainFluxModelScene] ZIP uploaded to Supabase:',
      zipFileName
    )

    // Delete local ZIP file after upload
    try {
      await fs.promises.unlink(zipPath)
      console.log('[uploadTrainFluxModelScene] Local ZIP file cleaned up')
    } catch (unlinkError) {
      console.warn(
        '[uploadTrainFluxModelScene] Failed to cleanup local ZIP (non-fatal)',
        unlinkError
      )
    }

    console.log('[uploadTrainFluxModelScene] Sending Inngest event:', {
      modelName: ctx.session.modelName,
      triggerWord,
      steps: ctx.session.steps,
      // path, not the public URL — see the upload log above (biometric ZIP)
      zipFileName,
      bot_name,
    })

    try {
      await inngest.send({
        name: 'model/training.start',
        data: {
          bot_name,
          is_ru: isRu,
          modelName: ctx.session.modelName,
          steps: ctx.session.steps,
          telegram_id: ctx.session.targetUserId.toString(),
          triggerWord,
          zipUrl, // HTTP URL from Supabase (bypasses Inngest size limit)
          gender,
        },
      })
      console.log(
        '[uploadTrainFluxModelScene] ✅ Inngest event sent successfully'
      )
    } catch (eventError: any) {
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
export { uploadTrainFluxModelScene }
