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
          '💰 <b>Стоимость:</b> 1 ⭐'
        : '🎭 <b>Face Swap</b>\n\n' +
          'Upload photo of the person whose face you want to swap.\n\n' +
          '📋 <b>Requirements:</b>\n' +
          '• Face clearly visible\n' +
          '• Frontal angle\n' +
          '• Good lighting\n\n' +
          '💰 <b>Cost:</b> 1 ⭐',
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
        isRu
          ? '❌ Пожалуйста, отправьте фото.'
          : '❌ Please send a photo.'
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
        isRu
          ? '❌ Пожалуйста, отправьте фото.'
          : '❌ Please send a photo.'
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

    await ctx.reply(
      isRu
        ? '⏳ Обрабатываем... Это может занять 10-30 секунд.'
        : '⏳ Processing... This may take 10-30 seconds.'
    )

    // TODO: Call generateFaceSwap service
    // For now, just show success message
    await ctx.reply(
      isRu
        ? '🎭 Функция замены лица находится в разработке.\n\n' +
          'Скоро будет доступна полная интеграция с Replicate API!'
        : '🎭 Face swap feature is under development.\n\n' +
          'Full Replicate API integration coming soon!'
    )

    logger.info('✅ [FACE SWAP] Wizard completed', { telegramId })

    return ctx.scene.leave()
  }
)

export default faceSwapWizard
