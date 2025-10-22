/**
 * 🎬 AI REELS RENDER WIZARD
 *
 * AI Reels генерация через render-server на Railway с выбором аватара
 *
 * Процесс:
 * 1. Загрузка фото аватара
 * 2. Ввод текста или голосового сообщения
 * 3. ВЫБОР АВАТАРА: Hedra или HeyGen
 * 4. Отправка на render-server через Inngest
 * 5. Получение результата через webhook
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
  checkRenderServerAvailability,
  createRenderAvatarPayload,
} from '@/inngest_app/render-server-client'

logger.info('📦 [AI REELS RENDER WIZARD] Module loaded')

export const aiReelsRenderWizard = new Scenes.WizardScene<MyContext>(
  'ai_reels_render_wizard',

  // Step 0: Проверка render-server и запрос изображения
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS RENDER] Wizard started', { telegramId })

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    // Проверяем доступность render-server
    const isAvailable = await checkRenderServerAvailability()

    if (!isAvailable) {
      await ctx.reply(
        isRu
          ? '❌ Render-server временно недоступен. Попробуйте позже.'
          : '❌ Render-server temporarily unavailable. Try later.'
      )
      return ctx.scene.leave()
    }

    // Инициализируем сессию
    ctx.session.aiReelsRender = {
      step: 'image',
      startTime: Date.now(),
    }

    await ctx.reply(
      isRu
        ? '🎬 <b>AI Reels - Профессиональная генерация</b>\n\n' +
            '✨ Возможности:\n' +
            '• 🎭 Hedra - быстрая генерация lip-sync\n' +
            '• 🎬 HeyGen - премиум качество видео\n' +
            '• 🎤 ElevenLabs - естественный голос\n' +
            '• 🖼️ Автоматические интро и обложки\n\n' +
            '📸 Отправьте фото или URL изображения с лицом для аватара.'
        : '🎬 <b>AI Reels - Professional generation</b>\n\n' +
            '✨ Features:\n' +
            '• 🎭 Hedra - fast lip-sync generation\n' +
            '• 🎬 HeyGen - premium video quality\n' +
            '• 🎤 ElevenLabs - natural voice\n' +
            '• 🖼️ Automatic intros and covers\n\n' +
            '📸 Send a photo or image URL with a face for avatar.',
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

    logger.info('🎬 [AI REELS RENDER] Step 1 - Processing image', {
      telegramId: ctx.from?.id?.toString(),
    })

    try {
      // Обработка фото из Telegram
      if (message && 'photo' in message && message.photo.length > 0) {
        const photo = message.photo[message.photo.length - 1]
        const telegramId = ctx.from?.id?.toString()

        const fileLink = await ctx.telegram.getFileLink(photo.file_id)
        const response = await fetch(fileLink.href)

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
        const fileName = `ai-reels-render/${telegramId}/${Date.now()}.jpg`

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

        logger.info('✅ [AI REELS RENDER] Photo uploaded', {
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
      logger.error('❌ [AI REELS RENDER] Image processing error', { error })
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке изображения.'
          : '❌ Error processing image.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 2: Обработка текста/голоса
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS RENDER] Step 2 - Processing text/voice', {
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
        const response = await fetch(fileLink.href)
        const audioBuffer = Buffer.from(await response.arrayBuffer())

        const { createClient } = await import('@supabase/supabase-js')
        const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import(
          '@/config'
        )

        const serviceClient = createClient(
          SUPABASE_URL!,
          SUPABASE_SERVICE_ROLE_KEY!
        )
        const fileName = `ai-reels-render-audio/${telegramId}/${Date.now()}.ogg`

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
        estimatedDuration = message.voice.duration
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

      // 💰 Динамический расчет цены:
      // - VEO3 Fast (4 видео): 160⭐ × 1.5 = 240⭐
      // - Hedra lip-sync: ~4.9⭐/сек себестоимость × 1.5 = ~7⭐/сек
      // - Формула: 240 + (duration × 7)
      const veo3Cost = 240 // с наценкой x1.5
      const hedraPerSecond = 7 // с наценкой x1.5
      const finalCost = veo3Cost + estimatedDuration * hedraPerSecond
      const finalCostUSD = (finalCost / 100).toFixed(2)

      // Запрос первой части заголовка для обложки
      await ctx.reply(
        isRu
          ? `✅ Текст получен!\n\n` +
              `📝 Теперь введите <b>первую часть</b> заголовка для обложки:\n\n` +
              `🎨 <b>Это будет составной заголовок из двух частей:</b>\n` +
              `• Первая часть: [ваш текст] (до 50 символов)\n` +
              `• Вторая часть: [будет запрошена далее]\n\n` +
              `💡 <i>Например: "ФОТОРЕАЛЬНЫЙ", "AI-STARS", "NEWS"</i>`
          : `✅ Text received!\n\n` +
              `📝 Now enter the <b>first part</b> of the cover title:\n\n` +
              `🎨 <b>This will be a composite title with two parts:</b>\n` +
              `• First part: [your text] (up to 50 characters)\n` +
              `• Second part: [will be requested next]\n\n` +
              `💡 <i>For example: "PHOTOREALISTIC", "AI-STARS", "NEWS"</i>`,
        { parse_mode: 'HTML' }
      )

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ [AI REELS RENDER] Text/voice processing error', {
        error,
      })
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке данных.'
          : '❌ Error processing data.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 3: Ввод текста интро для обложки
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS RENDER] Step 3 - Intro text input', {
      telegramId,
      step: 'intro_text',
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
        step: 'intro_text_2', // Переходим к вводу второго текста
      }

      // Запрос второго текста интро
      await ctx.reply(
        isRu
          ? `✅ Первая часть заголовка: "${introText}"\n\n` +
              `📝 Теперь введите <b>вторую часть</b> заголовка (до 50 символов):\n\n` +
              `🎨 <b>Это будет составной заголовок:</b>\n` +
              `• Первая часть: "${introText}"\n` +
              `• Вторая часть: [ваш текст]\n\n` +
              `💡 <i>Например: "АВАТАР", "NEWS", "TECH"</i>`
          : `✅ First part of title: "${introText}"\n\n` +
              `📝 Now enter the <b>second part</b> of title (up to 50 characters):\n\n` +
              `🎨 <b>This will be a composite title:</b>\n` +
              `• First part: "${introText}"\n` +
              `• Second part: [your text]\n\n` +
              `💡 <i>For example: "AVATAR", "NEWS", "TECH"</i>`,
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

  // Step 4: Ввод второго текста интро
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS RENDER] Step 4 - Second intro text input', {
      telegramId,
      step: 'intro_text_2',
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
        upperIntroText: introText2, // Используем второй текст как верхний
        step: 'avatar_service', // Переходим к выбору сервиса
      }

      // Оценка длительности для расчета стоимости
      let estimatedDuration = 10 // секунд по умолчанию

      if (ctx.session.aiReelsRender.audioUrl && 'voice' in ctx.message) {
        // Для голоса - точная длительность
        estimatedDuration = ctx.message.voice.duration
      } else {
        // Для текста - оценка (~2.5 слова в секунду, среднее чтение)
        const words = (ctx.session.aiReelsRender.text || '').split(/\s+/).length
        estimatedDuration = Math.ceil(words / 2.5)
      }

      // Сохраняем длительность для расчета цены
      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        estimatedDuration,
      }

      // 💰 Динамический расчет цены:
      // - VEO3 Fast (4 видео): 160⭐ фиксированно
      // - Hedra lip-sync: ~14⭐/сек (включает Hedra + ElevenLabs + накладные)
      // - Наценка: x2
      const veo3Cost = 160
      const hedraPerSecond = 14
      const baseCost = veo3Cost + estimatedDuration * hedraPerSecond
      const finalCost = Math.ceil(baseCost * 2) // x2 наценка
      const finalCostUSD = (finalCost / 100).toFixed(2)

      // Запрос выбора сервиса аватара
      await ctx.reply(
        isRu
          ? `✅ <b>Составной заголовок создан:</b>\n` +
              `🎨 "${ctx.session.aiReelsRender.introText1}" + "${introText2}"\n\n` +
              `📊 <b>Расчет стоимости:</b>\n` +
              `• Длительность: ~${estimatedDuration} сек\n` +
              `• 4 видео VEO3 Fast: 160⭐\n` +
              `• Hedra lip-sync: ${estimatedDuration} × 14⭐/сек = ${estimatedDuration * hedraPerSecond}⭐\n` +
              `• <b>Итого: ${finalCost}⭐ ($${finalCostUSD})</b>\n\n` +
              `🎭 Выберите сервис для генерации аватара:\n\n` +
              `🎭 <b>Hedra</b> - качественная генерация\n` +
              `   • Стоимость: ${finalCost}⭐\n` +
              `   • Время: 2-3 минуты\n\n` +
              `🎬 <b>HeyGen</b> - премиум качество\n` +
              `   • Стоимость: ${finalCost}⭐\n` +
              `   • Время: 4-5 минут`
          : `✅ <b>Composite title created:</b>\n` +
              `🎨 "${ctx.session.aiReelsRender.introText1}" + "${introText2}"\n\n` +
              `📊 <b>Cost calculation:</b>\n` +
              `• Duration: ~${estimatedDuration} sec\n` +
              `• 4 VEO3 Fast videos: 160⭐\n` +
              `• Hedra lip-sync: ${estimatedDuration} × 14⭐/sec = ${estimatedDuration * hedraPerSecond}⭐\n` +
              `• <b>Total: ${finalCost}⭐ ($${finalCostUSD})</b>\n\n` +
              `🎭 Choose avatar generation service:\n\n` +
              `🎭 <b>Hedra</b> - quality generation\n` +
              `   • Cost: ${finalCost}⭐\n` +
              `   • Time: 2-3 minutes\n\n` +
              `🎬 <b>HeyGen</b> - premium quality\n` +
              `   • Cost: ${finalCost}⭐\n` +
              `   • Time: 4-5 minutes`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                isRu
                  ? `🎭 Hedra (${finalCost}⭐)`
                  : `🎭 Hedra (${finalCost}⭐)`,
                'avatar_hedra'
              ),
              Markup.button.callback(
                isRu
                  ? `🎬 HeyGen (${finalCost}⭐)`
                  : `🎬 HeyGen (${finalCost}⭐)`,
                'avatar_heygen'
              ),
            ],
          ]),
        }
      )

      return ctx.wizard.next()
    } else {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте второй текст для интро (до 50 символов).'
          : '❌ Please send second intro text (up to 50 characters).'
      )
      return ctx.scene.leave()
    }
  },

  // Step 5: Обработка выбора аватара и отправка на render-server
  async ctx => {
    console.log('🔴🔴🔴 [RENDER WIZARD STEP 5] FUNCTION EXECUTING!!!')
    console.log('🔴 [RENDER WIZARD STEP 5] Update type:', ctx.updateType)
    console.log(
      '🔴 [RENDER WIZARD STEP 5] Has callback?',
      'callback_query' in ctx.update
    )

    console.log('🔴 [STEP 5] About to call logger.info...')

    try {
      console.log('🔴 [STEP 5] Inside try block')
      const isRu = isRussianFromState(ctx)
      console.log('🔴 [STEP 5] Got isRu:', isRu)

      const telegramId = ctx.from?.id?.toString()
      console.log('🔴 [STEP 5] Got telegramId:', telegramId)

      logger.info('🎬 [AI REELS RENDER] Step 5 STARTED', {
        telegramId,
        hasCallbackQuery: 'callback_query' in ctx.update,
        updateKeys: Object.keys(ctx.update),
      })

      // Обрабатываем только callback_query
      console.log('🔴 [STEP 5] Checking callback_query...')
      if (!('callback_query' in ctx.update)) {
        console.log('🔴 [STEP 5] NO callback_query!')
        await ctx.reply(
          isRu
            ? '❌ Пожалуйста, нажмите одну из кнопок.'
            : '❌ Please press one of the buttons.'
        )
        return // Остаемся в том же шаге
      }

      console.log('🔴 [STEP 5] Checking telegramId...')
      if (!telegramId) {
        console.log('🔴 [STEP 5] NO telegramId!')
        await ctx.reply(
          isRu
            ? '❌ Ошибка: не удалось определить ваш ID'
            : '❌ Error: could not determine your ID'
        )
        return ctx.scene.leave()
      }

      console.log('🔴 [STEP 5] Extracting callbackData...')
      const callbackData =
        'data' in ctx.update.callback_query
          ? ctx.update.callback_query.data
          : ''
      console.log('🔴 [STEP 5] CallbackData:', callbackData)

      logger.info('🎬 [AI REELS RENDER] Processing callback', {
        telegramId,
        callbackData,
      })

      console.log('🔴 [STEP 5] Checking if avatar callback...')
      if (callbackData === 'avatar_hedra' || callbackData === 'avatar_heygen') {
        console.log('🔴 [STEP 5] YES! Avatar callback detected!')
        const avatarService =
          callbackData === 'avatar_hedra' ? 'hedra' : 'heygen'
        console.log('🔴 [STEP 5] Avatar service:', avatarService)

        console.log('🔴 [STEP 5] Current session:', ctx.session.aiReelsRender)

        ctx.session.aiReelsRender = {
          ...ctx.session.aiReelsRender,
          avatarService,
        }

        console.log('🔴 [STEP 5] Answering callback query...')
        await ctx.answerCbQuery()
        console.log('🔴 [STEP 5] Editing message...')
        await ctx.editMessageText(
          isRu
            ? `✅ Выбран: ${avatarService === 'hedra' ? '🎭 Hedra' : '🎬 HeyGen'}\n\n⏳ Отправляем запрос на render-server...`
            : `✅ Selected: ${avatarService === 'hedra' ? '🎭 Hedra' : '🎬 HeyGen'}\n\n⏳ Sending request to render-server...`
        )
        console.log('🔴 [STEP 5] Message edited successfully!')

        console.log('🔴 [STEP 5] Creating payload...')
        // Создание payload
        const payload = createRenderAvatarPayload(
          telegramId,
          ctx.session.aiReelsRender.text || '',
          ctx.session.aiReelsRender.imageUrl || '',
          '0BcDz9UPwL3MpsnTeUlO', // Default ElevenLabs voice ID
          {
            coverUrl:
              'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
            introText1: ctx.session.aiReelsRender.introText1 || 'Ai-Stars',
            introText2: ctx.session.aiReelsRender.introText2 || 'News',
            upperIntroText:
              ctx.session.aiReelsRender.upperIntroText || 'Ai-Stars',
          }
        )
        console.log('🔴 [STEP 5] Payload created!')

        // Установить выбранный сервис
        payload.avatar_gen_service = avatarService
        console.log(
          '🔴 [STEP 5] Avatar service set on payload:',
          payload.avatar_gen_service
        )

        // 💰 Шаблон 2: Динамическая стоимость по длине lip-sync
        // Наценка x1.5 применена к базовым ценам
        const duration = ctx.session.aiReelsRender.estimatedDuration || 10
        const veo3Cost = 240 // 160⭐ × 1.5
        const hedraPerSecond = 7 // ~4.9⭐/сек × 1.5
        const estimatedCost = veo3Cost + duration * hedraPerSecond

        console.log('🔴 [STEP 5] Dynamic cost calculation:', {
          duration,
          veo3Cost,
          hedraPerSecond,
          estimatedCost,
          markup: 1.5,
        })

        // Проверка баланса
        console.log('🔴 [STEP 5] Getting user balance...')
        const currentBalance = await getUserBalance(telegramId)
        console.log('🔴 [STEP 5] Current balance:', currentBalance)

        console.log('🔴 [STEP 5] Checking if balance sufficient...')
        if (currentBalance === null || currentBalance < estimatedCost) {
          console.log('🔴 [STEP 5] INSUFFICIENT BALANCE!')
          await ctx.reply(
            isRu
              ? `💰 Недостаточно средств\n\nТребуется: ${estimatedCost}⭐\nУ вас: ${(currentBalance || 0).toFixed(2)}⭐`
              : `💰 Insufficient funds\n\nRequired: ${estimatedCost}⭐\nYou have: ${(currentBalance || 0).toFixed(2)}⭐`
          )
          return ctx.scene.leave()
        }

        console.log('🔴 [STEP 5] Balance sufficient! Charging user...')
        // Списание средств
        await updateUserBalance(
          telegramId,
          estimatedCost,
          PaymentType.MONEY_OUTCOME,
          `AI Reels Render (${avatarService})`,
          {
            bot_name: ctx.botInfo?.username || 'unknown_bot',
            service_type: 'ai_reels_render',
            avatar_service: avatarService,
          }
        )
        console.log('🔴 [STEP 5] User charged successfully!')

        console.log('🔴 [STEP 5] Sending event to render-server...')
        // Отправка на render-server
        try {
          console.log('🔴 [STEP 5] Inside sendEvent try block')
          console.log('🔴 [STEP 5] Payload job_id:', payload.job_id)
          console.log('🔴 [STEP 5] Payload keys:', Object.keys(payload))

          logger.info('🎬 [AI REELS RENDER] Starting event send', {
            telegramId,
            avatarService,
            payloadJobId: payload.job_id,
            payloadKeys: Object.keys(payload),
            imageUrl: ctx.session.aiReelsRender.imageUrl?.substring(0, 100),
            text: ctx.session.aiReelsRender.text?.substring(0, 50),
          })

          console.log(
            '🔴 [STEP 5] About to call sendRenderAvatarVideoEvent()...'
          )
          const { eventId } = await sendRenderAvatarVideoEvent(payload)
          console.log('🔴 [STEP 5] Event sent! Event ID:', eventId)

          console.log('🔴 [STEP 5] Sending success reply to user...')
          await ctx.reply(
            isRu
              ? `✅ Запрос отправлен на render-server!\n\n` +
                  `🔄 Event ID: ${eventId}\n` +
                  `🎭 Сервис: ${avatarService === 'hedra' ? 'Hedra' : 'HeyGen'}\n` +
                  `⏱️ Ожидаемое время: 2-5 минут\n` +
                  `📢 Вы получите уведомление когда видео будет готово\n\n` +
                  `💰 Списано: ${estimatedCost}⭐\n` +
                  `💳 Новый баланс: ${(currentBalance - estimatedCost).toFixed(2)}⭐`
              : `✅ Request sent to render-server!\n\n` +
                  `🔄 Event ID: ${eventId}\n` +
                  `🎭 Service: ${avatarService === 'hedra' ? 'Hedra' : 'HeyGen'}\n` +
                  `⏱️ Expected time: 2-5 minutes\n` +
                  `📢 You will receive notification when video is ready\n\n` +
                  `💰 Charged: ${estimatedCost}⭐\n` +
                  `💳 New balance: ${(currentBalance - estimatedCost).toFixed(2)}⭐`,
            { parse_mode: 'HTML' }
          )
          console.log('🔴 [STEP 5] Reply sent to user!')

          logger.info('✅ [AI REELS RENDER] Event sent successfully', {
            telegramId,
            eventId,
            avatarService,
            cost: estimatedCost,
          })

          console.log('🔴 [STEP 5] All done! Cleaning up...')
        } catch (error) {
          console.log('🔴🔴🔴 [STEP 5] CAUGHT ERROR IN SEND EVENT!')
          console.log('🔴 [STEP 5] Error:', error)
          console.log(
            '🔴 [STEP 5] Error message:',
            error instanceof Error ? error.message : String(error)
          )

          logger.error('❌ [AI REELS RENDER] Error sending event', { error })

          // Возврат средств при ошибке
          await updateUserBalance(
            telegramId,
            estimatedCost,
            PaymentType.MONEY_INCOME,
            `Refund: AI Reels Render error`,
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
      }
    } catch (error) {
      console.log('🔴🔴🔴 [STEP 5] CAUGHT ERROR!')
      console.log('🔴 [STEP 5] Error:', error)
      console.log(
        '🔴 [STEP 5] Error message:',
        error instanceof Error ? error.message : String(error)
      )
      console.log(
        '🔴 [STEP 5] Error stack:',
        error instanceof Error ? error.stack : 'NO STACK'
      )

      logger.error('❌ [AI REELS RENDER] Step 3 ERROR', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        telegramId: ctx.from?.id,
      })

      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? '❌ Произошла критическая ошибка. Попробуйте позже.'
          : '❌ Critical error occurred. Try again later.'
      )
      return ctx.scene.leave()
    }
  }
)

export default aiReelsRenderWizard
