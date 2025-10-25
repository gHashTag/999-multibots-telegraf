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
import { FalWAN25Provider } from '@/core/lipsync/providers/fal-wan25-provider'
import { WAN25_DEFAULT_PROMPTS } from '@/config/wan25-config'

// Интерфейс для aiReels теперь определен в MySession interface

/**
 * ИИ Рилс Wizard - создает два видео (lip-sync + WAN 2.5) и склеивает их
 *
 * Последовательность:
 * 1. Получение изображения и текста/голоса
 * 2. Генерация первого видео (lip-sync)
 * 3. Генерация второго видео (WAN 2.5 image-to-video)
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
            '2️⃣ Создадим дополнительное видео через WAN 2.5\n' +
            '3️⃣ Склеим оба видео в единый ролик\n\n' +
            '📝 На следующем шаге выберите:\n' +
            '• Текст (будет озвучен вашим голосом аватара)\n' +
            '• 🎤 Голосовое сообщение (до 30 сек)'
        : '🎬 AI Reels - creating two videos\n\n' +
            '📸 Send a photo or image URL with a face for lip-sync video.\n\n' +
            '🎯 Process:\n' +
            '1️⃣ Create lip-sync video from your image\n' +
            '2️⃣ Create additional video via WAN 2.5\n' +
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
              '• Текст (до 500 символов) - будет озвучен голосом вашего аватара для lip-sync\n' +
              '• ИЛИ голосовое сообщение - будет использовано напрямую\n\n' +
              '💡 Этот текст/голос будет использован для первого видео (lip-sync)'
          : '✅ Image received!\n\n' +
              '📝 Now send:\n' +
              '• Text (up to 500 characters) - will be voiced with your avatar for lip-sync\n' +
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

      console.log('🔄 [AI REELS TEST MODE] Skipping to Step 3 (WAN 2.5):', {
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
            const response = await fetch(fileLink.href)

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

          if (text.length > 500) {
            await ctx.reply(
              isRu
                ? `❌ Текст слишком длинный (${text.length} символов). Максимум: 500 символов.`
                : `❌ Text is too long (${text.length} characters). Maximum: 500 characters.`
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

        if (!userData?.voice_id_elevenlabs) {
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

          await ctx.scene.enter(ModeEnum.CheckBalanceScene)
          return
        }
      }

      // 💰 Шаблон 1: Фиксированная стоимость 240⭐
      // Себестоимость: 160⭐ (VEO3) × 1.5 наценка = 240⭐
      // Включает: Lip-sync + 4 видео сцены + склеивание
      const totalCost = 240

      logger.info('💰 AI Reels Шаблон 1 - фиксированная стоимость', {
        totalCost,
        template: 'Template 1 (WAN25)',
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
                `💳 You have: ${currentBalance.toFixed(2)}⭐`
        )
        return ctx.scene.leave()
      }

      // Списание средств
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

            // Получаем voice_id пользователя через централизованную систему
            const voiceId = await getVoiceId(telegramId)

            if (!voiceId) {
              throw new Error('User voice ID not found for audio generation')
            }

            logger.info(
              '🎤 [AI REELS] Используем централизованную систему голосов',
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

            const audioPath = await createAudioFileFromText({
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

          // Возврат средств
          await updateUserBalance(
            telegramId,
            totalCost,
            PaymentType.MONEY_INCOME,
            'AI Reels refund - Fal.ai lip-sync failed',
            { bot_name: ctx.botInfo?.username || 'unknown_bot' }
          )

          await ctx.reply(
            isRu
              ? `❌ Ошибка генерации lip-sync видео\n💰 Средства возвращены: ${totalCost.toFixed(2)}⭐`
              : `❌ Lip-sync generation failed\n💰 Refunded: ${totalCost.toFixed(2)}⭐`
          )

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
            ? `🎬 Создаем второе видео (WAN 2.5)...\n⏳ Это займет 5-10 минут...`
            : `🎬 Creating second video (WAN 2.5)...\n⏳ This will take 5-10 minutes...`
        )

        console.log('🔄 [AI REELS] Переходим к Step 3 (WAN 2.5):', {
          telegramId,
          currentStep: ctx.wizard?.cursor,
        })

        // ✅ ПЕРЕХОДИМ К STEP 3 (WAN 2.5 генерация) и ВЫЗЫВАЕМ его вручную
        await ctx.wizard.next()

        // Вручную вызываем следующий step
        const nextStep = (ctx.wizard as any).steps[ctx.wizard.cursor]
        if (nextStep && typeof nextStep === 'function') {
          console.log('🔄 [AI REELS] Manually executing Step 3...', {
            telegramId,
            cursor: ctx.wizard.cursor,
          })
          return await nextStep(ctx)
        } else {
          console.error('❌ [AI REELS] Next step not found!', {
            telegramId,
            cursor: ctx.wizard.cursor,
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

        // Возврат средств
        await updateUserBalance(
          telegramId,
          totalCost,
          PaymentType.MONEY_INCOME,
          'AI Reels refund - critical lip-sync error',
          { bot_name: ctx.botInfo?.username || 'unknown_bot' }
        )

        // Специальное сообщение для timeout ошибок
        const isTimeout =
          genError instanceof Error && genError.message.includes('timeout')
        const isElevenLabsError =
          genError instanceof Error && genError.message.includes('ElevenLabs')
        const isFalApiError =
          genError instanceof Error && genError.message.includes('Fal.ai')

        let errorMessage = isRu
          ? `❌ Критическая ошибка генерации lip-sync видео через fal провайдер. Средства возвращены.`
          : `❌ Critical lip-sync generation error via fal provider. Funds refunded.`

        if (isTimeout) {
          errorMessage = isRu
            ? `⏰ Таймаут генерации lip-sync видео через fal провайдер. Серверы перегружены, попробуйте позже. Средства возвращены.`
            : `⏰ Lip-sync generation timeout via fal provider. Servers are overloaded, try again later. Funds refunded.`
        } else if (isElevenLabsError) {
          errorMessage = isRu
            ? `🎤 Ошибка генерации голоса. Проблема с ElevenLabs API. Средства возвращены.`
            : `🎤 Voice generation error. ElevenLabs API issue. Funds refunded.`
        } else if (isFalApiError) {
          errorMessage = isRu
            ? `🎭 Ошибка fal провайдера. Проблема с Fal.ai API. Средства возвращены.`
            : `🎭 Fal provider error. Fal.ai API issue. Funds refunded.`
        }

        await ctx.reply(errorMessage)
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

  // Step 3: Генерация второго видео через WAN 2.5
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
      '🎬 [AI REELS WIZARD] Step 3 STARTED - Генерация WAN 2.5 видео',
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

    console.log('✅ [AI REELS] Step 3 - Validation passed, proceeding with WAN 2.5')

    try {
      const imageUrl = ctx.session.aiReels.imageUrl

      // Автоматический промпт для WAN 2.5 на основе изображения
      const wan25Prompt = isRu
        ? WAN25_DEFAULT_PROMPTS.CINEMATIC.ru
        : WAN25_DEFAULT_PROMPTS.CINEMATIC.en

      logger.info('🔥 [AI REELS] Генерация WAN 2.5 через Fal.ai', {
        telegramId,
        prompt: wan25Prompt.substring(0, 100),
        imageUrl: imageUrl.substring(0, 100),
        resolution: ctx.session.aiReels?.resolution || '720p',
      })

      console.log('📦 [AI REELS FAL WAN 2.5] REQUEST:', {
        telegramId,
        provider: 'fal',
        model: 'fal-ai/wan-25-preview/image-to-video',
        prompt: wan25Prompt.substring(0, 100) + '...',
        image_url: imageUrl.substring(0, 100) + '...',
        resolution: ctx.session.aiReels?.resolution || '720p',
      })

      try {
        // ✅ ТЕСТОВЫЙ РЕЖИМ - отдельный флаг для WAN v2.2-5b
        const isDev = process.env.NODE_ENV === 'development'
        const useTestWan25 = isDev && process.env.USE_TEST_WAN25 === 'true'
        const TEST_WAN25_VIDEO_URL = 'https://v3b.fal.media/files/b/penguin/Jns1yqrvrnqff91m_C-R2_p9xGAM9j.mp4'

        let wan25Result: { videoUrl?: string; output?: string; error?: string }
        let visualPrompt: string

        if (useTestWan25) {
          console.log('🧪 [AI REELS TEST MODE] Using test WAN v2.2-5b video URL (no API call)')
          visualPrompt = wan25Prompt // используем дефолтный промпт в тестовом режиме
          wan25Result = {
            videoUrl: TEST_WAN25_VIDEO_URL,
            output: TEST_WAN25_VIDEO_URL,
          }
        } else {
          // ✅ СИНХРОННЫЙ ВЫЗОВ Fal.ai WAN v2.2-5b с промптом на основе текста пользователя
          const falWan25 = new FalWAN25Provider()

          // 🎨 ГЕНЕРАЦИЯ ВИЗУАЛЬНОГО ПРОМПТА на основе текста пользователя
          const userText = ctx.session.aiReels?.text || ''

          console.log('✨ [AI REELS] Generating visual prompt from user text', {
            userText: userText.substring(0, 100),
            language: isRu ? 'ru' : 'en',
          })

          visualPrompt = await falWan25.generateVisualPrompt(userText, isRu ? 'ru' : 'en')

          console.log('✅ [AI REELS] Visual prompt generated', {
            promptLength: visualPrompt.length,
            preview: visualPrompt.substring(0, 200) + '...',
          })

          // Aspect ratio для AI Reels: по умолчанию 9:16 (вертикальное видео для соцсетей)
          const aspectRatio = ctx.session.aiReels?.aspectRatio || '9:16'

          const wan25Input = {
            imageUrl,
            prompt: visualPrompt, // используем сгенерированный промпт
            telegramId,
            botName: ctx.botInfo?.username || 'unknown_bot',
            resolution: (ctx.session.aiReels?.resolution || '720p') as '720p' | '1080p',
            aspectRatio, // добавляем aspect ratio
            provider: 'fal' as const,
            modelId: 'fal-wan-v2.2-5b',
          }

          console.log('🚀 [AI REELS FAL WAN v2.2-5b] Calling Fal.ai synchronously...', {
            aspectRatio,
            promptLength: visualPrompt.length,
          })
          wan25Result = await falWan25.generate(wan25Input)
        }

        console.log('✅ [AI REELS FAL WAN v2.2-5b] Generation completed:', {
          hasOutput: !!wan25Result.output,
          hasVideoUrl: !!wan25Result.videoUrl,
          hasError: !!wan25Result.error,
          videoUrl: wan25Result.output?.substring(0, 100),
        })

        if (wan25Result.error || !wan25Result.output) {
          throw new Error(wan25Result.error || 'Fal.ai WAN v2.2-5b generation failed')
        }

        const secondVideoUrl = wan25Result.output

        // Сохраняем URL второго видео и промпт
        const finalPrompt = useTestWan25 ? wan25Prompt : visualPrompt
        ctx.session.aiReels = {
          ...ctx.session.aiReels,
          secondVideoUrl,
          wan25Prompt: finalPrompt,
          step: 'merging',
        }

        logger.info('✅ [AI REELS] Второе видео (Fal WAN v2.2-5b) сгенерировано', {
          telegramId,
          secondVideoUrl: secondVideoUrl.substring(0, 100),
          promptUsed: finalPrompt.substring(0, 150),
        })

        // ✅ ОТПРАВЛЯЕМ WAN v2.2-5b ВИДЕО ПОЛЬЗОВАТЕЛЮ (промежуточный результат)
        await ctx.reply(
          isRu
            ? `✅ Второе видео (WAN v2.2-5b 9:16) готово!\n\n🎨 Визуальная идея:\n${finalPrompt.substring(0, 200)}${finalPrompt.length > 200 ? '...' : ''}`
            : `✅ Second video (WAN v2.2-5b 9:16) ready!\n\n🎨 Visual concept:\n${finalPrompt.substring(0, 200)}${finalPrompt.length > 200 ? '...' : ''}`
        )

        await ctx.replyWithVideo(
          { url: secondVideoUrl },
          {
            caption: isRu
              ? `🎬 Промежуточный результат - WAN v2.2-5b видео (9:16)`
              : `🎬 Intermediate result - WAN v2.2-5b video (9:16)`,
          }
        )
      } catch (wan25Error) {
        // 🔥 ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ОШИБКИ WAN 2.5
        console.error('❌ [AI REELS WAN 2.5] ERROR CAUGHT:', {
          error: wan25Error,
          errorMessage:
            wan25Error instanceof Error ? wan25Error.message : String(wan25Error),
          errorStack: wan25Error instanceof Error ? wan25Error.stack : undefined,
          errorName: wan25Error instanceof Error ? wan25Error.name : typeof wan25Error,
          telegramId,
          taskId: ctx.session?.aiReels?.wan25TaskId,
        })

        logger.error('❌ [AI REELS] Ошибка генерации WAN 2.5', {
          error: wan25Error,
          errorMessage:
            wan25Error instanceof Error ? wan25Error.message : String(wan25Error),
        })

        // Проверяем, является ли это timeout ошибкой
        const isTimeout =
          wan25Error instanceof Error && wan25Error.message.includes('timeout')

        await ctx.reply(
          isRu
            ? isTimeout
              ? '⏱️ Генерация WAN 2.5 видео заняла больше времени, чем ожидалось.\n' +
                'Но первое видео готово!'
              : '❌ Ошибка генерации второго видео. Но первое видео готово!'
            : isTimeout
              ? '⏱️ WAN 2.5 video generation took longer than expected.\n' +
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
        currentCursor: ctx.wizard.cursor,
        totalSteps: (ctx.wizard as any).steps.length,
      })

      await ctx.wizard.next()

      console.log('🔄 [AI REELS] After ctx.wizard.next():', {
        telegramId,
        newCursor: ctx.wizard.cursor,
        totalSteps: (ctx.wizard as any).steps.length,
      })

      // Вручную вызываем следующий step
      const nextStep = (ctx.wizard as any).steps[ctx.wizard.cursor]

      console.log('🔍 [AI REELS] Next step info:', {
        telegramId,
        hasNextStep: !!nextStep,
        isFunction: typeof nextStep === 'function',
        nextStepType: typeof nextStep,
        cursor: ctx.wizard.cursor,
      })

      if (nextStep && typeof nextStep === 'function') {
        console.log('✅ [AI REELS] Manually executing Step 4...', {
          telegramId,
          cursor: ctx.wizard.cursor,
        })
        return await nextStep(ctx)
      } else {
        console.error('❌ [AI REELS] Step 4 not found!', {
          telegramId,
          cursor: ctx.wizard.cursor,
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
      logger.error('❌ [AI REELS] Ошибка в Step 3 (WAN 2.5 или склеивание)', {
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

      console.log('🔥 [AI REELS STEP 4] Line 10: About to call logger.info for merging')

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

        console.log('🔥 [AI REELS STEP 4] Line 18: Starting Promise.all for downloads...')

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

        console.log('🔥 [AI REELS STEP 4] Line 21: About to call combineVideos...')

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

        logger.info('📤 [AI REELS] Отправляем финальное видео напрямую (без Supabase)', {
          telegramId,
          fileSize: finalVideoStats.size,
        })

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

