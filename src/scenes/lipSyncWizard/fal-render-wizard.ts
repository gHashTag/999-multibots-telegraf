/**
 * 🎯 FAL (FABRIC) RENDER WIZARD
 *
 * AI Reels генерация через render-server с Fal
 *
 * Процесс:
 * 1. Загрузка фото аватара
 * 2. Загрузка обложки
 * 3. Ввод текста или голосового сообщения
 * 4. Ввод intro text (2 части)
 * 5. Отправка на render-server через Inngest
 */

import { resolveAvatarPhoto } from '@/helpers/resolveAvatarPhoto'
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
import {
  calculateAIReelsPrice,
  formatPriceMessage,
} from '@/helpers/ai-reels-pricing'
import { refundAndTell } from '@/price/helpers/refundAndTell'
import { standardButtons } from '@/navigation/helpers/actionButtons'

logger.info('📦 [FAL RENDER WIZARD] Module loaded')

export const falRenderWizard = new Scenes.WizardScene<MyContext>(
  'fal_render_wizard',

  // Step 0: Запрос фото аватара
  async ctx => {
    console.log('🎯🎯🎯 [FAL RENDER] STEP 0 EXECUTING!')
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    console.log('🎯 [FAL RENDER] Step 0 data:', {
      telegramId,
      hasFrom: !!ctx.from,
    })
    logger.info('🎯 [FAL RENDER] Wizard started', { telegramId })

    if (!telegramId) {
      console.log('❌ [FAL RENDER] No telegramId, leaving scene')
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    console.log('🔑 [FAL RENDER] FAL_KEY check:', {
      hasKey: !!process.env.FAL_KEY,
      keyLength: process.env.FAL_KEY?.length,
    })

    if (!process.env.FAL_KEY) {
      console.error('❌ [FAL RENDER] FAL_KEY is missing from process.env!')
      logger.error('[FAL RENDER] FAL_KEY is not configured in Infisical', {
        telegramId,
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка конфигурации: FAL API ключ не настроен в Infisical'
          : '❌ Configuration error: FAL API key not configured in Infisical'
      )
      return ctx.scene.leave()
    }

    console.log('📝 [FAL RENDER] Initializing session...')

    // Инициализируем сессию
    ctx.session.aiReelsRender = {
      avatarService: 'fal',
      step: 'image',
      startTime: Date.now(),
      falApiKey: process.env.FAL_KEY, // ✅ Из Infisical через process.env
      falResolution: '720p', // Default resolution
    }

    console.log(
      '✅ [FAL RENDER] Session initialized:',
      ctx.session.aiReelsRender
    )
    console.log('💬 [FAL RENDER] About to send reply...')

    try {
      await ctx.reply(
        isRu
          ? '🎯 <b>Fal Avatar Generation</b>\n\n📸 Отправьте фото или URL изображения с лицом для аватара.'
          : '🎯 <b>Fal Avatar Generation</b>\n\n📸 Send a photo or image URL with a face for avatar.',
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'fal_cancel')],
          ]),
        }
      )
      console.log('✅ [FAL RENDER] Reply sent successfully')
    } catch (error) {
      console.error('❌ [FAL RENDER] Error sending reply:', error)
      logger.error('[FAL RENDER] Error sending reply in Step 0', {
        error,
        telegramId,
      })
      throw error
    }

    console.log('➡️ [FAL RENDER] Moving to next step...')
    return ctx.wizard.next()
  },

  // Step 1: Обработка фото аватара
  async ctx => {
    console.log('🎯🎯🎯 [FAL RENDER] STEP 1 EXECUTING!')
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    const telegramId = ctx.from?.id?.toString()
    let imageUrl: string | null = null

    console.log('🎯 [FAL RENDER] Step 1 data:', {
      telegramId,
      hasMessage: !!message,
      hasPhoto: message && 'photo' in message,
      hasText: message && 'text' in message,
      updateType: ctx.updateType,
    })

    logger.info('🎯 [FAL RENDER] Step 1 - Processing avatar image', {
      telegramId,
      hasPhoto: message && 'photo' in message,
      hasText: message && 'text' in message,
    })

    console.log('✅ [FAL RENDER] Logger.info called')

    if (!telegramId) {
      console.log('❌ [FAL RENDER] No telegramId, leaving scene')
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    console.log('✅ [FAL RENDER] telegramId check passed, entering try block')

    try {
      console.log('📸 [FAL RENDER] Processing photo from message')
      // Обработка фото из Telegram
      if (message && 'photo' in message && message.photo.length > 0) {
        console.log('✅ [FAL RENDER] Photo detected, getting file link')
        const photo = message.photo[message.photo.length - 1]
        const fileLink = await ctx.telegram.getFileLink(photo.file_id)
        console.log(
          '✅ [FAL RENDER] File link received:',
          fileLink.href.substring(0, 50)
        )
        const response = await fetch(fileLink.href, {
          signal: AbortSignal.timeout(60_000),
        })
        console.log('✅ [FAL RENDER] Fetch response status:', response.status)

        if (!response.ok) {
          throw new Error(`Failed to download photo: ${response.statusText}`)
        }

        console.log('✅ [FAL RENDER] Converting to buffer...')
        const imageBuffer = Buffer.from(await response.arrayBuffer())
        console.log('✅ [FAL RENDER] Buffer created, size:', imageBuffer.length)

        console.log('📦 [FAL RENDER] Importing Supabase...')
        // Загружаем в Supabase Storage
        const { createClient } = await import('@supabase/supabase-js')
        const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import(
          '@/config'
        )
        console.log('✅ [FAL RENDER] Supabase imported, creating client...')
        console.log('🔑 [FAL RENDER] Supabase config check:', {
          hasURL: !!SUPABASE_URL,
          hasKey: !!SUPABASE_SERVICE_ROLE_KEY,
          urlLength: SUPABASE_URL?.length,
          keyLength: SUPABASE_SERVICE_ROLE_KEY?.length,
        })

        console.log('🏗️ [FAL RENDER] Creating Supabase client...')
        const serviceClient = createClient(
          SUPABASE_URL!,
          SUPABASE_SERVICE_ROLE_KEY!
        )
        console.log('✅ [FAL RENDER] Supabase client created successfully')

        const fileName = `fal-avatars/${telegramId}/${Date.now()}.jpg`
        console.log('✅ [FAL RENDER] Preparing upload to:', fileName)

        const { error: uploadError } = await serviceClient.storage
          .from('images')
          .upload(fileName, imageBuffer, {
            contentType: 'image/jpeg',
            upsert: false,
          })
        console.log('📤 [FAL RENDER] Upload result:', {
          hasError: !!uploadError,
        })

        if (uploadError) {
          console.error('❌ [FAL RENDER] Upload error:', uploadError)
          throw new Error(`Upload failed: ${uploadError.message}`)
        }

        console.log('🔗 [FAL RENDER] Getting public URL...')
        const { data: urlData } = serviceClient.storage
          .from('images')
          .getPublicUrl(fileName)
        imageUrl = urlData.publicUrl
        console.log(
          '✅ [FAL RENDER] Public URL obtained:',
          imageUrl.substring(0, 80)
        )

        logger.info('✅ [FAL RENDER] Avatar photo uploaded', {
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
      logger.error('❌ [FAL RENDER] Image processing error', { error })
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

    logger.info('🎯 [FAL RENDER] Step 2 - Processing cover image', {
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
      let coverUrl: string | null = null

      // Обработка фото обложки
      if (message && 'photo' in message && message.photo.length > 0) {
        const photo = message.photo[message.photo.length - 1]
        const fileLink = await ctx.telegram.getFileLink(photo.file_id)
        const response = await fetch(fileLink.href, {
          signal: AbortSignal.timeout(60_000),
        })

        if (!response.ok) {
          throw new Error(`Failed to download cover: ${response.statusText}`)
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
        const fileName = `fal-covers/${telegramId}/${Date.now()}.jpg`

        const { error: uploadError } = await serviceClient.storage
          .from('images')
          .upload(fileName, imageBuffer, {
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Supabase upload failed: ${uploadError.message}`)
        }

        const { data: urlData } = serviceClient.storage
          .from('images')
          .getPublicUrl(fileName)

        coverUrl = urlData.publicUrl

        logger.info('✅ [FAL RENDER] Cover image uploaded', {
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
      logger.error('❌ [FAL RENDER] Cover processing error', { error })
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

    logger.info('🎯 [FAL RENDER] Step 3 - Processing text/voice', {
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
        const fileName = `fal-audio/${telegramId}/${Date.now()}.ogg`

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
        logger.info(
          '📝 [FAL RENDER] Текст получен, будет передан в render-server',
          {
            telegramId,
            textLength: text.length,
          }
        )
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
      logger.error('❌ [FAL RENDER] Text/voice processing error', { error })
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

    logger.info('🎯 [FAL RENDER] Step 4 - Intro text input (part 1)', {
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

    logger.info('🎯 [FAL RENDER] Step 5 - Intro text part 2 and sending', {
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
        avatarService: 'fal',
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

        // The refusal hands over the way to pay; standardButtons puts top-up first.
        await ctx.reply(insufficientMessage, standardButtons(isRu))
        return ctx.scene.leave()
      }

      // ОСТАНОВКА ДО СПИСАНИЯ.
      //
      // Этот визард шлёт avatar_gen_service: 'fal', а
      // RenderRiddleEventDataSchema принимает только 'hedra' и 'heygen'
      // (schemas.ts). renderRiddle.ts:57 валидирует вход ПЕРВОЙ строкой и
      // отвергает такую задачу — проверено прогоном safeParse. Ветки для fal
      // там тоже нет: после `if hedra` / `else if heygen` (renderRiddle.ts:130
      // и :177) ничего не следует, и сервиса генерации аватара через fal в
      // проекте не существует вовсе.
      //
      // Отказ происходит АСИНХРОННО, внутри Inngest-функции, уже после того
      // как здесь списаны деньги (ниже) и человеку написано «💰 Списано».
      // Обработчик ошибок этого визарда не срабатывает: отправка события
      // проходит успешно. То есть деньги уходили за задачу, которая не могла
      // выполниться ни при каких условиях.
      //
      // Убирать сам визард из регистрации — продуктовое решение, не моё.
      // Поэтому останавливаемся здесь, до списания, и говорим прямо.
      await ctx.reply(
        isRu
          ? '⚠️ Генерация через Fal сейчас недоступна: обработчик для неё ещё не реализован. ' +
              'Средства не списаны. Воспользуйтесь HeyGen или Hedra.'
          : '⚠️ Fal generation is unavailable: its handler is not implemented yet. ' +
              'You have not been charged. Please use HeyGen or Hedra instead.'
      )
      return ctx.scene.leave()

      // Списание средств. Код ниже недостижим (см. return выше), но остаётся
      // как заготовка на день, когда обработчик Fal напишут. Тип и знак
      // исправлены здесь же, чтобы заготовка не воскресила прежнюю ошибку:
      // SERVICE_PAYMENT не проходит валидацию записи, а минус у суммы при
      // MONEY_OUTCOME начисляет деньги вместо списания.
      //
      // The two money calls below BIND their answers, although nothing runs
      // them today. updateUserBalance returns false without throwing, and a
      // sketch that ignores that is a sketch somebody revives one day into a
      // free generation or a silently swallowed refund -- the two shapes every
      // other guard in this repository exists to stop. `tri money` lists
      // unreachable calls apart for exactly this reason: they are what a future
      // edit wakes up.
      // eslint-disable-next-line no-unreachable
      const charged = await updateUserBalance(
        telegramId,
        estimatedCost,
        PaymentType.MONEY_OUTCOME,
        'AI Reels Fal',
        {
          bot_name: ctx.botInfo?.username || 'unknown_bot',
          service_type: 'fal_render',
        }
      )
      if (!charged) {
        logger.error(
          '[fal-render] charge refused -- no generation was started',
          {
            telegramId,
            estimatedCost,
          }
        )
        await ctx.reply(
          isRu
            ? '❌ Не удалось списать средства. Попробуйте позже.'
            : '❌ Could not charge your balance. Please try again later.'
        )
        return ctx.scene.leave()
      }

      // Получаем voice_id пользователя
      const { getVoiceId } = await import('@/core/supabase/getVoiceId')
      const voiceIdToUse = await getVoiceId(telegramId)

      if (!voiceIdToUse) {
        await ctx.reply(
          isRu
            ? '❌ У вас не настроен голос аватара. Создайте голос сначала.'
            : '❌ You dont have avatar voice configured.'
        )
        // The money goes back, and the person is told the truth about whether
        // it did: refundAndTell checks the credit instead of announcing one.
        await refundAndTell({
          ctx,
          telegramId,
          amount: estimatedCost,
          description: 'Refund: No voice ID',
          reason: {
            ru: 'Голос аватара не настроен.',
            en: 'The avatar voice is not configured.',
          },
          isRu,
        })
        return ctx.scene.leave()
      }

      // Создаем payload
      /*
       * A person who never uploaded a picture still has one: the Telegram
       * avatar stored on their user row at registration. Without this the
       * Hedra branch of the event schema refuses the whole render, which reads
       * as the feature being broken rather than a step being missing.
       */
      const avatarPhoto = await resolveAvatarPhoto(
        ctx,
        ctx.session.aiReelsRender.imageUrl
      )
      const payload = createRenderAvatarPayload(
        telegramId,
        ctx.session.aiReelsRender.text || '',
        avatarPhoto,
        voiceIdToUse,
        {
          coverUrl:
            ctx.session.aiReelsRender.coverUrl ||
            'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
          introText1: ctx.session.aiReelsRender.introText1 || 'Ai-Stars',
          introText2: introText2,
          avatarService: 'fal',
          falApiKey: ctx.session.aiReelsRender.falApiKey,
          falResolution: ctx.session.aiReelsRender.falResolution,
          botName: ctx.botInfo?.username || 'MetaMuse_Manifest_bot',
        }
      )

      // dispatched: once sendRenderAvatarVideoEvent returns, the render job is
      // queued and the callback owns its outcome; a throw in the confirmation
      // reply AFTER this must NOT refund (heygen-render is the oracle). See #1331.
      let dispatched = false
      // Отправка на render-server
      try {
        const { eventId } = await sendRenderAvatarVideoEvent(payload)
        dispatched = true

        await ctx.reply(
          isRu
            ? `✅ Запрос отправлен на render-server!\n\n` +
                `🔄 Event ID: ${eventId}\n` +
                `🎯 Сервис: Fal\n` +
                `⏱️ Ожидаемое время: 2-3 минут\n` +
                `📢 Вы получите уведомление когда видео будет готово\n\n` +
                `💰 Списано: ${estimatedCost}⭐\n` +
                `💳 Новый баланс: ${(currentBalance - estimatedCost).toFixed(2)}⭐`
            : `✅ Request sent to render-server!\n\n` +
                `🔄 Event ID: ${eventId}\n` +
                `🎯 Service: Fal\n` +
                `⏱️ Expected time: 2-3 minutes\n` +
                `📢 You will receive notification when video is ready\n\n` +
                `💰 Charged: ${estimatedCost}⭐\n` +
                `💳 New balance: ${(currentBalance - estimatedCost).toFixed(2)}⭐`,
          { parse_mode: 'HTML' }
        )

        logger.info('✅ [FAL RENDER] Event sent successfully', {
          telegramId,
          eventId,
          cost: estimatedCost,
        })
      } catch (error) {
        logger.error('❌ [FAL RENDER] Error sending event', { error })

        // Возврат средств при ошибке. Говорим человеку то, что
        // произошло: начисление может не пройти — updateUserBalance
        // при неудаче не бросает, а возвращает false.
        // Only a PRE-dispatch throw warrants a refund. If the job was already
        // dispatched and only the confirmation reply threw, the render job keeps
        // running and will deliver -- refunding here would mint. See #1331.
        if (!dispatched) {
          await refundAndTell({
            ctx,
            telegramId,
            amount: estimatedCost,
            description: 'Refund: Fal Render error',
            reason: {
              ru: 'Произошла ошибка при отправке запроса',
              en: 'An error occurred while sending the request',
            },
            isRu,
          })
        } else {
          logger.warn(
            '[RENDER] Post-dispatch reply threw; NOT refunding (render job owns its outcome)',
            { telegramId }
          )
        }
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
falRenderWizard.action('fal_cancel', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    logger.info('🎯 [FAL RENDER] User cancelled wizard', {
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
    logger.error('❌ [FAL RENDER] Error handling cancel', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

export default falRenderWizard
