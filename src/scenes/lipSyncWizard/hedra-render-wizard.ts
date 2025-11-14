/**
 * 🎭 HEDRA RENDER WIZARD
 *
 * AI Reels генерация через render-server с Hedra
 *
 * Процесс:
 * 1. Загрузка фото аватара
 * 2. Загрузка обложки
 * 3. Ввод текста или голосового сообщения
 * 4. Ввод intro text (2 части)
 * 5. Отправка на render-server через Inngest
 */

import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import {
  sendRenderAvatarVideoEvent,
  createRenderAvatarPayload,
} from '@/inngest_app/render-server-client'
import { calculateAIReelsPrice, formatPriceMessage } from '@/helpers/ai-reels-pricing'

logger.info('📦 [HEDRA RENDER WIZARD] Module loaded')

export const hedraRenderWizard = new Scenes.WizardScene<MyContext>(
  'hedra_render_wizard',

  // Step 0: Запрос фото аватара
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎭 [HEDRA RENDER] Wizard started', { telegramId })

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    // Инициализируем сессию
    ctx.session.aiReelsRender = {
      avatarService: 'hedra',
      step: 'image',
      startTime: Date.now(),
    }

    await ctx.reply(
      isRu
        ? '🎭 <b>Hedra Avatar Generation</b>\n\n📸 Отправьте фото или URL изображения с лицом для аватара.'
        : '🎭 <b>Hedra Avatar Generation</b>\n\n📸 Send a photo or image URL with a face for avatar.',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'hedra_cancel')],
        ]),
      }
    )

    return ctx.wizard.next()
  },

  // Step 1: Обработка фото аватара
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    const telegramId = ctx.from?.id?.toString()
    let imageUrl: string | null = null

    logger.info('🎭 [HEDRA RENDER] Step 1 - Processing avatar image', {
      telegramId,
      hasPhoto: message && 'photo' in message,
      hasText: message && 'text' in message,
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
      // Обработка фото из Telegram
      if (message && 'photo' in message && message.photo.length > 0) {
        const photo = message.photo[message.photo.length - 1]
        const fileLink = await ctx.telegram.getFileLink(photo.file_id)
        const response = await fetch(fileLink.href)

        if (!response.ok) {
          throw new Error(`Failed to download photo: ${response.statusText}`)
        }

        const imageBuffer = Buffer.from(await response.arrayBuffer())

        // Загружаем в Supabase Storage
        const { createClient } = await import('@supabase/supabase-js')
        const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import('@/config')

        const serviceClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
        const fileName = `hedra-avatars/${telegramId}/${Date.now()}.jpg`

        const { error: uploadError } = await serviceClient.storage
          .from('images')
          .upload(fileName, imageBuffer, {
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`)
        }

        const { data: urlData } = serviceClient.storage.from('images').getPublicUrl(fileName)
        imageUrl = urlData.publicUrl

        logger.info('✅ [HEDRA RENDER] Avatar photo uploaded', {
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

      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        imageUrl,
        step: 'cover',
      }

      await ctx.reply(
        isRu
          ? '✅ Изображение аватара получено!\n\n🖼️ Теперь отправьте обложку (фото для превью видео):'
          : '✅ Avatar image received!\n\n🖼️ Now send cover image (video preview thumbnail):'
      )

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ [HEDRA RENDER] Image processing error', { error })
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке изображения.'
          : '❌ Error processing image.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 2: Загрузка обложки
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎭 [HEDRA RENDER] Step 2 - Processing cover image', { telegramId })

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    try {
      let coverUrl: string | null = null

      // Обработка фото обложки
      if (message && 'photo' in message && message.photo.length > 0) {
        const photo = message.photo[message.photo.length - 1]
        const fileLink = await ctx.telegram.getFileLink(photo.file_id)
        const response = await fetch(fileLink.href)

        if (!response.ok) {
          throw new Error(`Failed to download cover: ${response.statusText}`)
        }

        const imageBuffer = Buffer.from(await response.arrayBuffer())

        // Загружаем в Supabase Storage
        const { createClient } = await import('@supabase/supabase-js')
        const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import('@/config')

        const serviceClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
        const fileName = `hedra-covers/${telegramId}/${Date.now()}.jpg`

        const { error: uploadError } = await serviceClient.storage
          .from('images')
          .upload(fileName, imageBuffer, {
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Supabase upload failed: ${uploadError.message}`)
        }

        const { data: urlData } = serviceClient.storage.from('images').getPublicUrl(fileName)

        coverUrl = urlData.publicUrl

        logger.info('✅ [HEDRA RENDER] Cover image uploaded', {
          telegramId,
          coverUrl,
        })
      } else {
        await ctx.reply(
          isRu
            ? '❌ Пожалуйста, отправьте фото для обложки.'
            : '❌ Please send a photo for the cover.'
        )
        return
      }

      // Сохраняем URL обложки в сессию
      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        coverUrl,
        step: 'text',
      }

      await ctx.reply(
        isRu
          ? '✅ Обложка получена!\n\n📝 Теперь отправьте текст (до 5000 символов) или голосовое сообщение (до 30 сек):'
          : '✅ Cover received!\n\n📝 Now send text (up to 5000 characters) or voice message (up to 30 sec):'
      )

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ [HEDRA RENDER] Cover processing error', { error })
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке обложки.'
          : '❌ Error processing cover.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 3: Обработка текста/голоса
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎭 [HEDRA RENDER] Step 3 - Processing text/voice', { telegramId })

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

      // Обработка голосового сообщения
      if (message && 'voice' in message) {
        const voice = message.voice

        if ((voice as any).duration > 30) {
          await ctx.reply(
            isRu
              ? `❌ Голосовое сообщение слишком длинное (${(voice as any).duration} сек). Максимум: 30 секунд.`
              : `❌ Voice message is too long (${(voice as any).duration} sec). Maximum: 30 seconds.`
          )
          return ctx.scene.leave()
        }

        // Скачиваем и загружаем голос
        const fileLink = await ctx.telegram.getFileLink(voice.file_id)
        const response = await fetch(fileLink.href)
        const audioBuffer = Buffer.from(await response.arrayBuffer())

        const { createClient } = await import('@supabase/supabase-js')
        const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import('@/config')

        const serviceClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
        const fileName = `hedra-audio/${telegramId}/${Date.now()}.ogg`

        const { error: uploadError } = await serviceClient.storage
          .from('images')
          .upload(fileName, audioBuffer, {
            contentType: 'audio/ogg',
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`)
        }

        const { data: urlData } = serviceClient.storage.from('images').getPublicUrl(fileName)
        audioUrl = urlData.publicUrl
        text = `voice_message_${(voice as any).duration}`
      }
      // Обработка текста
      else if (message && 'text' in message) {
        text = message.text.trim()

        if (text.length === 0 || text.length > 5000) {
          await ctx.reply(
            isRu
              ? '❌ Текст должен быть от 1 до 5000 символов.'
              : '❌ Text must be between 1 and 5000 characters.'
          )
          return ctx.scene.leave()
        }

        // Template 2: НЕ генерируем аудио локально!
        // Текст передается напрямую в render-server, который сам генерирует аудио
        logger.info('📝 [HEDRA RENDER] Текст получен, будет передан в render-server', {
          telegramId,
          textLength: text.length,
        })
      } else {
        await ctx.reply(
          isRu
            ? '❌ Пожалуйста, отправьте текст или голосовое сообщение.'
            : '❌ Please send text or voice message.'
        )
        return ctx.scene.leave()
      }

      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        text,
        audioUrl,
        step: 'intro_text',
      }

      // Оценка длительности для расчета стоимости
      let estimatedDuration = 10 // секунд по умолчанию

      if (audioUrl && 'voice' in message) {
        // Для голоса - точная длительность
        estimatedDuration = (message.voice as any).duration || 10
      } else {
        // Для текста - оценка (~2.5 слова в секунду, среднее чтение)
        const words = text.split(/\s+/).length
        estimatedDuration = Math.ceil(words / 2.5)
      }

      // Сохраняем длительность для расчета цены
      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        estimatedDuration,
      }

      await ctx.reply(
        isRu
          ? `✅ Текст получен!\n\n` +
              `📝 Теперь введите <b>первую часть</b> заголовка для обложки:\n\n` +
              `🎨 <b>Это будет составной заголовок из двух частей:</b>\n` +
              `• Первая часть: [ваш текст] (до 50 символов)\n` +
              `• Вторая часть: [будет запрошена далее]\n\n` +
              `💡 <i>Например: "ФОТОРЕАЛЬНЫЙ АВАТАР"</i>`
          : `✅ Text received!\n\n` +
              `📝 Now enter the <b>first part</b> of the cover title:\n\n` +
              `🎨 <b>This will be a composite title with two parts:</b>\n` +
              `• First part: [your text] (up to 50 characters)\n` +
              `• Second part: [will be requested next]\n\n` +
              `💡 <i>For example: "PHOTOREALISTIC AVATAR"</i>`,
        { parse_mode: 'HTML' }
      )

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ [HEDRA RENDER] Text/voice processing error', { error })
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке данных.'
          : '❌ Error processing data.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 4: Ввод текста интро для обложки (часть 1)
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎭 [HEDRA RENDER] Step 4 - Intro text input (part 1)', {
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

    // Обработка текста интро
    if (ctx.message && 'text' in ctx.message) {
      const introText = ctx.message.text.trim()

      if (introText.length === 0 || introText.length > 50) {
        await ctx.reply(
          isRu
            ? '❌ Текст интро должен быть от 1 до 50 символов.'
            : '❌ Intro text must be between 1 and 50 characters.'
        )
        return ctx.scene.leave()
      }

      // Сохраняем первый текст интро
      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        introText1: introText,
        step: 'intro_text_2',
      }

      await ctx.reply(
        isRu
          ? `✅ Первая часть заголовка: "${introText}"\n\n` +
              `📝 Теперь введите <b>вторую часть</b> заголовка (до 50 символов):\n\n` +
              `💡 <i>Например: "NEWS", "TECH", "AI"</i>`
          : `✅ First part of title: "${introText}"\n\n` +
              `📝 Now enter the <b>second part</b> of title (up to 50 characters):\n\n` +
              `💡 <i>For example: "NEWS", "TECH", "AI"</i>`,
        { parse_mode: 'HTML' }
      )

      return ctx.wizard.next()
    } else {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте текст для интро (до 50 символов).'
          : '❌ Please send intro text (up to 50 characters).'
      )
      return ctx.scene.leave()
    }
  },

  // Step 5: Ввод второго текста интро и отправка на render-server
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎭 [HEDRA RENDER] Step 5 - Intro text part 2 and sending', {
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

    // Обработка второго текста интро
    if (ctx.message && 'text' in ctx.message) {
      const introText2 = ctx.message.text.trim()

      if (introText2.length === 0 || introText2.length > 50) {
        await ctx.reply(
          isRu
            ? '❌ Второй текст интро должен быть от 1 до 50 символов.'
            : '❌ Second intro text must be between 1 and 50 characters.'
        )
        return ctx.scene.leave()
      }

      // Сохраняем второй текст интро
      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        introText2: introText2,
        upperIntroText: introText2,
        step: 'processing',
      }

      // Расчет стоимости
      const priceBreakdown = calculateAIReelsPrice({
        text: ctx.session.aiReelsRender.text || '',
        avatarService: 'hedra',
        isOwnHeyGenKey: false,
        isOwnFalKey: false,
        markupMultiplier: 1.5,
      })

      const estimatedCost = priceBreakdown.finalPrice

      // Показываем расчет стоимости
      await ctx.reply(formatPriceMessage(priceBreakdown, isRu))

      // Проверка баланса
      const currentBalance = await getUserBalance(telegramId)

      if (currentBalance === null || currentBalance < estimatedCost) {
        const insufficientMessage = isRu
          ? `💰 Недостаточно средств\n\n${formatPriceMessage(priceBreakdown, isRu)}\n\n❌ У вас: ${(currentBalance || 0).toFixed(0)}⭐\n💳 Необходимо пополнить: ${(estimatedCost - (currentBalance || 0)).toFixed(0)}⭐`
          : `💰 Insufficient funds\n\n${formatPriceMessage(priceBreakdown, false)}\n\n❌ You have: ${(currentBalance || 0).toFixed(0)}⭐\n💳 Need to top up: ${(estimatedCost - (currentBalance || 0)).toFixed(0)}⭐`

        await ctx.reply(insufficientMessage)
        return ctx.scene.leave()
      }

      // Списание средств
      await updateUserBalance(
        telegramId,
        -estimatedCost,
        PaymentType.SERVICE_PAYMENT,
        'AI Reels Hedra',
        {
          bot_name: ctx.botInfo?.username || 'unknown_bot',
          service_type: 'hedra_render',
        }
      )

      // Получаем voice_id пользователя
      const { getVoiceId } = await import('@/core/supabase/getVoiceId')
      const voiceIdToUse = await getVoiceId(telegramId)

      if (!voiceIdToUse) {
        await ctx.reply(
          isRu
            ? '❌ У вас не настроен голос аватара. Создайте голос сначала.'
            : '❌ You dont have avatar voice configured.'
        )
        // Возвращаем средства
        await updateUserBalance(
          telegramId,
          estimatedCost,
          PaymentType.MONEY_INCOME,
          'Refund: No voice ID',
          {
            bot_name: ctx.botInfo?.username || 'unknown_bot',
            service_type: 'refund',
          }
        )
        return ctx.scene.leave()
      }

      // Создаем payload
      const payload = createRenderAvatarPayload(
        telegramId,
        ctx.session.aiReelsRender.text || '',
        ctx.session.aiReelsRender.imageUrl || '',
        voiceIdToUse,
        {
          coverUrl:
            ctx.session.aiReelsRender.coverUrl ||
            'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
          introText1: ctx.session.aiReelsRender.introText1 || 'Ai-Stars',
          introText2: introText2,
          avatarService: 'hedra',
          botName: ctx.botInfo?.username || 'MetaMuse_Manifest_bot',
        }
      )

      // Отправка на render-server
      try {
        const { eventId } = await sendRenderAvatarVideoEvent(payload)

        await ctx.reply(
          isRu
            ? `✅ Запрос отправлен на render-server!\n\n` +
                `🔄 Event ID: ${eventId}\n` +
                `🎭 Сервис: Hedra\n` +
                `⏱️ Ожидаемое время: 2-3 минут\n` +
                `📢 Вы получите уведомление когда видео будет готово\n\n` +
                `💰 Списано: ${estimatedCost}⭐\n` +
                `💳 Новый баланс: ${(currentBalance - estimatedCost).toFixed(2)}⭐`
            : `✅ Request sent to render-server!\n\n` +
                `🔄 Event ID: ${eventId}\n` +
                `🎭 Service: Hedra\n` +
                `⏱️ Expected time: 2-3 minutes\n` +
                `📢 You will receive notification when video is ready\n\n` +
                `💰 Charged: ${estimatedCost}⭐\n` +
                `💳 New balance: ${(currentBalance - estimatedCost).toFixed(2)}⭐`,
          { parse_mode: 'HTML' }
        )

        logger.info('✅ [HEDRA RENDER] Event sent successfully', {
          telegramId,
          eventId,
          cost: estimatedCost,
        })
      } catch (error) {
        logger.error('❌ [HEDRA RENDER] Error sending event', { error })

        // Возврат средств при ошибке
        await updateUserBalance(
          telegramId,
          estimatedCost,
          PaymentType.MONEY_INCOME,
          'Refund: Hedra Render error',
          {
            bot_name: ctx.botInfo?.username || 'unknown_bot',
            service_type: 'refund',
          }
        )

        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при отправке запроса. Средства возвращены.'
            : '❌ Error sending request. Funds refunded.'
        )
      }

      // Очистка сессии
      delete ctx.session.aiReelsRender

      return ctx.scene.leave()
    } else {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте второй текст для интро (до 50 символов).'
          : '❌ Please send second intro text (up to 50 characters).'
      )
      return ctx.scene.leave()
    }
  }
)

// Обработчик кнопки отмены
hedraRenderWizard.action('hedra_cancel', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    logger.info('🎭 [HEDRA RENDER] User cancelled wizard', {
      telegramId: ctx.from?.id,
    })

    await ctx.reply(
      isRu
        ? '❌ Процесс отменён. Возвращаюсь в главное меню.'
        : '❌ Process cancelled. Returning to main menu.',
      {
        reply_markup: {
          remove_keyboard: true,
        },
      }
    )

    // Очистка сессии
    if (ctx.session.aiReelsRender) {
      delete ctx.session.aiReelsRender
    }

    await ctx.scene.leave()
  } catch (error) {
    logger.error('❌ [HEDRA RENDER] Error handling cancel', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

export default hedraRenderWizard
