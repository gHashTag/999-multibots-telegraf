import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { lipSyncOrchestrator } from '@/core/lipsync/lipsync-orchestrator'
import { LipSyncInputBuilder } from '@/core/lipsync/schemas/lipsync-schemas'
import { logger } from '@/utils/logger'
import { combineVideos } from '@/helpers/video-helpers'
import { downloadFile } from '@/helpers/file-helpers'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import {
  LIPSYNC_MODELS,
  getAvailableLipSyncModels,
  calculateLipSyncCost,
} from '@/config/lipsync-models.config'
import { FalVeo31Provider } from '@/core/lipsync/providers/fal-veo31-provider'
import { refundAndTell } from '@/price/helpers/refundAndTell'
import { standardButtons } from '@/navigation/helpers/actionButtons'

// Интерфейс для aiReels теперь определен в MySession interface

/**
 * ИИ Рилс Wizard - создает два видео (lip-sync + Google Veo 3.1) и склеивает их
 *
 * Последовательность:
 * 1. Получение изображения и текста/голоса
 * 2. Генерация первого видео (lip-sync)
 * 3. Генерация второго видео (Google Veo 3.1 reference-to-video)
 * 4. Склеивание двух видео в итоговый ролик
 */
export const aiReelsWizard = new Scenes.WizardScene<MyContext>(
  'ai_reels_wizard',

  // Step 0: Запрос изображения
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS WIZARD] Step 0 STARTED - Запрос изображения', {
      telegramId,
      hasFrom: !!ctx.from,
      hasSavedState: !!(
        ctx.session.aiReels?.imageUrl && ctx.session.aiReels?.text
      ),
      needsVoiceCreation: ctx.session.aiReels?.needsVoiceCreation,
      function: 'aiReelsWizard.step0',
    })

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    // Проверяем, возвращаемся ли после создания голоса
    if (
      ctx.session.aiReels?.imageUrl &&
      ctx.session.aiReels?.text &&
      ctx.session.aiReels?.needsVoiceCreation
    ) {
      logger.info('🎬 [AI REELS] Продолжаем с сохраненными данными', {
        telegramId,
        hasImageUrl: !!ctx.session.aiReels.imageUrl,
        hasText: !!ctx.session.aiReels.text,
      })

      // Очищаем флаг needsVoiceCreation
      ctx.session.aiReels.needsVoiceCreation = false

      await ctx.reply(
        isRu
          ? '🎬 Продолжаем создание ИИ Рилс с вашими данными...'
          : '🎬 Continuing AI Reels creation with your data...'
      )

      // Пропускаем к Step 2 (генерация первого видео)
      ctx.wizard.selectStep(2)
      return ctx.wizard.next()
    }

    // Обычный флоу: инициализируем сессию
    ctx.session.aiReels = {
      step: 'image',
      startTime: Date.now(),
    }

    logger.info('🎬 [AI REELS WIZARD] Step 0 - Session initialized', {
      telegramId,
      sessionState: ctx.session.aiReels,
    })

    await ctx.reply(
      isRu
        ? '🎬 ИИ Рилс - создание двух видео\n\n' +
            '📸 Отправьте фото или URL изображения с лицом для lip-sync видео.\n\n' +
            '🎯 Процесс:\n' +
            '1️⃣ Создадим lip-sync видео из вашего изображения\n' +
            '2️⃣ Создадим дополнительное видео через Google Veo 3.1\n' +
            '3️⃣ Склеим оба видео в единый ролик\n\n' +
            '📝 На следующем шаге выберите:\n' +
            '• Текст (будет озвучен вашим голосом аватара)\n' +
            '• 🎤 Голосовое сообщение (до 30 сек)'
        : '🎬 AI Reels - creating two videos\n\n' +
            '📸 Send a photo or image URL with a face for lip-sync video.\n\n' +
            '🎯 Process:\n' +
            '1️⃣ Create lip-sync video from your image\n' +
            '2️⃣ Create additional video via Google Veo 3.1\n' +
            '3️⃣ Merge both videos into final reel\n\n' +
            '📝 On the next step choose:\n' +
            '• Text (will be voiced with your avatar)\n' +
            '• 🎤 Voice message (up to 30 sec)',
      { reply_markup: { remove_keyboard: true } }
    )

    return ctx.wizard.next()
  },

  // Step 1: Обработка изображения, запрос текста
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    let imageUrl: string | null = null

    logger.info('🎬 [AI REELS WIZARD] Step 1 STARTED - Обработка изображения', {
      telegramId: ctx.from?.id?.toString(),
      hasMessage: !!message,
      messageType: message
        ? 'photo' in message
          ? 'photo'
          : 'text' in message
            ? 'text'
            : 'other'
        : 'none',
      function: 'aiReelsWizard.step1',
    })

    try {
      // Обработка фото из Telegram
      if (message && 'photo' in message && message.photo.length > 0) {
        const photo = message.photo[message.photo.length - 1]
        const telegramId = ctx.from?.id?.toString()

        logger.info('📸 Скачиваем фото из Telegram для AI Reels', {
          fileId: photo.file_id,
          telegramId,
        })

        try {
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
          const fileName = `ai-reels-images/${telegramId}/${Date.now()}.jpg`

          const { error: uploadError } = await serviceClient.storage
            .from('images')
            .upload(fileName, imageBuffer, {
              contentType: 'image/jpeg',
              upsert: false,
            })

          if (uploadError) {
            throw new Error(`Upload failed: ${uploadError.message}`)
          }

          // Получаем публичный URL
          const { data: urlData } = serviceClient.storage
            .from('images')
            .getPublicUrl(fileName)

          imageUrl = urlData.publicUrl

          logger.info('✅ Фото для AI Reels загружено в Supabase', {
            fileName,
            publicUrl: imageUrl,
          })
        } catch (uploadError) {
          logger.error('❌ Ошибка загрузки фото для AI Reels', {
            error: uploadError,
          })
          await ctx.reply(
            isRu
              ? '❌ Ошибка загрузки фото. Попробуйте еще раз.'
              : '❌ Error uploading photo. Try again.'
          )
          return ctx.scene.leave()
        }
      }
      // Обработка URL изображения
      else if (message && 'text' in message) {
        const text = message.text.trim()

        if (text.startsWith('http://') || text.startsWith('https://')) {
          imageUrl = text
          logger.info('📸 Получен URL изображения для AI Reels', {
            url: imageUrl.substring(0, 100),
          })
        }
      }

      if (!imageUrl) {
        await ctx.reply(
          isRu
            ? '❌ Некорректное изображение. Отправьте фото или URL изображения.'
            : '❌ Invalid image. Send a photo or image URL.'
        )
        return ctx.scene.leave()
      }

      // Сохраняем imageUrl в сессию
      ctx.session.aiReels = {
        ...ctx.session.aiReels,
        imageUrl,
        step: 'text',
      }

      await ctx.reply(
        isRu
          ? '✅ Изображение получено!\n\n' +
              '📝 Теперь отправьте:\n' +
              '• Текст (до 5000 символов) - будет озвучен голосом вашего аватара для lip-sync\n' +
              '• ИЛИ голосовое сообщение - будет использовано напрямую\n\n' +
              '💡 Этот текст/голос будет использован для первого видео (lip-sync)'
          : '✅ Image received!\n\n' +
              '📝 Now send:\n' +
              '• Text (up to 5000 characters) - will be voiced with your avatar for lip-sync\n' +
              '• OR voice message - will be used directly\n\n' +
              '💡 This text/voice will be used for the first video (lip-sync)'
      )

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ Ошибка обработки изображения в AI Reels', { error })
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке изображения. Попробуйте еще раз.'
          : '❌ An error occurred while processing the image. Try again.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 2: Обработка текста/голоса, генерация первого видео (lip-sync)
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    const telegramId = ctx.from?.id?.toString()

    logger.info(
      '🎬 [AI REELS WIZARD] Step 2 STARTED - Генерация первого видео (lip-sync)',
      {
        telegramId,
        hasMessage: !!message,
        messageType: message
          ? 'text' in message
            ? 'text'
            : 'voice' in message
              ? 'voice'
              : 'other'
          : 'none',
        function: 'aiReelsWizard.step2',
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

    // 🧪 ТЕСТОВЫЙ РЕЖИМ: Используем готовое видео для экономии средств
    const isDev = process.env.NODE_ENV === 'development'
    const TEST_LIPSYNC_VIDEO_URL =
      'https://v3b.fal.media/files/b/tiger/mak7VQyKPCP3HJeazjbl__tmp0r5i6khu.mp4'

    if (isDev && process.env.USE_TEST_LIPSYNC === 'true') {
      console.log('🧪 [AI REELS TEST MODE] Using hardcoded lip-sync video URL')

      ctx.session.aiReels = {
        ...ctx.session.aiReels,
        firstVideoUrl: TEST_LIPSYNC_VIDEO_URL,
        step: 'wan_generation',
      }

      await ctx.reply(
        isRu
          ? `🧪 ТЕСТОВЫЙ РЕЖИМ: Используем готовое lip-sync видео\n\n✅ Первое видео (lip-sync) готово!`
          : `🧪 TEST MODE: Using existing lip-sync video\n\n✅ First video (lip-sync) ready!`
      )

      await ctx.replyWithVideo(
        { url: TEST_LIPSYNC_VIDEO_URL },
        {
          caption: isRu
            ? `🎬 Промежуточный результат - Lip-sync видео (тест)`
            : `🎬 Intermediate result - Lip-sync video (test)`,
        }
      )

      await ctx.reply(
        isRu
          ? `🎬 Создаем второе видео (WAN 2.5)...\n⏳ Это займет 5-10 минут...`
          : `🎬 Creating second video (WAN 2.5)...\n⏳ This will take 5-10 minutes...`
      )

      console.log('🔄 [AI REELS TEST MODE] Skipping to Step 3 (Veo 3.1):', {
        telegramId,
        testVideoUrl: TEST_LIPSYNC_VIDEO_URL,
      })

      // Переходим к Step 3 и вызываем его вручную
      await ctx.wizard.next()

      const nextStep = (ctx.wizard as any).steps[ctx.wizard.cursor]
      if (nextStep && typeof nextStep === 'function') {
        console.log('🔄 [AI REELS TEST MODE] Manually executing Step 3...', {
          telegramId,
          cursor: ctx.wizard.cursor,
        })
        return await nextStep(ctx)
      } else {
        console.error('❌ [AI REELS TEST MODE] Next step not found!')
        return ctx.scene.leave()
      }
    }

    try {
      let text: string = ''
      let imageUrl: string
      let audioUrl: string | null = null

      if (ctx.session.aiReels?.text && ctx.session.aiReels?.imageUrl) {
        // Используем сохраненные данные
        text = ctx.session.aiReels.text
        imageUrl = ctx.session.aiReels.imageUrl
      } else {
        // Обычный флоу: получаем текст или голосовое сообщение
        imageUrl = ctx.session.aiReels?.imageUrl || ''

        if (!imageUrl) {
          await ctx.reply(
            isRu
              ? '❌ Ошибка: изображение не найдено. Начните заново.'
              : '❌ Error: image not found. Start over.'
          )
          return ctx.scene.leave()
        }

        // Проверяем тип сообщения: текст или голос
        if (message && 'voice' in message) {
          const voice = message.voice

          logger.info('🎤 [AI REELS] Получено голосовое сообщение', {
            telegramId,
            duration: voice.duration,
            fileSize: voice.file_size,
          })

          if (voice.duration > 30) {
            await ctx.reply(
              isRu
                ? `❌ Голосовое сообщение слишком длинное (${voice.duration} сек). Максимум: 30 секунд.`
                : `❌ Voice message is too long (${voice.duration} sec). Maximum: 30 seconds.`
            )
            return ctx.scene.leave()
          }

          // Скачиваем и загружаем голосовое сообщение
          try {
            const fileLink = await ctx.telegram.getFileLink(voice.file_id)
            const response = await fetch(fileLink.href, {
              signal: AbortSignal.timeout(60_000),
            })

            if (!response.ok) {
              throw new Error(
                `Failed to download voice: ${response.statusText}`
              )
            }

            const audioBuffer = Buffer.from(await response.arrayBuffer())

            const { createClient } = await import('@supabase/supabase-js')
            const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import(
              '@/config'
            )

            const serviceClient = createClient(
              SUPABASE_URL!,
              SUPABASE_SERVICE_ROLE_KEY!
            )
            const fileName = `ai-reels-audio/${telegramId}/${Date.now()}.ogg`

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
            text = 'voice_message_' + voice.duration // Placeholder для расчета стоимости

            logger.info('✅ [AI REELS] Голосовое сообщение загружено', {
              telegramId,
              audioUrl,
              duration: voice.duration,
            })
          } catch (voiceError) {
            logger.error('❌ [AI REELS] Ошибка обработки голоса', {
              voiceError,
            })
            await ctx.reply(
              isRu
                ? '❌ Ошибка обработки голосового сообщения. Попробуйте еще раз.'
                : '❌ Error processing voice message. Please try again.'
            )
            return ctx.scene.leave()
          }
        } else if (message && 'text' in message) {
          text = message.text.trim()

          if (text.length === 0) {
            await ctx.reply(
              isRu
                ? '❌ Текст не может быть пустым.'
                : '❌ Text cannot be empty.'
            )
            return ctx.scene.leave()
          }

          if (text.length > 5000) {
            await ctx.reply(
              isRu
                ? `❌ Текст слишком длинный (${text.length} символов). Максимум: 5000 символов.`
                : `❌ Text is too long (${text.length} characters). Maximum: 5000 characters.`
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
      }

      // Проверка наличия голоса аватара (только если используем текст)
      if (!audioUrl) {
        const { supabase } = await import('@/core/supabase')
        const { data: userData } = await supabase
          .from('users')
          .select('voice_id_elevenlabs')
          .eq('telegram_id', telegramId)
          .maybeSingle()

        const userVoiceId = userData?.voice_id_elevenlabs

        if (!userVoiceId) {
          // Сохраняем состояние и предлагаем создать голос
          ctx.session.aiReels = {
            ...ctx.session.aiReels,
            imageUrl,
            text,
            step: 'text',
            needsVoiceCreation: true,
          }

          await ctx.reply(
            isRu
              ? '❌ У вас не настроен голос аватара!\n\n' +
                  '📝 Для создания ИИ Рилс нужен голос аватара.\n\n' +
                  '🎤 Хотите создать голос сейчас? Это займет 1-2 минуты.\n\n' +
                  '📌 После создания голоса вы сможете продолжить создание рилса.'
              : "❌ You don't have an avatar voice configured!\n\n" +
                  '📝 AI Reels creation requires an avatar voice.\n\n' +
                  '🎤 Want to create a voice now? It takes 1-2 minutes.\n\n' +
                  '📌 After creating the voice, you can continue with reels creation.'
          )

          const { ModeEnum } = await import('@/interfaces/modes')
          ctx.session.mode = ModeEnum.Voice
          ctx.session.returnToAIReelsAfterVoice = true

          await ctx.scene.enter(ModeEnum.Voice)
          return
        }

        // ✅ ВАЛИДАЦИЯ: Проверяем существование голоса в ElevenLabs API
        const { assertVoiceExistsAuthoritative } = await import(
          '@/core/elevenlabs'
        )

        logger.info(
          '🔍 [AI REELS] Проверяем валидность voice_id в ElevenLabs',
          {
            telegramId,
            voiceId: userVoiceId,
          }
        )

        // Only force the user to recreate their voice on a DEFINITIVE absence.
        // A bare checkVoiceExists() returns false on any non-authoritative result
        // too (no/invalid ElevenLabs key, outage), which would wrongly demand a
        // recreate for a voice that still exists. Proceed on "cannot determine".
        let isVoiceValid = true
        try {
          isVoiceValid = await assertVoiceExistsAuthoritative(userVoiceId)
        } catch (voiceCheckError) {
          logger.warn(
            '[AI REELS] Voice existence not authoritative; proceeding with saved voice',
            {
              telegramId,
              voiceId: userVoiceId,
              error:
                voiceCheckError instanceof Error
                  ? voiceCheckError.message
                  : String(voiceCheckError),
            }
          )
          isVoiceValid = true
        }

        if (!isVoiceValid) {
          logger.warn('❌ [AI REELS] Voice ID не найден в ElevenLabs API', {
            telegramId,
            voiceId: userVoiceId,
          })

          // Сохраняем состояние и предлагаем пересоздать голос
          ctx.session.aiReels = {
            ...ctx.session.aiReels,
            imageUrl,
            text,
            step: 'text',
            needsVoiceCreation: true,
          }

          await ctx.reply(
            isRu
              ? '❌ Ваш голос не найден в системе ElevenLabs.\n\n' +
                  '🎤 Пожалуйста, пересоздайте свой голос командой /voice\n\n' +
                  '💡 После создания голоса вы сможете продолжить создание AI Reels с сохраненными данными.'
              : '❌ Your voice was not found in ElevenLabs system.\n\n' +
                  '🎤 Please recreate your voice using /voice command\n\n' +
                  '💡 After creating your voice, you can continue creating AI Reels with saved data.',
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    Markup.button.callback(
                      isRu ? '🎤 Создать голос' : '🎤 Create voice',
                      'create_voice_avatar'
                    ),
                  ],
                  [
                    Markup.button.callback(
                      isRu ? 'Отмена' : 'Cancel',
                      'ai_reels_cancel'
                    ),
                  ],
                ],
              },
            }
          )

          return ctx.scene.leave()
        }

        logger.info('✅ [AI REELS] Voice ID валидный', {
          telegramId,
          voiceId: userVoiceId,
        })
      }

      // 💰 Шаблон 1: Фиксированная стоимость 240⭐
      // Себестоимость: 160⭐ (VEO3) × 1.5 наценка = 240⭐
      // Включает: Lip-sync + 4 видео сцены + склеивание
      const totalCost = 240

      logger.info('💰 AI Reels Шаблон 1 - фиксированная стоимость', {
        totalCost,
        template: 'Template 1 (Veo 3.1)',
        markup: 1.5,
      })

      // Проверка баланса
      const currentBalance = await getUserBalance(telegramId)

      if (currentBalance === null) {
        await ctx.reply(
          isRu
            ? 'Ошибка получения баланса. Попробуйте позже.'
            : 'Error getting balance. Try again later.'
        )
        return ctx.scene.leave()
      }

      if (currentBalance < totalCost) {
        await ctx.reply(
          isRu
            ? `💰 Недостаточно средств для создания AI Reels\n\n` +
                `📊 Стоимость Шаблона 1: ${totalCost}⭐ ($${(totalCost / 100).toFixed(2)})\n` +
                `💳 У вас: ${currentBalance.toFixed(2)}⭐`
            : `💰 Insufficient funds for AI Reels creation\n\n` +
                `📊 Template 1 cost: ${totalCost}⭐ ($${(totalCost / 100).toFixed(2)})\n` +
                `💳 You have: ${currentBalance.toFixed(2)}⭐`,
          standardButtons(isRu)
        )
        return ctx.scene.leave()
      }

      // Списание средств
      // In-flight guard: the charge + AI-reels generation below are awaited
      // before scene.leave(), so a second message during the ~generation would
      // re-enter this step and double-charge. Reject-before-set (sync); released
      // in the .leave() handler below. #1366
      if (ctx.session.aiReelsInProgress) {
        await ctx.reply(
          isRu
            ? '⏳ Уже генерирую, подождите...'
            : '⏳ Already generating, please wait...'
        )
        return
      }
      ctx.session.aiReelsInProgress = true
      const paymentSuccess = await updateUserBalance(
        telegramId,
        totalCost,
        PaymentType.MONEY_OUTCOME,
        'AI Reels Шаблон 1',
        {
          bot_name: ctx.botInfo?.username || 'unknown_bot',
          service_type: 'ai_reels_template_1',
          text_length: text.length,
          fixed_cost: totalCost,
        }
      )

      if (!paymentSuccess) {
        await ctx.reply(
          isRu
            ? 'Ошибка списания средств. Попробуйте позже.'
            : 'Error charging payment. Try again later.'
        )
        return ctx.scene.leave()
      }

      const newBalance = currentBalance - totalCost
      await ctx.reply(
        isRu
          ? `💰 Списано ${totalCost.toFixed(2)}⭐. Новый баланс: ${newBalance.toFixed(2)}⭐\n\n` +
              `🎬 Начинаем создание ИИ Рилс:\n` +
              `1️⃣ Генерация lip-sync видео...\n` +
              `⏳ Это займет 30-60 секунд...`
          : `💰 Charged ${totalCost.toFixed(2)}⭐. New balance: ${newBalance.toFixed(2)}⭐\n\n` +
              `🎬 Starting AI Reels creation:\n` +
              `1️⃣ Generating lip-sync video...\n` +
              `⏳ This will take 30-60 seconds...`
      )

      // Сохраняем данные в сессию
      ctx.session.aiReels = {
        ...ctx.session.aiReels,
        imageUrl,
        text,
        audioUrl,
        step: 'lipsync_generation',
      }

      // Генерация первого видео (lip-sync) через Fal.ai провайдер
      try {
        console.log(
          '🚨 [AI REELS] CRITICAL DEBUG: Начинаем генерацию lip-sync видео',
          {
            telegramId,
            hasImageUrl: !!imageUrl,
            hasText: !!text,
            hasAudioUrl: !!audioUrl,
            textLength: text?.length || 0,
          }
        )

        logger.info('🎭 [AI REELS] DEBUG: Начинаем генерацию lip-sync видео', {
          telegramId,
          hasImageUrl: !!imageUrl,
          hasText: !!text,
          hasAudioUrl: !!audioUrl,
          textLength: text?.length || 0,
        })

        // ✅ ИСПРАВЛЕНИЕ: Используем ТОЛЬКО fal провайдер для максимальной стабильности
        let finalAudioUrl = audioUrl

        // Если у нас есть текст, но нет аудио - генерируем аудио через централизованную систему
        if (!finalAudioUrl && text) {
          console.log(
            '🚨 [AI REELS] CRITICAL DEBUG: Нет аудио, генерируем из текста',
            {
              telegramId,
              textLength: text.length,
            }
          )

          logger.info('🎭 [AI REELS] DEBUG: Нет аудио, генерируем из текста', {
            telegramId,
            textLength: text.length,
          })

          // Hoisted so the catch below can unlink the temp mp3 on an upload
          // failure -- a const inside the try is invisible to the catch, which
          // is why every failed TTS upload used to leak one file in os.tmpdir().
          let audioPath: string | undefined
          try {
            logger.info(
              '🎤 [AI REELS] Генерируем аудио из текста через централизованную систему',
              {
                telegramId,
                textLength: text.length,
              }
            )

            // ✅ ИСПРАВЛЕНИЕ: Используем централизованную систему генерации аудио
            const { createAudioFileFromText } = await import(
              '@/core/elevenlabs/createAudioFileFromText'
            )
            const { getVoiceId } = await import('@/core/supabase/getVoiceId')
            const { checkVoiceExists } = await import('@/core/elevenlabs')

            // Получаем voice_id пользователя через централизованную систему
            const voiceId = await getVoiceId(telegramId)

            if (!voiceId) {
              // Отсутствующий voice_id — тот же UX, что и невалидный:
              // понятное сообщение с /voice вместо общего «ошибка обработки»
              // (инцидент чистки тестов №233: throw прятал причину).
              logger.warn('❌ [AI REELS] У пользователя нет voice_id', {
                telegramId,
              })
              ctx.session.aiReels = {
                ...ctx.session.aiReels,
                imageUrl,
                text,
                needsVoiceCreation: true,
              }
              await ctx.reply(
                isRu
                  ? '❌ Ваш голос не найден в системе ElevenLabs.\n\n' +
                      '🎤 Пожалуйста, сначала натренируйте свой голос командой /voice\n\n' +
                      '💡 После создания голоса вы сможете продолжить создание AI Reels с сохраненными данными.'
                  : '❌ Your voice was not found in ElevenLabs system.\n\n' +
                      '🎤 Please train your voice first using /voice command\n\n' +
                      '💡 After creating your voice, you can continue creating AI Reels with saved data.'
              )
              return ctx.scene.leave()
            }

            // ✅ ВАЛИДАЦИЯ: Проверяем существование голоса в ElevenLabs API
            logger.info(
              '🔍 [AI REELS] Проверяем валидность voice_id в ElevenLabs',
              {
                telegramId,
                voiceId,
              }
            )

            const isVoiceValid = await checkVoiceExists(voiceId)

            if (!isVoiceValid) {
              logger.warn('❌ [AI REELS] Voice ID не найден в ElevenLabs API', {
                telegramId,
                voiceId,
              })

              // Сохраняем состояние и предлагаем создать голос
              ctx.session.aiReels = {
                ...ctx.session.aiReels,
                imageUrl,
                text,
                needsVoiceCreation: true,
              }

              await ctx.reply(
                isRu
                  ? '❌ Ваш голос не найден в системе ElevenLabs.\n\n' +
                      '🎤 Пожалуйста, сначала натренируйте свой голос командой /voice\n\n' +
                      '💡 После создания голоса вы сможете продолжить создание AI Reels с сохраненными данными.'
                  : '❌ Your voice was not found in ElevenLabs system.\n\n' +
                      '🎤 Please train your voice first using /voice command\n\n' +
                      '💡 After creating your voice, you can continue creating AI Reels with saved data.',
                {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        Markup.button.callback(
                          isRu ? '🎤 Создать голос' : '🎤 Create voice',
                          'create_voice_avatar'
                        ),
                      ],
                      [
                        Markup.button.callback(
                          isRu ? 'Отмена' : 'Cancel',
                          'ai_reels_cancel'
                        ),
                      ],
                    ],
                  },
                }
              )

              return ctx.scene.leave()
            }

            logger.info(
              '✅ [AI REELS] Voice ID валидный, используем централизованную систему голосов',
              {
                telegramId,
                voiceId,
                textLength: text.length,
              }
            )

            // Генерируем аудио через централизованную систему
            logger.info(
              '🎤 [AI REELS] DEBUG: Вызываем createAudioFileFromText',
              {
                telegramId,
                voiceId,
                textLength: text.length,
              }
            )

            audioPath = await createAudioFileFromText({
              text,
              voice_id: voiceId,
              telegram_id: telegramId,
            })

            logger.info(
              '🎤 [AI REELS] DEBUG: createAudioFileFromText завершен',
              {
                telegramId,
                audioPath,
                hasAudioPath: !!audioPath,
              }
            )

            if (!audioPath) {
              throw new Error('Failed to generate audio from text')
            }

            // Загружаем сгенерированное аудио в Supabase Storage
            logger.info(
              '🎤 [AI REELS] DEBUG: Загружаем аудио в Supabase Storage',
              {
                telegramId,
                audioPath,
              }
            )

            const fs = await import('fs/promises')
            const audioBuffer = await fs.readFile(audioPath)

            logger.info('🎤 [AI REELS] DEBUG: Аудио файл прочитан', {
              telegramId,
              audioBufferSize: audioBuffer.length,
            })

            const { createClient } = await import('@supabase/supabase-js')
            const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import(
              '@/config'
            )

            const serviceClient = createClient(
              SUPABASE_URL!,
              SUPABASE_SERVICE_ROLE_KEY!
            )
            const fileName = `ai-reels-generated-audio/${telegramId}/${Date.now()}.mp3`

            logger.info('🎤 [AI REELS] DEBUG: Загружаем в Supabase', {
              telegramId,
              fileName,
              audioBufferSize: audioBuffer.length,
            })

            const { error: uploadError } = await serviceClient.storage
              .from('images')
              .upload(fileName, audioBuffer, {
                contentType: 'audio/mpeg',
                upsert: false,
              })

            if (uploadError) {
              throw new Error(`Upload failed: ${uploadError.message}`)
            }

            logger.info('🎤 [AI REELS] DEBUG: Загрузка в Supabase успешна', {
              telegramId,
              fileName,
            })

            const { data: urlData } = serviceClient.storage
              .from('images')
              .getPublicUrl(fileName)

            finalAudioUrl = urlData.publicUrl

            logger.info('🎤 [AI REELS] DEBUG: Получен public URL', {
              telegramId,
              finalAudioUrl: finalAudioUrl.substring(0, 100),
            })

            // Удаляем временный файл
            try {
              await fs.unlink(audioPath)
              logger.info('🗑️ [AI REELS] Временный файл удален', {
                telegramId,
                audioPath,
              })
            } catch (cleanupError) {
              logger.warn('⚠️ [AI REELS] Не удалось удалить временный файл', {
                audioPath,
                error: cleanupError,
              })
            }

            logger.info(
              '✅ [AI REELS] Аудио сгенерировано через централизованную систему',
              {
                telegramId,
                voiceId,
                audioUrl: finalAudioUrl.substring(0, 100),
              }
            )

            console.log(
              '🚨 [AI REELS] CRITICAL DEBUG: Аудио сгенерировано, переходим к Fal.ai',
              {
                telegramId,
                hasFinalAudioUrl: !!finalAudioUrl,
                finalAudioUrlLength: finalAudioUrl?.length || 0,
              }
            )

            logger.info(
              '🎭 [AI REELS] DEBUG: Переходим к созданию input для Fal.ai',
              {
                telegramId,
                hasFinalAudioUrl: !!finalAudioUrl,
                finalAudioUrlLength: finalAudioUrl?.length || 0,
              }
            )
          } catch (audioError) {
            logger.error('❌ [AI REELS] Ошибка генерации аудио из текста', {
              error: audioError,
              errorMessage:
                audioError instanceof Error
                  ? audioError.message
                  : 'Unknown error',
              errorStack:
                audioError instanceof Error ? audioError.stack : undefined,
              telegramId,
              textLength: text.length,
            })

            // Unlink the temp mp3 if it was created before the failure (e.g. a
            // Supabase upload error thrown after createAudioFileFromText wrote
            // it). The happy-path unlink is unreachable on this branch, so
            // without this every failed TTS upload leaks a file in os.tmpdir().
            if (audioPath) {
              await fs.unlink(audioPath).catch(() => {})
            }

            // Деньги уже списаны выше (updateUserBalance перед началом
            // генерации), а работа не выполнена — без возврата пользователь
            // платит за ничто. Соседние ветки отказа (Fal.ai lip-sync, строка
            // ниже) возврат делают; здесь его не было.
            await refundAndTell({
              ctx,
              telegramId,
              amount: totalCost,
              description: 'AI Reels refund - text-to-speech failed',
              reason: {
                ru: `Ошибка генерации аудио из текста (${totalCost.toFixed(2)}⭐)`,
                en: `Text-to-speech generation failed (${totalCost.toFixed(2)}⭐)`,
              },
              isRu,
            })

            await ctx.reply(
              isRu
                ? '❌ Ошибка генерации аудио из текста. Попробуйте отправить голосовое сообщение.'
                : '❌ Error generating audio from text. Try sending a voice message.'
            )
            return ctx.scene.leave()
          }
        }

        if (!finalAudioUrl) {
          throw new Error('No audio URL available for fal provider')
        }

        console.log(
          '🚨 [AI REELS] CRITICAL DEBUG: Создаем input для Fal.ai провайдера',
          {
            telegramId,
            imageUrl: imageUrl.substring(0, 100),
            finalAudioUrl: finalAudioUrl.substring(0, 100),
            textLength: text.length,
          }
        )

        logger.info(
          '🎭 [AI REELS] DEBUG: Создаем input для Fal.ai провайдера',
          {
            telegramId,
            imageUrl: imageUrl.substring(0, 100),
            finalAudioUrl: finalAudioUrl.substring(0, 100),
            textLength: text.length,
          }
        )

        console.log(
          '🚨 [AI REELS] CRITICAL DEBUG: Создаем LipSyncInputBuilder для Fal.ai',
          {
            telegramId,
            imageUrl: imageUrl.substring(0, 50),
            finalAudioUrl: finalAudioUrl.substring(0, 50),
          }
        )

        // ✅ ИСПОЛЬЗУЕМ FAL.AI: Fal.ai Veed Fabric 1.0 Fast провайдер
        const input = LipSyncInputBuilder.forFalVeedFabric(
          imageUrl,
          finalAudioUrl,
          telegramId,
          {
            botName: ctx.botInfo?.username || 'unknown_bot',
            resolution: '720p',
          }
        )

        console.log('🚨 [AI REELS] CRITICAL DEBUG: Input создан успешно', {
          telegramId,
          inputProvider: input.provider,
          inputModelId: input.modelId,
          inputResolution: input.resolution,
        })

        logger.info(
          '🎭 [AI REELS] Input создан для Fal.ai Veed Fabric 1.0 Fast',
          {
            telegramId,
            inputProvider: input.provider,
            inputModelId: input.modelId,
            inputResolution: input.resolution,
          }
        )

        logger.info(
          '🎭 [AI REELS] Запуск генерации lip-sync через Fal.ai Veed Fabric 1.0 Fast',
          {
            telegramId,
            imageUrl: imageUrl.substring(0, 100),
            audioUrl: finalAudioUrl.substring(0, 100),
            provider: input.provider,
            modelId: input.modelId,
            resolution: input.resolution,
          }
        )

        console.log(
          '🚨 [AI REELS] CRITICAL DEBUG: Запускаем СИНХРОННУЮ генерацию через Fal.ai',
          {
            telegramId,
            provider: input.provider,
            modelId: input.modelId,
          }
        )

        // ✅ ПРАВИЛЬНО: Fal.ai работает СИНХРОННО - используем провайдер напрямую
        const { FalVeedFabricProvider } = await import(
          '@/core/lipsync/providers/fal-veed-fabric-provider'
        )

        const falProvider = new FalVeedFabricProvider()

        logger.info(
          '🎭 [AI REELS] Запуск СИНХРОННОЙ генерации lip-sync через Fal.ai',
          {
            telegramId,
            provider: 'fal',
            modelId: 'fal-veed-fabric-1.0-fast',
            resolution: input.resolution,
          }
        )

        // Уведомляем пользователя
        await ctx.reply(
          isRu
            ? `🎬 Создаем первое видео (lip-sync)...\n⏳ Подождите 30-60 секунд...`
            : `🎬 Creating first video (lip-sync)...\n⏳ Please wait 30-60 seconds...`
        )

        // ✅ Генерируем lip-sync СИНХРОННО
        const lipSyncResult = await falProvider.generate(input)

        console.log('🚨 [AI REELS] CRITICAL DEBUG: Fal.ai результат получен', {
          telegramId,
          hasOutput: !!(lipSyncResult as any).output,
          hasError: !!(lipSyncResult as any).error,
          status: (lipSyncResult as any).status,
          fullResult: JSON.stringify(lipSyncResult).substring(0, 500),
        })

        console.log('🔍 [AI REELS] Checking result validity:', {
          telegramId,
          hasErrorField: 'error' in lipSyncResult,
          outputValue: (lipSyncResult as any).output?.substring(0, 100),
          outputExists: !!lipSyncResult.output,
        })

        // Проверяем результат
        if ('error' in lipSyncResult || !lipSyncResult.output) {
          logger.error('❌ [AI REELS] Fal.ai генерация провалилась', {
            telegramId,
            error: lipSyncResult,
          })

          // Возврат средств. Обещать возврат, не проверив начисление, значит
          // молча оставлять человека без денег.
          await refundAndTell({
            ctx,
            telegramId,
            amount: totalCost,
            description: 'AI Reels refund - Fal.ai lip-sync failed',
            reason: {
              ru: `Ошибка генерации lip-sync видео (${totalCost.toFixed(2)}⭐)`,
              en: `Lip-sync generation failed (${totalCost.toFixed(2)}⭐)`,
            },
            isRu,
          })

          return ctx.scene.leave()
        }

        // ✅ Успех! Сохраняем URL первого видео в session
        const lipSyncVideoUrl = lipSyncResult.output

        console.log('🔍 [AI REELS] Сохраняем результат в session:', {
          telegramId,
          lipSyncVideoUrl: lipSyncVideoUrl?.substring(0, 100),
          sessionExists: !!ctx.session,
          aiReelsExists: !!ctx.session?.aiReels,
        })

        ctx.session.aiReels = {
          ...ctx.session.aiReels,
          firstVideoUrl: lipSyncVideoUrl,
          step: 'wan_generation',
        }

        console.log('✅ [AI REELS] Session обновлён:', {
          telegramId,
          firstVideoUrl: ctx.session.aiReels?.firstVideoUrl?.substring(0, 100),
        })

        logger.info('✅ [AI REELS] Lip-sync видео готово, переход к Step 3', {
          telegramId,
          lipSyncVideoUrl: lipSyncVideoUrl.substring(0, 100),
        })

        // ✅ ОТПРАВЛЯЕМ LIP-SYNC ВИДЕО ПОЛЬЗОВАТЕЛЮ (промежуточный результат)
        await ctx.reply(
          isRu
            ? `✅ Первое видео (lip-sync) готово!`
            : `✅ First video (lip-sync) ready!`
        )

        console.log('📤 [AI REELS] Отправляем lip-sync видео пользователю:', {
          telegramId,
          url: lipSyncVideoUrl.substring(0, 100),
        })

        await ctx.replyWithVideo(
          { url: lipSyncVideoUrl },
          {
            caption: isRu
              ? `🎬 Промежуточный результат - Lip-sync видео`
              : `🎬 Intermediate result - Lip-sync video`,
          }
        )

        await ctx.reply(
          isRu
            ? `🎬 Создаем второе видео (Google Veo 3.1)...\n⏳ Это займет 5-10 минут...`
            : `🎬 Creating second video (Google Veo 3.1)...\n⏳ This will take 5-10 minutes...`
        )

        console.log('🔄 [AI REELS] Переходим к Step 3 (Veo 3.1):', {
          telegramId,
          currentStep: ctx.wizard?.cursor ?? 0,
        })

        // ✅ ПЕРЕХОДИМ К STEP 3 (Veo 3.1 генерация) и ВЫЗЫВАЕМ его вручную
        await ctx.wizard.next()

        // Вручную вызываем следующий step
        const nextStep = (ctx.wizard as any).steps[ctx.wizard.cursor]
        if (nextStep && typeof nextStep === 'function') {
          console.log('🔄 [AI REELS] Manually executing Step 3...', {
            telegramId,
            cursor: ctx.wizard?.cursor ?? 0,
          })
          return await nextStep(ctx)
        } else {
          console.error('❌ [AI REELS] Next step not found!', {
            telegramId,
            cursor: ctx.wizard?.cursor ?? 0,
            totalSteps: (ctx.wizard as any).steps.length,
          })
          return ctx.scene.leave()
        }
      } catch (genError) {
        // ✅ УЛУЧШЕНО: Детальное логирование с полной информацией об ошибке
        logger.error(
          '❌ [AI REELS] Критическая ошибка генерации lip-sync через fal провайдер',
          {
            error: genError,
            errorMessage:
              genError instanceof Error ? genError.message : 'Unknown error',
            errorStack: genError instanceof Error ? genError.stack : undefined,
            errorName:
              genError instanceof Error ? genError.name : typeof genError,
            telegramId,
            imageUrl: imageUrl?.substring(0, 100),
            hasAudioUrl: !!audioUrl,
            hasText: !!text,
            textLength: text?.length || 0,
            provider: 'fal',
            isTimeout:
              genError instanceof Error && genError.message.includes('timeout'),
            isElevenLabsError:
              genError instanceof Error &&
              genError.message.includes('ElevenLabs'),
            isFalApiError:
              genError instanceof Error && genError.message.includes('Fal.ai'),
          }
        )

        // Refund via refundAndTell: it checks the credit result and tells the
        // user by fact. The raw updateUserBalance call here ignored its result,
        // so "Funds refunded" was said even when the credit returned false.
        const isTimeout =
          genError instanceof Error && genError.message.includes('timeout')
        const isElevenLabsError =
          genError instanceof Error && genError.message.includes('ElevenLabs')
        const isFalApiError =
          genError instanceof Error && genError.message.includes('Fal.ai')

        const refundReason = isTimeout
          ? {
              ru: '⏰ Таймаут генерации lip-sync видео через fal провайдер. Серверы перегружены, попробуйте позже.',
              en: '⏰ Lip-sync generation timeout via fal provider. Servers are overloaded, try again later.',
            }
          : isElevenLabsError
            ? {
                ru: '🎤 Ошибка генерации голоса. Проблема с ElevenLabs API.',
                en: '🎤 Voice generation error. ElevenLabs API issue.',
              }
            : isFalApiError
              ? {
                  ru: '🎭 Ошибка fal провайдера. Проблема с Fal.ai API.',
                  en: '🎭 Fal provider error. Fal.ai API issue.',
                }
              : {
                  ru: 'Критическая ошибка генерации lip-sync видео через fal провайдер.',
                  en: 'Critical lip-sync generation error via fal provider.',
                }

        await refundAndTell({
          ctx,
          telegramId,
          amount: totalCost,
          description: 'AI Reels refund - critical lip-sync error',
          reason: refundReason,
          isRu,
        })
        return ctx.scene.leave()
      }
    } catch (error) {
      logger.error('❌ [AI REELS] Ошибка в step 2', { error })
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка. Попробуйте позже.'
          : '❌ An error occurred. Try again later.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 3: Генерация второго видео через Google Veo 3.1
  async ctx => {
    console.log('🎬🎬🎬 [AI REELS] STEP 3 EXECUTING!')

    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    console.log('🎬 [AI REELS] Step 3 - Initial data:', {
      telegramId,
      hasSession: !!ctx.session,
      hasAiReels: !!ctx.session?.aiReels,
      firstVideoUrl: ctx.session?.aiReels?.firstVideoUrl?.substring(0, 100),
      imageUrl: ctx.session?.aiReels?.imageUrl?.substring(0, 100),
    })

    logger.info(
      '🎬 [AI REELS WIZARD] Step 3 STARTED - Генерация Google Veo 3.1 видео',
      {
        telegramId,
        function: 'aiReelsWizard.step3',
        hasFirstVideo: !!ctx.session?.aiReels?.firstVideoUrl,
        hasImageUrl: !!ctx.session?.aiReels?.imageUrl,
      }
    )

    if (
      !telegramId ||
      !ctx.session.aiReels?.firstVideoUrl ||
      !ctx.session.aiReels?.imageUrl
    ) {
      console.log('❌ [AI REELS] Step 3 - Validation failed:', {
        telegramId: !!telegramId,
        firstVideoUrl: !!ctx.session?.aiReels?.firstVideoUrl,
        imageUrl: !!ctx.session?.aiReels?.imageUrl,
      })

      await ctx.reply(
        isRu
          ? '❌ Ошибка: не найдены данные первого видео. Начните заново.'
          : '❌ Error: first video data not found. Start over.'
      )
      return ctx.scene.leave()
    }

    console.log(
      '✅ [AI REELS] Step 3 - Validation passed, proceeding with Google Veo 3.1'
    )

    try {
      const imageUrl = ctx.session.aiReels.imageUrl

      logger.info('🔥 [AI REELS] Генерация Google Veo 3.1 через Fal.ai', {
        telegramId,
        imageUrl: imageUrl.substring(0, 100),
        resolution: ctx.session.aiReels?.resolution || '720p',
      })

      console.log('📦 [AI REELS FAL VEO 3.1] REQUEST:', {
        telegramId,
        provider: 'fal',
        model: 'fal-ai/veo3.1/reference-to-video',
        image_url: imageUrl.substring(0, 100) + '...',
        resolution: ctx.session.aiReels?.resolution || '720p',
      })

      try {
        // ✅ ТЕСТОВЫЙ РЕЖИМ - отдельный флаг для Veo 3.1
        const isDev = process.env.NODE_ENV === 'development'
        const useTestVeo31 = isDev && process.env.USE_TEST_VEO31 === 'true'
        const TEST_VEO31_VIDEO_URL =
          'https://storage.googleapis.com/falserverless/example_outputs/veo31-r2v-output.mp4'

        let veo31Result: { videoUrl?: string; output?: string; error?: string }
        let storyPrompt: string

        if (useTestVeo31) {
          console.log(
            '🧪 [AI REELS TEST MODE] Using test Veo 3.1 video URL (no API call)'
          )
          storyPrompt =
            'The person from the reference image speaks confidently to camera. Professional studio setup, cinematic lighting, engaging delivery.' // fallback промпт
          veo31Result = {
            videoUrl: TEST_VEO31_VIDEO_URL,
            output: TEST_VEO31_VIDEO_URL,
          }
        } else {
          // ✅ СИНХРОННЫЙ ВЫЗОВ Google Veo 3.1 с story continuation промптом
          const falVeo31 = new FalVeo31Provider()

          // 🎨 ГЕНЕРАЦИЯ STORY PROMPT на основе текста пользователя
          const userText = ctx.session.aiReels?.text || ''

          console.log(
            '📖 [AI REELS] Generating story continuation prompt from user text',
            {
              userText: userText.substring(0, 100),
              language: isRu ? 'ru' : 'en',
            }
          )

          // storyPrompt = await falVeo31.generateStoryPrompt(userText, isRu ? 'ru' : 'en')
          // Вызов выше закомментирован, а storyPrompt читается ниже
          // (storyPrompt.length) — без присваивания это TypeError на undefined.
          // Тот же запасной промпт, что и в тестовом режиме.
          storyPrompt =
            'The person from the reference image speaks confidently to camera. Professional studio setup, cinematic lighting, engaging delivery.'

          console.log('✅ [AI REELS] Story prompt generated', {
            promptLength: storyPrompt.length,
            preview: storyPrompt.substring(0, 200) + '...',
          })

          const veo31Input = {
            imageUrl,
            prompt: storyPrompt, // используем сгенерированный story prompt
            telegramId,
            botName: ctx.botInfo?.username || 'unknown_bot',
            resolution: (ctx.session.aiReels?.resolution || '720p') as
              | '720p'
              | '1080p',
            provider: 'fal' as const,
            modelId: 'fal-veo31',
          }

          console.log(
            '🚀 [AI REELS FAL VEO 3.1] Calling Fal.ai synchronously...',
            {
              resolution: veo31Input.resolution,
              promptLength: storyPrompt.length,
            }
          )
          // veo31Result = await falVeo31.generate(veo31Input)

          // ⚠️ ОБА ВЫЗОВА ВЫШЕ ЗАКОММЕНТИРОВАНЫ (и generateStoryPrompt, и
          // generate). В продакшене (useTestVeo31 = false) это значило, что
          // storyPrompt и veo31Result оставались undefined, а следующая же
          // строка читала veo31Result.output — TypeError, причём ПОСЛЕ
          // списания средств. Пользователь платил и получал падение.
          //
          // Не включаю платные вызовы Fal.ai за владельца, но и падать молча
          // нельзя: помечаем состояние явной ошибкой, чтобы сработал штатный
          // путь обработки ниже (сообщение пользователю + сохранение первого
          // видео). Снимите комментарии, когда решите вернуть VEO 3.1.
          veo31Result = {
            error:
              'VEO 3.1 generation is disabled: calls to FalVeo31Provider are commented out',
          }
        }

        console.log('✅ [AI REELS FAL VEO 3.1] Generation completed:', {
          hasOutput: !!veo31Result.output,
          hasVideoUrl: !!veo31Result.videoUrl,
          hasError: !!veo31Result.error,
          videoUrl: veo31Result.output?.substring(0, 100),
        })

        if (veo31Result.error || !veo31Result.output) {
          throw new Error(
            veo31Result.error || 'Fal.ai Veo 3.1 generation failed'
          )
        }

        const secondVideoUrl = veo31Result.output

        // Сохраняем URL второго видео и story prompt
        ctx.session.aiReels = {
          ...ctx.session.aiReels,
          secondVideoUrl,
          wan25Prompt: storyPrompt, // сохраняем как wan25Prompt для совместимости
          step: 'merging',
        }

        logger.info(
          '✅ [AI REELS] Второе видео (Google Veo 3.1) сгенерировано',
          {
            telegramId,
            secondVideoUrl: secondVideoUrl.substring(0, 100),
            storyPromptUsed: storyPrompt.substring(0, 150),
          }
        )

        // ✅ ОТПРАВЛЯЕМ VEO 3.1 ВИДЕО ПОЛЬЗОВАТЕЛЮ (промежуточный результат)
        await ctx.reply(
          isRu
            ? `✅ Второе видео (Google Veo 3.1 - 8 сек) готово!\n\n📖 История:\n${storyPrompt.substring(0, 200)}${storyPrompt.length > 200 ? '...' : ''}`
            : `✅ Second video (Google Veo 3.1 - 8s) ready!\n\n📖 Story:\n${storyPrompt.substring(0, 200)}${storyPrompt.length > 200 ? '...' : ''}`
        )

        await ctx.replyWithVideo(
          { url: secondVideoUrl },
          {
            caption: isRu
              ? `🎬 Промежуточный результат - Google Veo 3.1 видео (8 сек)`
              : `🎬 Intermediate result - Google Veo 3.1 video (8s)`,
          }
        )
      } catch (veo31Error) {
        // 🔥 ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ОШИБКИ VEO 3.1
        console.error('❌ [AI REELS VEO 3.1] ERROR CAUGHT:', {
          error: veo31Error,
          errorMessage:
            veo31Error instanceof Error
              ? veo31Error.message
              : String(veo31Error),
          errorStack:
            veo31Error instanceof Error ? veo31Error.stack : undefined,
          errorName:
            veo31Error instanceof Error ? veo31Error.name : typeof veo31Error,
          telegramId,
        })

        logger.error('❌ [AI REELS] Ошибка генерации Veo 3.1', {
          error: veo31Error,
          errorMessage:
            veo31Error instanceof Error
              ? veo31Error.message
              : String(veo31Error),
        })

        // Проверяем, является ли это timeout ошибкой
        const isTimeout =
          veo31Error instanceof Error && veo31Error.message.includes('timeout')

        await ctx.reply(
          isRu
            ? isTimeout
              ? '⏱️ Генерация Veo 3.1 видео заняла больше времени, чем ожидалось.\n' +
                'Но первое видео готово!'
              : '❌ Ошибка генерации второго видео. Но первое видео готово!'
            : isTimeout
              ? '⏱️ Veo 3.1 video generation took longer than expected.\n' +
                'But first video is ready!'
              : '❌ Error generating second video. But first video is ready!'
        )

        // ✅ Отправляем первое видео (lip-sync) файлом
        if (ctx.session.aiReels?.firstVideoUrl) {
          await ctx.replyWithVideo(
            { url: ctx.session.aiReels.firstVideoUrl },
            {
              caption: isRu
                ? `🎬 Ваше lip-sync видео`
                : `🎬 Your lip-sync video`,
            }
          )
        }

        return ctx.scene.leave()
      }

      // ✅ WAN v2.2-5b генерация завершена успешно, переходим к склеиванию
      // Выносим Step 4 invocation ВНЕ try-catch блока WAN 2.5, чтобы ошибки Step 4
      // не ловились как ошибки WAN 2.5

      await ctx.reply(
        isRu
          ? `3️⃣ Склеиваем два видео в финальный ролик...\n⏳ Это займет 30-45 секунд...`
          : `3️⃣ Merging two videos into final reel...\n⏳ This will take 30-45 seconds...`
      )

      // Переходим к следующему шагу (склеивание) и ВЫЗЫВАЕМ его вручную
      console.log('🔄 [AI REELS] Before ctx.wizard.next():', {
        telegramId,
        currentCursor: ctx.wizard?.cursor ?? 0,
        totalSteps: (ctx.wizard as any).steps.length,
      })

      await ctx.wizard.next()

      console.log('🔄 [AI REELS] After ctx.wizard.next():', {
        telegramId,
        newCursor: ctx.wizard?.cursor ?? 0,
        totalSteps: (ctx.wizard as any).steps.length,
      })

      // Вручную вызываем следующий step
      const nextStep = (ctx.wizard as any).steps[ctx.wizard?.cursor ?? 0]

      console.log('🔍 [AI REELS] Next step info:', {
        telegramId,
        hasNextStep: !!nextStep,
        isFunction: typeof nextStep === 'function',
        nextStepType: typeof nextStep,
        cursor: ctx.wizard?.cursor ?? 0,
      })

      if (nextStep && typeof nextStep === 'function') {
        console.log('✅ [AI REELS] Manually executing Step 4...', {
          telegramId,
          cursor: ctx.wizard?.cursor ?? 0,
        })
        return await nextStep(ctx)
      } else {
        console.error('❌ [AI REELS] Step 4 not found!', {
          telegramId,
          cursor: ctx.wizard?.cursor ?? 0,
          totalSteps: (ctx.wizard as any).steps.length,
          allSteps: (ctx.wizard as any).steps.map((s: any, i: number) => ({
            index: i,
            type: typeof s,
            isFunction: typeof s === 'function',
          })),
        })
        return ctx.scene.leave()
      }
    } catch (error) {
      logger.error('❌ [AI REELS] Ошибка в Step 3 (Veo 3.1 или склеивание)', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      })

      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке видео. Но первое видео готово!'
          : '❌ Error occurred while processing video. But first video is ready!'
      )

      // ✅ Отправляем первое видео (lip-sync) файлом
      if (ctx.session.aiReels?.firstVideoUrl) {
        await ctx.replyWithVideo(
          { url: ctx.session.aiReels.firstVideoUrl },
          {
            caption: isRu ? `🎬 Ваше lip-sync видео` : `🎬 Your lip-sync video`,
          }
        )
      }

      return ctx.scene.leave()
    }
  },

  // Step 4: Склеивание двух видео
  async ctx => {
    console.log('🔥🔥🔥 [AI REELS STEP 4] Line 1: Function started')

    const isRu = isRussianFromState(ctx)
    console.log('🔥 [AI REELS STEP 4] Line 2: isRu =', isRu)

    const telegramId = ctx.from?.id?.toString()
    console.log('🔥 [AI REELS STEP 4] Line 3: telegramId =', telegramId)

    console.log('🚀🚀🚀 [AI REELS] STEP 4 ENTRY POINT', {
      telegramId,
      hasSession: !!ctx.session,
      hasAiReels: !!ctx.session?.aiReels,
      firstVideoUrl: ctx.session?.aiReels?.firstVideoUrl?.substring(0, 100),
      secondVideoUrl: ctx.session?.aiReels?.secondVideoUrl?.substring(0, 100),
      step: ctx.session?.aiReels?.step,
    })

    console.log('🔥 [AI REELS STEP 4] Line 4: About to call logger.info')

    logger.info('🎬 [AI REELS WIZARD] Step 4 STARTED - Склеивание видео', {
      telegramId,
      function: 'aiReelsWizard.step4',
    })

    console.log('🔥 [AI REELS STEP 4] Line 5: logger.info completed')

    console.log('🔥 [AI REELS STEP 4] Line 6: Checking validation', {
      hasTelegramId: !!telegramId,
      hasFirstVideoUrl: !!ctx.session?.aiReels?.firstVideoUrl,
      hasSecondVideoUrl: !!ctx.session?.aiReels?.secondVideoUrl,
    })

    if (
      !telegramId ||
      !ctx.session.aiReels?.firstVideoUrl ||
      !ctx.session.aiReels?.secondVideoUrl
    ) {
      console.log('❌❌❌ [AI REELS] Step 4 VALIDATION FAILED:', {
        hasTelegramId: !!telegramId,
        hasFirstVideoUrl: !!ctx.session?.aiReels?.firstVideoUrl,
        hasSecondVideoUrl: !!ctx.session?.aiReels?.secondVideoUrl,
        sessionData: JSON.stringify(ctx.session?.aiReels || {}),
      })

      await ctx.reply(
        isRu
          ? '❌ Ошибка: не найдены URL обоих видео. Проверьте предыдущие шаги.'
          : '❌ Error: both video URLs not found. Check previous steps.'
      )
      return ctx.scene.leave()
    }

    console.log('✅✅✅ [AI REELS STEP 4] Line 7: Validation PASSED!')

    try {
      console.log('🔥 [AI REELS STEP 4] Line 8: Extracting URLs from session')

      const firstVideoUrl = ctx.session.aiReels.firstVideoUrl
      const secondVideoUrl = ctx.session.aiReels.secondVideoUrl

      console.log('🔥 [AI REELS STEP 4] Line 9: URLs extracted', {
        firstVideoUrl: firstVideoUrl.substring(0, 50),
        secondVideoUrl: secondVideoUrl.substring(0, 50),
      })

      console.log(
        '🔥 [AI REELS STEP 4] Line 10: About to call logger.info for merging'
      )

      logger.info('🔗 [AI REELS] Начинаем склеивание видео', {
        telegramId,
        firstVideoUrl: firstVideoUrl.substring(0, 100),
        secondVideoUrl: secondVideoUrl.substring(0, 100),
      })

      console.log('🔥 [AI REELS STEP 4] Line 11: logger.info completed')

      // Создаем временную директорию для работы с видео
      console.log('🔥 [AI REELS STEP 4] Line 12: Creating temp directory...')

      const tempDir = path.join(
        os.tmpdir(),
        `ai-reels-${telegramId}-${Date.now()}`
      )

      console.log('🔥 [AI REELS STEP 4] Line 13: Temp dir path =', tempDir)

      await fs.mkdir(tempDir, { recursive: true })

      console.log('🔥 [AI REELS STEP 4] Line 14: Temp dir created successfully')

      try {
        console.log('🔥 [AI REELS STEP 4] Line 15: Defining video paths...')

        // Скачиваем оба видео
        const firstVideoPath = path.join(tempDir, 'first-video.mp4')
        const secondVideoPath = path.join(tempDir, 'second-video.mp4')
        const finalVideoPath = path.join(tempDir, 'final-reels.mp4')

        console.log('🔥 [AI REELS STEP 4] Line 16: Video paths defined', {
          firstVideoPath,
          secondVideoPath,
          finalVideoPath,
        })

        console.log('🔥 [AI REELS STEP 4] Line 17: About to download videos...')

        logger.info('📥 [AI REELS] Скачиваем видео', {
          telegramId,
          tempDir,
        })

        console.log(
          '🔥 [AI REELS STEP 4] Line 18: Starting Promise.all for downloads...'
        )

        await Promise.all([
          downloadFile(firstVideoUrl, firstVideoPath),
          downloadFile(secondVideoUrl, secondVideoPath),
        ])

        console.log('🔥 [AI REELS STEP 4] Line 19: Downloads completed!')

        const firstVideoSize = (await fs.stat(firstVideoPath)).size
        const secondVideoSize = (await fs.stat(secondVideoPath)).size

        console.log('🔥 [AI REELS STEP 4] Line 20: File sizes checked', {
          firstVideoSize,
          secondVideoSize,
        })

        logger.info('✅ [AI REELS] Видео скачаны, начинаем склеивание', {
          telegramId,
          firstVideoSize,
          secondVideoSize,
        })

        console.log(
          '🔥 [AI REELS STEP 4] Line 21: About to call combineVideos...'
        )

        // Склеиваем видео с помощью FFmpeg
        await combineVideos(
          [firstVideoPath, secondVideoPath],
          finalVideoPath,
          'none', // без перехода для простоты
          0
        )

        console.log('🔥 [AI REELS STEP 4] Line 22: combineVideos completed!')

        const finalVideoStats = await fs.stat(finalVideoPath)
        logger.info('🎬 [AI REELS] Видео склеено, отправляем файл напрямую', {
          telegramId,
          finalVideoSize: finalVideoStats.size,
          finalVideoPath,
        })

        // Обновляем сессию
        ctx.session.aiReels = {
          ...ctx.session.aiReels,
          step: 'completed' as any,
        }

        logger.info(
          '📤 [AI REELS] Отправляем финальное видео напрямую (без Supabase)',
          {
            telegramId,
            fileSize: finalVideoStats.size,
          }
        )

        // ✅ ОТПРАВЛЯЕМ ФАЙЛ НАПРЯМУЮ из локального хранилища
        const { createReadStream } = await import('fs')
        await ctx.replyWithVideo(
          { source: createReadStream(finalVideoPath) as any },
          {
            caption: isRu
              ? `🎬 Ваш AI Reels готов!\n\n✨ Приятного просмотра!`
              : `🎬 Your AI Reels is ready!\n\n✨ Enjoy!`,
          }
        )

        logger.info('✅ [AI REELS] Финальное видео отправлено', {
          telegramId,
        })

        await ctx.reply(
          isRu
            ? `✨ Спасибо за использование AI Reels!`
            : `✨ Thanks for using AI Reels!`
        )

        logger.info('🎉 [AI REELS] Финальный ролик готов', {
          telegramId,
          processingTime:
            Date.now() - (ctx.session.aiReels?.startTime || Date.now()),
        })

        // Очищаем сессию
        delete ctx.session.aiReels

        return ctx.scene.leave()
      } finally {
        // Очищаем временные файлы
        try {
          await fs.rm(tempDir, { recursive: true, force: true })
          logger.info('🧹 [AI REELS] Временные файлы очищены', { tempDir })
        } catch (cleanupError) {
          logger.warn('⚠️ [AI REELS] Ошибка очистки временных файлов', {
            error: cleanupError,
            tempDir,
          })
        }
      }
    } catch (error) {
      logger.error('❌ [AI REELS] Ошибка склеивания видео', { error })

      await ctx.reply(
        isRu
          ? '❌ Ошибка склеивания видео. Но оба видео готовы по отдельности!\n\n' +
              `🎬 Lip-sync видео: ${ctx.session.aiReels?.firstVideoUrl}\n` +
              `🎬 WAN 2.5 видео: ${ctx.session.aiReels?.secondVideoUrl}`
          : '❌ Error merging videos. But both videos are ready separately!\n\n' +
              `🎬 Lip-sync video: ${ctx.session.aiReels?.firstVideoUrl}\n` +
              `🎬 WAN 2.5 video: ${ctx.session.aiReels?.secondVideoUrl}`
      )

      return ctx.scene.leave()
    }
  }
)

// Release the in-flight guard on ANY scene exit (all paid-step paths call
// scene.leave). Reject-before-set is in the step; this is the release. #1366
aiReelsWizard.leave(async ctx => {
  if (ctx.session) {
    ctx.session.aiReelsInProgress = false
  }
})
