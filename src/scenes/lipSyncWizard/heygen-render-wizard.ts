/**
 * 🎬 HEYGEN RENDER WIZARD
 *
 * HeyGen генерация через render-server на Railway с выбором аватара
 *
 * Процесс:
 * 1. Выбор набора аватаров (Cocoage/Haim)
 * 2. Выбор конкретного аватара
 * 3. Загрузка обложки (cover)
 * 4. Ввод текста или голосового сообщения
 * 5. Отправка на render-server через Inngest
 * 6. Получение результата через webhook
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
import {
  HEYGEN_AVATAR_SETS,
  getVoiceIdForAvatar,
} from './heygen-avatars-config'
import {
  calculateAIReelsPrice,
  formatPriceMessage,
} from '@/helpers/ai-reels-pricing'
import { standardButtons } from '@/navigation/helpers/actionButtons'

logger.info('📦 [HEYGEN RENDER WIZARD] Module loaded')

export const heygenRenderWizard = new Scenes.WizardScene<MyContext>(
  'heygen_render_wizard',

  // Step 0: Выбор набора аватаров (Cocoage/Haim) - ПЕРВЫЙ ШАГ
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [HEYGEN RENDER] Wizard started - Avatar set selection', {
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

    // Инициализируем сессию
    ctx.session.aiReelsRender = {
      step: 'avatar_set_selection',
      startTime: Date.now(),
      avatarService: 'heygen',
      imageUrl: '', // HeyGen не требует фото пользователя
    }

    await ctx.reply(
      isRu
        ? '🎬 <b>HeyGen - Выбор аватара</b>\n\n' +
            '👥 Выберите набор аватаров:\n\n' +
            '👤 <b>Cocoage</b> - 8 профессиональных аватаров\n' +
            '👥 <b>Haim</b> - 11 премиум аватаров'
        : '🎬 <b>HeyGen - Avatar Selection</b>\n\n' +
            '👥 Choose avatar set:\n\n' +
            '👤 <b>Cocoage</b> - 8 professional avatars\n' +
            '👥 <b>Haim</b> - 11 premium avatars',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              `${isRu ? '👤 Cocoage' : '👤 Cocoage'} (8)`,
              'heygen_set_cocoage'
            ),
          ],
          [
            Markup.button.callback(
              `${isRu ? '👥 Haim' : '👥 Haim'} (11)`,
              'heygen_set_haim'
            ),
          ],
          [
            Markup.button.callback(
              isRu ? 'Отмена' : 'Cancel',
              'ai_reels_cancel'
            ),
          ],
        ]),
      }
    )

    return ctx.wizard.next()
  },

  // Step 1: HEYGEN - Выбор набора аватаров (Cocoage/Haim)
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [HEYGEN RENDER] Step 1 - Avatar set selection', {
      telegramId,
      hasCallbackQuery: 'callback_query' in ctx.update,
    })

    if (!('callback_query' in ctx.update)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, нажмите одну из кнопок.'
          : '❌ Please press one of the buttons.'
      )
      return
    }

    // Answer the callback up front so every branch below (unknown option,
    // missing avatar, missing id) returns without leaving the button's loading
    // spinner hanging ~30s. .catch guards a stale/expired query id.
    await ctx.answerCbQuery().catch(() => {})

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    const callbackData =
      'data' in ctx.update.callback_query ? ctx.update.callback_query.data : ''

    if (
      callbackData === 'heygen_set_cocoage' ||
      callbackData === 'heygen_set_haim'
    ) {
      const setName = callbackData === 'heygen_set_cocoage' ? 'cocoage' : 'haim'
      const avatarSet = HEYGEN_AVATAR_SETS[setName]

      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        heygenAvatarSet: setName,
        heygenApiKey: avatarSet.apiKey,
      }

      // Создаем кнопки с аватарами (по 2 в ряд)
      const avatarButtons = []
      for (let i = 0; i < avatarSet.avatars.length; i += 2) {
        const row = []
        const avatar1 = avatarSet.avatars[i]
        row.push(
          Markup.button.callback(
            `${avatar1.emoji} ${avatar1.name}`,
            `heygen_avatar_${avatar1.id}`
          )
        )

        if (i + 1 < avatarSet.avatars.length) {
          const avatar2 = avatarSet.avatars[i + 1]
          row.push(
            Markup.button.callback(
              `${avatar2.emoji} ${avatar2.name}`,
              `heygen_avatar_${avatar2.id}`
            )
          )
        }
        avatarButtons.push(row)
      }

      // Добавляем кнопку отмены
      avatarButtons.push([
        Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'ai_reels_cancel'),
      ])

      await ctx.editMessageText(
        isRu
          ? `✅ Набор: ${avatarSet.name}\n\n` +
              `🎭 Выберите аватар (${avatarSet.avatars.length} доступно):`
          : `✅ Set: ${avatarSet.name}\n\n` +
              `🎭 Choose avatar (${avatarSet.avatars.length} available):`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard(avatarButtons),
        }
      )

      logger.info('🎬 [HEYGEN RENDER] Avatar set selected, showing avatars', {
        telegramId,
        setName,
        avatarsCount: avatarSet.avatars.length,
      })

      return ctx.wizard.next()
    } else {
      await ctx.reply(
        isRu
          ? '❌ Неизвестная опция. Попробуйте еще раз.'
          : '❌ Unknown option. Try again.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 2: HEYGEN - Выбор конкретного аватара из набора
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [HEYGEN RENDER] Step 2 - Specific avatar selection', {
      telegramId,
      hasCallbackQuery: 'callback_query' in ctx.update,
    })

    if (!('callback_query' in ctx.update)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, нажмите одну из кнопок.'
          : '❌ Please press one of the buttons.'
      )
      return
    }

    // Answer the callback up front so every branch below (unknown option,
    // missing avatar, missing id) returns without leaving the button's loading
    // spinner hanging ~30s. .catch guards a stale/expired query id.
    await ctx.answerCbQuery().catch(() => {})

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    const callbackData =
      'data' in ctx.update.callback_query ? ctx.update.callback_query.data : ''

    if (callbackData.startsWith('heygen_avatar_')) {
      const avatarId = callbackData.replace('heygen_avatar_', '')
      const { findAvatarById } = await import('./heygen-avatars-config')
      const avatarInfo = findAvatarById(avatarId)

      if (!avatarInfo) {
        await ctx.reply(
          isRu
            ? '❌ Аватар не найден. Попробуйте еще раз.'
            : '❌ Avatar not found. Try again.'
        )
        return ctx.scene.leave()
      }

      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        heygenAvatarId: avatarId,
        heygenApiKey: avatarInfo.apiKey,
        step: 'cover',
      }

      await ctx.editMessageText(
        isRu
          ? `✅ Выбран аватар: ${avatarInfo.avatar.emoji} ${avatarInfo.avatar.name}\n\n🖼️ Теперь отправьте обложку (фото для превью видео):`
          : `✅ Avatar selected: ${avatarInfo.avatar.emoji} ${avatarInfo.avatar.name}\n\n🖼️ Now send cover image (video preview thumbnail):`
      )

      logger.info(
        '🎬 [HEYGEN RENDER] Avatar selected, requesting cover image',
        {
          telegramId,
          avatarId,
          setName: ctx.session.aiReelsRender.heygenAvatarSet,
        }
      )

      return ctx.wizard.next()
    } else {
      await ctx.reply(
        isRu
          ? '❌ Неизвестная опция. Попробуйте еще раз.'
          : '❌ Unknown option. Try again.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 3: Загрузка обложки (cover)
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [HEYGEN RENDER] Step 3 - Processing cover image', {
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

        // ✅ FIX: Use process.env directly (Infisical loads to process.env, not @/config exports)
        const SUPABASE_URL = process.env.SUPABASE_URL
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
          throw new Error('Supabase credentials not configured in environment')
        }

        const serviceClient = createClient(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY
        )
        const fileName = `ai-reels-covers/${telegramId}/${Date.now()}.jpg`

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

        logger.info('✅ [HEYGEN RENDER] Cover image uploaded', {
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
          ? '✅ Обложка получена!\n\n' +
              '📝 Теперь отправьте текст (до 5000 символов) или голосовое сообщение (до 30 сек):'
          : '✅ Cover received!\n\n' +
              '📝 Now send text (up to 5000 characters) or voice message (up to 30 sec):'
      )

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ [HEYGEN RENDER] Cover processing error', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        hasMessage: !!message,
        hasPhoto: message && 'photo' in message,
        telegramId,
      })
      // The error is already logged above with its message and stack. Do not
      // echo the raw error text to the user: it leaks internal detail and reads
      // as a broken bot rather than a handled failure.
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке обложки. Пожалуйста, попробуйте снова.'
          : '❌ Error processing cover. Please try again.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 4: Обработка текста/голоса
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [HEYGEN RENDER] Step 4 - Processing text/voice', {
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

        // ✅ FIX: Use process.env directly (Infisical loads to process.env, not @/config exports)
        const SUPABASE_URL = process.env.SUPABASE_URL
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
          throw new Error('Supabase credentials not configured in environment')
        }

        const serviceClient = createClient(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY
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

        logger.info(
          '📝 [HEYGEN RENDER] Текст получен, будет передан в render-server',
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
      let estimatedDuration = 10

      if (audioUrl && 'voice' in message) {
        estimatedDuration = (message.voice as any).duration || 10
      } else {
        const words = text.split(/\s+/).length
        estimatedDuration = Math.ceil(words / 2.5)
      }

      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        estimatedDuration,
      }

      await ctx.reply(
        isRu
          ? `✅ Текст получен!\n\n` +
              `📝 Теперь введите <b>первую часть</b> заголовка для обложки:\n\n` +
              `💡 <i>Например: "ФОТОРЕАЛЬНЫЙ АВАТАР"</i>`
          : `✅ Text received!\n\n` +
              `📝 Now enter the <b>first part</b> of the cover title:\n\n` +
              `💡 <i>For example: "PHOTOREALISTIC AVATAR"</i>`,
        { parse_mode: 'HTML' }
      )

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ [HEYGEN RENDER] Text/voice processing error', {
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

  // Step 5: Ввод первого текста интро
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [HEYGEN RENDER] Step 5 - First intro text input', {
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

      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        introText1: introText,
        step: 'intro_text_2',
      }

      await ctx.reply(
        isRu
          ? `✅ Первая часть заголовка: "${introText}"\n\n` +
              `📝 Теперь введите <b>вторую часть</b> заголовка (до 50 символов):`
          : `✅ First part of title: "${introText}"\n\n` +
              `📝 Now enter the <b>second part</b> of title (up to 50 characters):`,
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

  // Step 6: Ввод второго текста интро и отправка на render-server
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info(
      '🎬 [HEYGEN RENDER] Step 6 - Second intro text and processing',
      {
        telegramId,
      }
    )

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

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

      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        introText2: introText2,
        upperIntroText: introText2,
        step: 'processing',
      }

      if (ctx.session.heygenRenderInProgress) {
        await ctx.reply(
          isRu
            ? '⏳ Уже обрабатываю, подождите...'
            : '⏳ Already processing, please wait...'
        )
        return
      }
      ctx.session.heygenRenderInProgress = true

      try {
        await ctx.reply(
          isRu
            ? `✅ Генерация через 🎬 HeyGen\n\n⏳ Отправляем запрос на render-server...`
            : `✅ Generating with 🎬 HeyGen\n\n⏳ Sending request to render-server...`
        )

        // Получаем voice_id для HeyGen аватара
        const heygenAvatarId = ctx.session.aiReelsRender.heygenAvatarId
        if (!heygenAvatarId) {
          await ctx.reply(
            isRu
              ? '❌ Ошибка: аватар HeyGen не выбран'
              : '❌ Error: HeyGen avatar not selected'
          )
          return ctx.scene.leave()
        }

        const heygenVoiceId = getVoiceIdForAvatar(heygenAvatarId)
        if (!heygenVoiceId) {
          await ctx.reply(
            isRu
              ? '❌ Ошибка: не найден voice_id для выбранного аватара'
              : '❌ Error: voice_id not found for selected avatar'
          )
          return ctx.scene.leave()
        }

        // Расчет стоимости
        const priceBreakdown = calculateAIReelsPrice({
          text: ctx.session.aiReelsRender.text || '',
          avatarService: 'heygen',
          isOwnHeyGenKey: !!ctx.session.aiReelsRender.heygenApiKey,
          isOwnFalKey: false,
          markupMultiplier: 1.5,
        })

        const estimatedCost = priceBreakdown.finalPrice

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

        // Списываем средства.
        //
        // Было `-estimatedCost` с типом SERVICE_PAYMENT — списание молча не
        // происходило: SERVICE_PAYMENT нет в OperationTypeEnum, по которому
        // валидируется запись, zod бросал, updateUserBalance возвращала false,
        // и никто это false не проверял. В payments_v2 ноль строк с
        // service_type='ai_reels_heygen'.
        const charged = await updateUserBalance(
          telegramId,
          estimatedCost,
          PaymentType.MONEY_OUTCOME,
          `AI Reels HeyGen`,
          {
            bot_name: ctx.botInfo?.username || 'unknown_bot',
            service_type: 'ai_reels_heygen',
          }
        )

        if (!charged) {
          await ctx.reply(
            isRu
              ? '❌ Не удалось списать средства. Генерация отменена, деньги не тронуты.'
              : '❌ Could not charge your balance. Generation cancelled, nothing was taken.'
          )
          return ctx.scene.leave()
        }

        // Создаем payload
        const payload = createRenderAvatarPayload(
          telegramId,
          ctx.session.aiReelsRender.text || '',
          ctx.session.aiReelsRender.imageUrl || '',
          heygenVoiceId,
          {
            coverUrl:
              ctx.session.aiReelsRender.coverUrl ||
              'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
            introText1: ctx.session.aiReelsRender.introText1 || 'Ai-Stars',
            introText2: ctx.session.aiReelsRender.introText2 || 'News',
            avatarService: 'heygen',
            heygenApiKey: ctx.session.aiReelsRender.heygenApiKey,
            heygenAvatarId: heygenAvatarId,
            heygenAvatarSet: ctx.session.aiReelsRender.heygenAvatarSet,
            botName: ctx.botInfo?.username || 'MetaMuse_Manifest_bot',
          }
        )

        // ВОЗВРАТ ПРИ НЕУДАЧНОЙ ОТПРАВКЕ.
        //
        // Деньги уже списаны выше. Если отправка события не удастся, человек
        // останется без видео и без звёзд, а внешний catch скажет лишь
        // «обратитесь в поддержку».
        //
        // Дыру открыл я сам в PR #506: до него списание здесь молча не
        // происходило (тип SERVICE_PAYMENT не проходил валидацию записи),
        // поэтому неудачная отправка ничего не стоила. Починив списание, я
        // сделал этот путь платным — и обязан был закрыть возврат тем же
        // движением. Соседний hedra-render-wizard так и устроен (:631).
        let eventId: string
        try {
          ;({ eventId } = await sendRenderAvatarVideoEvent(payload))
        } catch (sendError) {
          logger.error(
            '❌ [HEYGEN RENDER] Ошибка отправки события — возвращаю средства',
            {
              telegramId,
              cost: estimatedCost,
              error:
                sendError instanceof Error
                  ? sendError.message
                  : String(sendError),
            }
          )

          const refunded = await updateUserBalance(
            telegramId,
            estimatedCost,
            PaymentType.MONEY_INCOME,
            'Refund: HeyGen Render error',
            {
              bot_name: ctx.botInfo?.username || 'unknown_bot',
              service_type: 'refund',
            }
          )
          if (!refunded) {
            // updateUserBalance returns false (never throws) on a ghost-payer
            // with no users row or a DB error. The discarded result let the
            // message below claim a successful refund when it had silently
            // failed. Tell the user the truth instead.
            logger.error(
              '[HEYGEN RENDER] refund failed — user NOT refunded after a send error',
              { telegramId, estimatedCost }
            )
          }

          await ctx.reply(
            isRu
              ? refunded
                ? '❌ Произошла ошибка при отправке запроса. Средства возвращены.'
                : '❌ Произошла ошибка при отправке запроса. Автоматически вернуть средства не удалось — напишите в поддержку.'
              : refunded
                ? '❌ Error sending request. Funds refunded.'
                : '❌ Error sending request. Automatic refund failed — please contact support.'
          )
          return ctx.scene.leave()
        }

        await ctx.reply(
          isRu
            ? `✅ Запрос отправлен на render-server!\n\n` +
                `🔄 Event ID: ${eventId}\n` +
                `🎬 Сервис: HeyGen\n` +
                `⏱️ Ожидаемое время: 4-5 минут\n` +
                `📢 Вы получите уведомление когда видео будет готово\n\n` +
                `💰 Списано: ${estimatedCost}⭐\n` +
                `💳 Новый баланс: ${(currentBalance - estimatedCost).toFixed(2)}⭐`
            : `✅ Request sent to render-server!\n\n` +
                `🔄 Event ID: ${eventId}\n` +
                `🎬 Service: HeyGen\n` +
                `⏱️ Expected time: 4-5 minutes\n` +
                `📢 You will receive notification when video is ready\n\n` +
                `💰 Charged: ${estimatedCost}⭐\n` +
                `💳 New balance: ${(currentBalance - estimatedCost).toFixed(2)}⭐`,
          { parse_mode: 'HTML' }
        )

        logger.info('✅ [HEYGEN RENDER] Event sent successfully', {
          telegramId,
          eventId,
          cost: estimatedCost,
        })

        return ctx.scene.leave()
      } catch (error) {
        logger.error('❌ [HEYGEN RENDER] Error in processing', {
          error,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        })

        await ctx.reply(
          isRu
            ? '⚠️ Произошла ошибка при обработке. Обратитесь в поддержку.'
            : '⚠️ Error occurred during processing. Contact support.'
        )
        return ctx.scene.leave()
      } finally {
        ctx.session.heygenRenderInProgress = false
      }
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
heygenRenderWizard.action('ai_reels_cancel', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    logger.info('🎬 [HEYGEN RENDER] User cancelled wizard', {
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

    if (ctx.session.aiReelsRender) {
      delete ctx.session.aiReelsRender
    }

    await ctx.scene.leave()
  } catch (error) {
    logger.error('❌ [HEYGEN RENDER] Error handling cancel', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

export default heygenRenderWizard
