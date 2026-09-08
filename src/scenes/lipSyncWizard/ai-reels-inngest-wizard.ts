/**
 * 🔄 AI REELS INNGEST WIZARD
 *
 * Асинхронная генерация AI Reels через Inngest
 * Поддерживает кастомные параметры (Hedra, ElevenLabs, etc)
 */

import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import {
  sendAIReelsEvent,
  checkInngestAvailability,
} from '@/inngest_app/send-event'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { calculateLipSyncCostStars } from '@/config/lipsync-models.config'
import { WAN25ModelType, calculateWAN25CostStars } from '@/config/wan25-config'
import { PUBLIC_URL } from '@/config'
import { standardButtons } from '@/navigation/helpers/actionButtons'
import { reportDeadEnd } from '@/helpers/error/reportDeadEnd'

export const aiReelsInngestWizard = new Scenes.WizardScene<MyContext>(
  'ai_reels_inngest_wizard',

  // Step 0: Проверка Inngest и запрос изображения
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🔄 [AI REELS INNGEST] Wizard started', { telegramId })

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    // Проверяем доступность Inngest
    const inngestAvailable = await checkInngestAvailability()

    if (!inngestAvailable) {
      await ctx.reply(
        isRu
          ? '❌ Сервис временно недоступен. Попробуйте позже или используйте быстрый режим (WAN 2.5).'
          : '❌ Service temporarily unavailable. Try later or use fast mode (WAN 2.5).'
      )
      return ctx.scene.leave()
    }

    // Инициализируем сессию
    ctx.session.aiReels = {
      step: 'image',
      startTime: Date.now(),
      useInngest: true,
    }

    await ctx.reply(
      isRu
        ? '🔄 <b>AI Reels - Надежный режим (Inngest)</b>\n\n' +
            '✨ Преимущества:\n' +
            '• 🔄 Автоматические повторы при ошибках\n' +
            '• ⏱️ Работает в фоне\n' +
            '• 📢 Уведомление при готовности\n' +
            '• 🛡️ Защита от сбоев\n\n' +
            '📸 Отправьте фото или URL изображения с лицом для lip-sync видео.'
        : '🔄 <b>AI Reels - Reliable mode (Inngest)</b>\n\n' +
            '✨ Benefits:\n' +
            '• 🔄 Automatic retries on errors\n' +
            '• ⏱️ Background processing\n' +
            '• 📢 Notification when ready\n' +
            '• 🛡️ Failure protection\n\n' +
            '📸 Send a photo or image URL with a face for lip-sync video.',
      {
        parse_mode: 'HTML',
        reply_markup: { remove_keyboard: true },
      }
    )

    return ctx.wizard.next()
  },

  // Step 1: Обработка изображения
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    let imageUrl: string | null = null

    logger.info('🔄 [AI REELS INNGEST] Step 1 - Processing image', {
      telegramId: ctx.from?.id?.toString(),
    })

    try {
      // Обработка фото из Telegram
      if (message && 'photo' in message && message.photo.length > 0) {
        const photo = message.photo[message.photo.length - 1]
        const telegramId = ctx.from?.id?.toString()

        const fileLink = await ctx.telegram.getFileLink(photo.file_id)
        const response = await fetch(fileLink.href, {
          signal: AbortSignal.timeout(60_000),
        })

        if (!response.ok) {
          throw new Error(`Failed to download photo: ${response.statusText}`)
        }

        const imageBuffer = Buffer.from(await response.arrayBuffer())

        // Загружаем в Supabase Storage
        const { createClient } = await import('@supabase/supabase-js')
        const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import(
          '@/config'
        )

        const serviceClient = createClient(
          SUPABASE_URL!,
          SUPABASE_SERVICE_ROLE_KEY!
        )
        const fileName = `ai-reels-inngest/${telegramId}/${Date.now()}.jpg`

        const { error: uploadError } = await serviceClient.storage
          .from('images')
          .upload(fileName, imageBuffer, {
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`)
        }

        const { data: urlData } = serviceClient.storage
          .from('images')
          .getPublicUrl(fileName)
        imageUrl = urlData.publicUrl

        logger.info('✅ [AI REELS INNGEST] Photo uploaded', {
          telegramId,
          imageUrl: imageUrl.substring(0, 100),
        })
      }
      // Обработка URL
      else if (message && 'text' in message) {
        const text = message.text.trim()
        if (text.startsWith('http://') || text.startsWith('https://')) {
          imageUrl = text
        }
      }

      if (!imageUrl) {
        await ctx.reply(
          isRu
            ? '❌ Некорректное изображение. Отправьте фото или URL.'
            : '❌ Invalid image. Send a photo or URL.'
        )
        return ctx.scene.leave()
      }

      ctx.session.aiReels = {
        ...ctx.session.aiReels,
        imageUrl,
        step: 'text',
      }

      await ctx.reply(
        isRu
          ? '✅ Изображение получено!\n\n' +
              '📝 Отправьте текст (до 500 символов) или голосовое сообщение (до 30 сек).'
          : '✅ Image received!\n\n' +
              '📝 Send text (up to 500 characters) or voice message (up to 30 sec).'
      )

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ [AI REELS INNGEST] Image processing error', { error })
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке изображения.'
          : '❌ Error processing image.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 2: Обработка текста/голоса и отправка в Inngest
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    const telegramId = ctx.from?.id?.toString()

    logger.info('🔄 [AI REELS INNGEST] Step 2 - Sending to Inngest', {
      telegramId,
    })

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    try {
      let text: string = ''
      let audioUrl: string | null = null
      const imageUrl = ctx.session.aiReels?.imageUrl

      if (!imageUrl) {
        await reportDeadEnd(ctx, 'ai-reels-inngest-wizard', [
          'aiReels.imageUrl',
        ])
        await ctx.reply(
          isRu ? '❌ Изображение не найдено.' : '❌ Image not found.'
        )
        return ctx.scene.leave()
      }

      // Обработка голосового сообщения
      if (message && 'voice' in message) {
        const voice = message.voice

        if (voice.duration > 30) {
          await ctx.reply(
            isRu
              ? `❌ Голосовое сообщение слишком длинное (${voice.duration} сек). Максимум: 30 секунд.`
              : `❌ Voice message is too long (${voice.duration} sec). Maximum: 30 seconds.`
          )
          return ctx.scene.leave()
        }

        // Скачиваем и загружаем голос
        const fileLink = await ctx.telegram.getFileLink(voice.file_id)
        const response = await fetch(fileLink.href, {
          signal: AbortSignal.timeout(60_000),
        })
        const audioBuffer = Buffer.from(await response.arrayBuffer())

        const { createClient } = await import('@supabase/supabase-js')
        const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import(
          '@/config'
        )

        const serviceClient = createClient(
          SUPABASE_URL!,
          SUPABASE_SERVICE_ROLE_KEY!
        )
        const fileName = `ai-reels-inngest-audio/${telegramId}/${Date.now()}.ogg`

        const { error: uploadError } = await serviceClient.storage
          .from('images')
          .upload(fileName, audioBuffer, {
            contentType: 'audio/ogg',
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`)
        }

        const { data: urlData } = serviceClient.storage
          .from('images')
          .getPublicUrl(fileName)
        audioUrl = urlData.publicUrl
        text = `voice_message_${voice.duration}`
      }
      // Обработка текста
      else if (message && 'text' in message) {
        text = message.text.trim()

        if (text.length === 0 || text.length > 500) {
          await ctx.reply(
            isRu
              ? '❌ Текст должен быть от 1 до 500 символов.'
              : '❌ Text must be between 1 and 500 characters.'
          )
          return ctx.scene.leave()
        }
      } else {
        await ctx.reply(
          isRu
            ? '❌ Пожалуйста, отправьте текст или голосовое сообщение.'
            : '❌ Please send text or voice message.'
        )
        return ctx.scene.leave()
      }

      // Расчет стоимости
      const estimatedDurationSeconds = audioUrl
        ? parseInt(text.match(/voice_message_(\d+)/)?.[1] || '10', 10)
        : Math.ceil(text.length / 15)

      const resolution = ctx.session.aiReels?.resolution || '720p'
      const lipSyncCost = calculateLipSyncCostStars(
        'veed_fabric',
        estimatedDurationSeconds,
        '720p'
      )
      const wan25Cost = calculateWAN25CostStars(
        WAN25ModelType.IMAGE_TO_VIDEO,
        5,
        resolution
      )
      const mergingCost = Math.ceil(lipSyncCost * 0.2)
      const totalCost = lipSyncCost + wan25Cost + mergingCost

      // Проверка баланса
      const currentBalance = await getUserBalance(telegramId)

      if (currentBalance === null || currentBalance < totalCost) {
        // A refusal that names the price hands over the way to pay it: the
        // person asked for something paid and was told the only obstacle is
        // money, and it carried nothing to press.
        await ctx.reply(
          isRu
            ? `💰 Недостаточно средств\n\nТребуется: ${totalCost.toFixed(2)}⭐\nУ вас: ${(currentBalance || 0).toFixed(2)}⭐`
            : `💰 Insufficient funds\n\nRequired: ${totalCost.toFixed(2)}⭐\nYou have: ${(currentBalance || 0).toFixed(2)}⭐`,
          standardButtons(isRu)
        )
        return ctx.scene.leave()
      }

      // Charge the balance.
      //
      // The result is checked, not discarded. updateUserBalance returns false
      // WITHOUT throwing when the payer row is missing or the insert fails, and
      // the old code ignored that: the Inngest event was sent anyway, so the
      // generation would have run unpaid, and the user was then told a charged
      // amount and a new balance computed by subtraction -- two claims that
      // were not checked against anything.
      //
      // This scene is not registered, so none of that reached a user; the fix
      // stands because the shape is wrong, not because it was firing.
      //
      // Bailing here is the same shape aiCoverWizard uses: paid work only runs
      // once a charge is real.
      const charged = await updateUserBalance(
        telegramId,
        totalCost,
        PaymentType.MONEY_OUTCOME,
        'AI Reels Inngest (lip-sync + WAN 2.5 + merging)',
        {
          bot_name: ctx.botInfo?.username || 'unknown_bot',
          service_type: 'ai_reels_inngest',
        }
      )

      if (!charged) {
        logger.error(
          '[AI_REELS_INNGEST] charge failed — generation not started',
          {
            telegramId,
            totalCost,
          }
        )
        await ctx.reply(
          isRu
            ? '❌ Не удалось списать средства. Генерация не запущена, попробуйте ещё раз.'
            : '❌ Failed to deduct the stars. Generation was not started, please try again.'
        )
        return ctx.scene.leave()
      }

      // Отправляем событие в Inngest
      const { eventId } = await sendAIReelsEvent({
        telegramId,
        imageUrl,
        text,
        audioUrl: audioUrl || undefined,
        resolution,
        botName: ctx.botInfo?.username || 'unknown_bot',
        // Домен берётся из конфигурации, а не зашивается. Здесь стояло
        // https://three-head-dragon.shop — старый сервер (188.137.250.69), с
        // которого проект переехал на Railway и который не отвечает вовсе.
        // Этот URL уходит внешнему провайдеру как адрес коллбэка, а сразу
        // после него человеку пишут «списано N ⭐» и «вы получите уведомление
        // когда видео будет готово». Деньги списывались за результат, которому
        // некуда вернуться.
        webhookUrl: `${PUBLIC_URL}/api/telegram/ai-reels-callback`,
      })

      await ctx.reply(
        isRu
          ? `✅ Запрос отправлен в обработку!\n\n` +
              `🔄 Генерация запущена (ID: ${eventId})\n` +
              `⏱️ Ожидаемое время: 3-5 минут\n` +
              `📢 Вы получите уведомление когда видео будет готово\n\n` +
              `💰 Списано: ${totalCost.toFixed(2)}⭐\n` +
              `💳 Новый баланс: ${(currentBalance - totalCost).toFixed(2)}⭐`
          : `✅ Request sent for processing!\n\n` +
              `🔄 Generation started (ID: ${eventId})\n` +
              `⏱️ Expected time: 3-5 minutes\n` +
              `📢 You will receive notification when video is ready\n\n` +
              `💰 Charged: ${totalCost.toFixed(2)}⭐\n` +
              `💳 New balance: ${(currentBalance - totalCost).toFixed(2)}⭐`,
        { parse_mode: 'HTML' }
      )

      logger.info('✅ [AI REELS INNGEST] Event sent successfully', {
        telegramId,
        eventId,
        totalCost,
      })

      // Очищаем сессию
      delete ctx.session.aiReels

      return ctx.scene.leave()
    } catch (error) {
      logger.error('❌ [AI REELS INNGEST] Error sending event', { error })

      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при отправке запроса. Попробуйте позже.'
          : '❌ Error sending request. Try again later.'
      )

      return ctx.scene.leave()
    }
  }
)

export default aiReelsInngestWizard
