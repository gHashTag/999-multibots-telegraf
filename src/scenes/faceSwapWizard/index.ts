/**
 * 🎭 FACE SWAP WIZARD
 *
 * Замена лица на изображении с помощью Replicate API
 * Модель: codeplugtech/face-swap
 */

import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { generateFaceSwap } from '@/services/generateFaceSwap'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { refundAndTell } from '@/price/helpers/refundAndTell'
import { PaymentType } from '@/interfaces/payments.interface'
import { createCancelButton, handleCancelButton } from '@/utils/cancelButton'
import { standardButtons } from '@/navigation/helpers/actionButtons'

export const faceSwapWizard = new Scenes.WizardScene<MyContext>(
  'faceSwapWizard',

  // Step 0: Request target image
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎭 [FACE SWAP] Wizard started', {
      telegramId,
      function: 'faceSwapWizard.step0',
    })

    await ctx.reply(
      isRu
        ? 'Замена лица\n\nЗагрузите фото человека, на которого хотите заменить лицо.\n\nТребования:\n• Лицо чётко видно\n• Анфас (прямо в камеру)\n• Хорошее освещение\n\nСтоимость: 10 ⭐'
        : 'Face Swap\n\nUpload photo of the person whose face you want to swap.\n\nRequirements:\n• Face clearly visible\n• Frontal angle\n• Good lighting\n\nCost: 10 ⭐',
      {
        parse_mode: 'HTML',
        reply_markup: Markup.keyboard([createCancelButton(isRu)])
          .resize()
          .oneTime(),
      }
    )

    return ctx.wizard.next()
  },

  // Step 1: Process target image & request swap image
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎭 [FACE SWAP] Step 1 - Processing target image', {
      telegramId,
      hasPhoto: !!('message' in ctx.update && 'photo' in ctx.update.message),
    })

    // Проверка команды отмены
    const isCancel = await handleCancelButton(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    // Validate photo received
    if (!('message' in ctx.update) || !('photo' in ctx.update.message)) {
      await ctx.reply(
        isRu ? '❌ Пожалуйста, отправьте фото.' : '❌ Please send a photo.'
      )
      return
    }

    const photo = ctx.update.message.photo
    const fileId = photo[photo.length - 1].file_id

    // Get Telegram file link. getFile can throw (transient Telegram error, or a
    // file above the ~20MB Bot API download limit); unguarded it would abort the
    // step and silently drop the user's uploaded photo. Tell them to retry.
    let file
    try {
      file = await ctx.telegram.getFile(fileId)
    } catch (getFileErr) {
      logger.error('[FaceSwap] getFile failed for target photo', {
        error:
          getFileErr instanceof Error ? getFileErr.message : String(getFileErr),
      })
      await ctx.reply(
        isRu
          ? '❌ Не удалось загрузить фото. Попробуйте отправить его ещё раз.'
          : '❌ Could not load the photo. Please send it again.'
      )
      return
    }
    const targetImageUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`

    // Store in session
    ;(ctx.session as any).targetImageUrl = targetImageUrl
    ;(ctx.session as any).targetFileId = fileId

    logger.info('✅ [FACE SWAP] Target image received', {
      telegramId,
      fileId,
    })

    await ctx.reply(
      isRu
        ? '✅ Фото получено!\n\n' +
            'Теперь загрузите второе фото - с лицом, которое хотите использовать.'
        : '✅ Photo received!\n\n' +
            'Now upload the second photo - with the face you want to use.',
      { parse_mode: 'HTML' }
    )

    return ctx.wizard.next()
  },

  // Step 2: Process swap & generate result
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎭 [FACE SWAP] Step 2 - Processing swap image', {
      telegramId,
      hasPhoto: !!('message' in ctx.update && 'photo' in ctx.update.message),
    })

    // Validate photo received
    if (!('message' in ctx.update) || !('photo' in ctx.update.message)) {
      await ctx.reply(
        isRu ? '❌ Пожалуйста, отправьте фото.' : '❌ Please send a photo.'
      )
      return
    }

    const photo = ctx.update.message.photo
    const fileId = photo[photo.length - 1].file_id

    // Get Telegram file link. getFile can throw (transient Telegram error, or a
    // file above the ~20MB Bot API download limit); unguarded it would abort the
    // step and silently drop the user's uploaded photo. Tell them to retry.
    let file
    try {
      file = await ctx.telegram.getFile(fileId)
    } catch (getFileErr) {
      logger.error('[FaceSwap] getFile failed for swap photo', {
        error:
          getFileErr instanceof Error ? getFileErr.message : String(getFileErr),
      })
      await ctx.reply(
        isRu
          ? '❌ Не удалось загрузить фото. Попробуйте отправить его ещё раз.'
          : '❌ Could not load the photo. Please send it again.'
      )
      return
    }
    const swapImageUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`

    const targetImageUrl = (ctx.session as any).targetImageUrl

    if (!targetImageUrl) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не найдено первое фото. Попробуйте еще раз.'
          : '❌ Error: first photo not found. Try again.'
      )
      return ctx.scene.leave()
    }

    logger.info('✅ [FACE SWAP] Swap image received, processing...', {
      telegramId,
      fileId,
      hasTargetUrl: !!targetImageUrl,
    })

    // Check user balance
    const balance = await getUserBalance(telegramId!)
    const requiredStars = 10 // Face swap costs 10 stars

    // Проверка получения баланса
    if (balance === null || balance === undefined || isNaN(balance)) {
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при проверке доступа. Пожалуйста, попробуйте еще раз или начните сначала /start.'
          : '❌ Error checking access. Please try again or start over with /start.'
      )
      logger.error('🎭 [FACE SWAP] Invalid balance received:', {
        telegramId,
        balance,
      })
      return ctx.scene.leave()
    }

    if (balance < requiredStars) {
      // A refusal that names the price hands over the way to pay it. The
      // person asked for something paid and was told the only obstacle is
      // money -- the highest-intent moment there is, and it carried nothing
      // to press.
      await ctx.reply(
        isRu
          ? `❌ Недостаточно звезд для замены лица.\n\n💰 Требуется: ${requiredStars} ⭐\n💰 У вас: ${balance.toFixed(1)} ⭐\n\nПополните баланс командой /balance`
          : `❌ Insufficient stars for face swap.\n\n💰 Required: ${requiredStars} ⭐\n💰 You have: ${balance.toFixed(1)} ⭐\n\nTop up with /balance`,
        standardButtons(isRu)
      )
      return ctx.scene.leave()
    }

    // In-flight guard (same shape as the sibling wizards). This step never
    // advances the cursor — it only leaves at the end — so while the ~10-30s
    // generateFaceSwap await is in flight a second photo re-entered the step and
    // started a second PAID face swap (a double 10⭐ charge and two swaps).
    // Reject before set, set synchronously, release in finally.
    if (ctx.session.faceSwapInProgress) {
      await ctx.reply(
        isRu
          ? '⏳ Уже обрабатываю замену лица, подождите немного...'
          : '⏳ Already processing a face swap, please wait a moment...'
      )
      return
    }
    ctx.session.faceSwapInProgress = true

    try {
      // Send processing message
      const processingMsg = await ctx.reply(
        isRu
          ? '⏳ Обрабатываем замену лица... Это может занять 10-30 секунд.'
          : '⏳ Processing face swap... This may take 10-30 seconds.'
      )

      // Call generateFaceSwap service
      const result = await generateFaceSwap({
        targetImageUrl,
        swapImageUrl,
      })

      // Delete processing message
      try {
        await ctx.telegram.deleteMessage(ctx.chat!.id, processingMsg.message_id)
      } catch (e) {
        // Ignore if message can't be deleted
      }

      if (!result.success || !result.resultUrl) {
        // result.error is the raw provider message. It can carry internal host /
        // request-id / validation detail, and — because the input URLs embed the
        // bot token — a Replicate download failure can echo that token. Log it
        // for admins; show the user a curated message instead (same as #1030).
        logger.warn('🎭 [FACE SWAP] Generation failed', {
          telegramId,
          error: result.error,
        })
        await ctx.reply(
          isRu
            ? '❌ Не удалось выполнить замену лица. Попробуйте другие фотографии.'
            : '❌ Face swap failed. Please try different photos.'
        )
        return ctx.scene.leave()
      }

      // Charge user
      const charged = await updateUserBalance(
        telegramId!,
        // No minus here: the sign is set by `type`. A negative MONEY_OUTCOME
        // would credit money instead of charging. The amount override to
        // metadata.stars inside updateUserBalance was covering for that — an
        // accident, not intent.
        requiredStars,
        PaymentType.MONEY_OUTCOME,
        'Face Swap - Replicate',
        {
          service_type: 'face_swap',
          model_name: 'codeplugtech/face-swap',
          stars: requiredStars,
          processing_time: result.processingTime,
        }
      )

      if (!charged) {
        // The paid generation already ran, but the charge did not go through
        // (a race after the earlier balance check, or a DB error). Do NOT
        // deliver the swap for free with a caption that falsely claims a charge.
        logger.error(
          '[FACE SWAP] Charge failed after generation; not delivering',
          { telegramId }
        )
        await ctx.reply(
          isRu
            ? '❌ Не удалось списать звёзды за замену лица. Попробуйте позже.'
            : '❌ Could not charge stars for the face swap. Please try again later.'
        )
        return ctx.scene.leave()
      }

      // Send result. If delivery throws (oversized / unreachable URL, fetch
      // timeout), the charge above already committed — refund so the user is
      // not billed for a photo they never received.
      try {
        await ctx.replyWithPhoto(result.resultUrl, {
          caption: isRu
            ? `✅ Готово! Лицо успешно заменено.\n\n⏱️ Время обработки: ${Math.round((result.processingTime || 0) / 1000)} сек\n💰 Списано: ${requiredStars} ⭐`
            : `✅ Done! Face swap completed.\n\n⏱️ Processing time: ${Math.round((result.processingTime || 0) / 1000)} sec\n💰 Charged: ${requiredStars} ⭐`,
        })
      } catch (deliveryError) {
        logger.error('[FACE SWAP] Delivery failed after charge; refunding', {
          telegramId,
          error:
            deliveryError instanceof Error
              ? deliveryError.message
              : String(deliveryError),
        })
        await refundAndTell({
          ctx,
          telegramId: telegramId!,
          amount: requiredStars,
          description: 'Face Swap refund - delivery error',
          reason: {
            ru: 'Замена выполнена, но не удалось отправить фото',
            en: 'The swap was completed but the photo could not be sent',
          },
          isRu,
        })
        return ctx.scene.leave()
      }

      logger.info('✅ [FACE SWAP] Wizard completed successfully', {
        telegramId,
        processingTime: result.processingTime,
        charged,
      })

      return ctx.scene.leave()
    } finally {
      ctx.session.faceSwapInProgress = false
    }
  }
)

export default faceSwapWizard
