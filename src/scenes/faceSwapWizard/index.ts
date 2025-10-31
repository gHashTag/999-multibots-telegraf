/**
 * 🎭 FACE SWAP WIZARD
 *
 * Замена лица на изображении с помощью Replicate API
 * Модель: codeplugtech/face-swap
 */

import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { generateFaceSwap } from '@/services/generateFaceSwap'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'

export const faceSwapWizard = new Scenes.WizardScene<MyContext>(
  'face_swap',

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
        ? '🎭 <b>Замена лица</b>\n\n' +
            'Загрузите фото человека, на которого хотите заменить лицо.\n\n' +
            '📋 <b>Требования:</b>\n' +
            '• Лицо чётко видно\n' +
            '• Анфас (прямо в камеру)\n' +
            '• Хорошее освещение\n\n' +
            '💰 <b>Стоимость:</b> 10 ⭐'
        : '🎭 <b>Face Swap</b>\n\n' +
            'Upload photo of the person whose face you want to swap.\n\n' +
            '📋 <b>Requirements:</b>\n' +
            '• Face clearly visible\n' +
            '• Frontal angle\n' +
            '• Good lighting\n\n' +
            '💰 <b>Cost:</b> 10 ⭐',
      { parse_mode: 'HTML' }
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

    // Validate photo received
    if (!('message' in ctx.update) || !('photo' in ctx.update.message)) {
      await ctx.reply(
        isRu ? '❌ Пожалуйста, отправьте фото.' : '❌ Please send a photo.'
      )
      return
    }

    const photo = ctx.update.message.photo
    const fileId = photo[photo.length - 1].file_id

    // Get Telegram file link
    const file = await ctx.telegram.getFile(fileId)
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

    // Get Telegram file link
    const file = await ctx.telegram.getFile(fileId)
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

    if (balance < requiredStars) {
      await ctx.reply(
        isRu
          ? `❌ Недостаточно звезд для замены лица.\n\n💰 Требуется: ${requiredStars} ⭐\n💰 У вас: ${balance.toFixed(1)} ⭐\n\nПополните баланс командой /balance`
          : `❌ Insufficient stars for face swap.\n\n💰 Required: ${requiredStars} ⭐\n💰 You have: ${balance.toFixed(1)} ⭐\n\nTop up with /balance`
      )
      return ctx.scene.leave()
    }

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
      await ctx.reply(
        isRu
          ? `❌ Ошибка при замене лица: ${result.error || 'Неизвестная ошибка'}\n\nПопробуйте другие фотографии.`
          : `❌ Face swap error: ${result.error || 'Unknown error'}\n\nTry different photos.`
      )
      return ctx.scene.leave()
    }

    // Charge user
    const charged = await updateUserBalance(
      telegramId!,
      -requiredStars,
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
      logger.error('[FACE SWAP] Failed to charge user', { telegramId })
    }

    // Send result
    await ctx.replyWithPhoto(result.resultUrl, {
      caption: isRu
        ? `✅ Готово! Лицо успешно заменено.\n\n⏱️ Время обработки: ${Math.round((result.processingTime || 0) / 1000)} сек\n💰 Списано: ${requiredStars} ⭐`
        : `✅ Done! Face swap completed.\n\n⏱️ Processing time: ${Math.round((result.processingTime || 0) / 1000)} sec\n💰 Charged: ${requiredStars} ⭐`,
    })

    logger.info('✅ [FACE SWAP] Wizard completed successfully', {
      telegramId,
      processingTime: result.processingTime,
      charged,
    })

    return ctx.scene.leave()
  }
)

export default faceSwapWizard
