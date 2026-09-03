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

    // The ZIP holds 10+ personal FACE photos — biometric PII. It used to go to
    // the PUBLIC `images` bucket and be handed out via getPublicUrl, so anyone
    // with (or guessing) the URL could download a user's face set. Put it in a
    // PRIVATE bucket and give the training provider a short-lived SIGNED URL
    // instead: the object is never publicly listable and the link expires.
    const TRAINING_BUCKET = 'training-private'
    // Generous margin so a queued training still starts; the object stays
    // private regardless of the link's lifetime.
    const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

    // Idempotent: create the private bucket if it does not exist yet. An
    // "already exists" error (or a transient one) is ignored here — the upload
    // below is the real gate and throws on a genuine failure.
    await serviceClient.storage
      .createBucket(TRAINING_BUCKET, { public: false })
      .catch(() => ({}))

    const { data: uploadData, error: uploadError } = await serviceClient.storage
      .from(TRAINING_BUCKET)
      .upload(zipFileName, zipBuffer, {
        contentType: 'application/zip',
        upsert: true,
      })

    if (uploadError) {
      throw new Error(
        `Failed to upload ZIP to Supabase: ${uploadError.message}`
      )
    }

    // Fail closed — NO public fallback. If a signed URL cannot be minted the
    // training does not start rather than leaking the faces publicly.
    const { data: signedData, error: signedError } = await serviceClient.storage
      .from(TRAINING_BUCKET)
      .createSignedUrl(zipFileName, SIGNED_URL_TTL_SECONDS)

    if (signedError || !signedData?.signedUrl) {
      throw new Error(
        `Failed to sign training ZIP URL: ${
          signedError?.message || 'no signed URL returned'
        }`
      )
    }

    const zipUrl = signedData.signedUrl
    // Do NOT log the URL — the signed token grants access to the face photos.
    console.log('[uploadTrainFluxModelScene] ZIP uploaded to private bucket')

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
    await sendGenericErrorMessage(ctx, isRu)
  } finally {
    // Free and invalidate the consumed training photos. The dataset was zipped
    // and submitted above; leaving the Buffers in the session leaks memory and
    // contaminates the next training (it .push()es onto the leftover array -> a
    // wrong/blended avatar the user paid for). iter201.
    ctx.session.images = []
    await ctx.scene.leave()
  }
})

export default uploadTrainFluxModelScene
export { uploadTrainFluxModelScene }
