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
import {
  WAN25_MODELS,
  WAN25ModelType,
  calculateWAN25CostStars,
  validateWAN25Parameters,
  WAN25_API_CONFIG,
  WAN25_DEFAULT_PROMPTS,
  type WAN25CreateTaskRequest,
  type WAN25TaskResponse,
  type WAN25StatusResponse,
  type WAN25Error,
  WAN25ErrorType,
} from '@/config/wan25-config'

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
      hasSavedState: !!(ctx.session.aiReels?.imageUrl && ctx.session.aiReels?.text),
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
      messageType: message ? ('photo' in message ? 'photo' : 'text' in message ? 'text' : 'other') : 'none',
      function: 'aiReelsWizard.step1',
    })

    try {
      // Обработка фото из Telegram
      if (message && 'photo' in message && message.photo.length > 0) {
        const photo = message.photo[message.photo.length - 1]
        const telegramId = ctx.from?.id?.toString()

        logger.info('📸 Скачиваем фото из Telegram для AI Reels', { fileId: photo.file_id, telegramId })

        try {
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
          const { data: urlData } = serviceClient.storage.from('images').getPublicUrl(fileName)

          imageUrl = urlData.publicUrl

          logger.info('✅ Фото для AI Reels загружено в Supabase', {
            fileName,
            publicUrl: imageUrl,
          })
        } catch (uploadError) {
          logger.error('❌ Ошибка загрузки фото для AI Reels', { error: uploadError })
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
          logger.info('📸 Получен URL изображения для AI Reels', { url: imageUrl.substring(0, 100) })
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

    logger.info('🎬 [AI REELS WIZARD] Step 2 STARTED - Генерация первого видео (lip-sync)', {
      telegramId,
      hasMessage: !!message,
      messageType: message ? ('text' in message ? 'text' : 'voice' in message ? 'voice' : 'other') : 'none',
      function: 'aiReelsWizard.step2',
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
              throw new Error(`Failed to download voice: ${response.statusText}`)
            }

            const audioBuffer = Buffer.from(await response.arrayBuffer())

            const { createClient } = await import('@supabase/supabase-js')
            const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import('@/config')

            const serviceClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
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
            logger.error('❌ [AI REELS] Ошибка обработки голоса', { voiceError })
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
              isRu ? '❌ Текст не может быть пустым.' : '❌ Text cannot be empty.'
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
              : '❌ You don\'t have an avatar voice configured!\n\n' +
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

      // Генерация первого видео (lip-sync) через orchestrator
      try {
        const input = LipSyncInputBuilder.forVeedFabric(
          imageUrl,
          audioUrl || text,
          telegramId,
          {
            botName: ctx.botInfo?.username || 'unknown_bot',
            resolution: '720p',
            isAudioUrl: !!audioUrl,
          }
        )

        logger.info('🎭 [AI REELS] Запуск генерации первого видео (lip-sync)', {
          telegramId,
          imageUrl: imageUrl.substring(0, 100),
          textLength: text.length,
        })

        const result = await lipSyncOrchestrator.generate(input)

        if (!('id' in result)) {
          const error = result as { message?: string; error?: string }
          logger.error('❌ [AI REELS] Ошибка генерации lip-sync видео', { result })

          // Возврат средств
          await updateUserBalance(
            telegramId,
            totalCost,
            PaymentType.MONEY_INCOME,
            'AI Reels refund - lip-sync generation error',
            { bot_name: ctx.botInfo?.username || 'unknown_bot' }
          )

          await ctx.reply(
            isRu
              ? `❌ Ошибка генерации lip-sync видео: ${error.message || 'Unknown error'}\nСредства возвращены.`
              : `❌ Lip-sync generation error: ${error.message || 'Unknown error'}\nFunds refunded.`
          )
          return ctx.scene.leave()
        }

        const firstVideoUrl = result.output

        if (!firstVideoUrl) {
          throw new Error('First video URL not returned from orchestrator')
        }

        // Сохраняем URL первого видео
        ctx.session.aiReels = {
          ...ctx.session.aiReels,
          firstVideoUrl,
          step: 'wan_generation',
        }

        await ctx.reply(
          isRu
            ? `✅ Первое видео (lip-sync) готово!\n\n` +
              `2️⃣ Создаем второе видео через WAN 2.5...\n` +
              `⏳ Это займет 60-90 секунд...`
            : `✅ First video (lip-sync) ready!\n\n` +
              `2️⃣ Creating second video via WAN 2.5...\n` +
              `⏳ This will take 60-90 seconds...`
        )

        logger.info('✅ [AI REELS] Первое видео (lip-sync) сгенерировано', {
          telegramId,
          firstVideoUrl,
        })

        // Переходим к следующему шагу (генерация WAN 2.5)
        return ctx.wizard.next()

      } catch (genError) {
        // ✅ УЛУЧШЕНО: Детальное логирование с полной информацией об ошибке
        logger.error('❌ [AI REELS] Критическая ошибка генерации lip-sync', {
          error: genError,
          errorMessage: genError instanceof Error ? genError.message : 'Unknown error',
          errorStack: genError instanceof Error ? genError.stack : undefined,
          errorName: genError instanceof Error ? genError.name : typeof genError,
          telegramId,
          imageUrl: imageUrl?.substring(0, 100),
          hasAudioUrl: !!audioUrl,
          hasText: !!text,
          textLength: text?.length || 0,
        })

        // Возврат средств
        await updateUserBalance(
          telegramId,
          totalCost,
          PaymentType.MONEY_INCOME,
          'AI Reels refund - critical lip-sync error',
          { bot_name: ctx.botInfo?.username || 'unknown_bot' }
        )

        await ctx.reply(
          isRu
            ? `❌ Критическая ошибка генерации lip-sync видео. Средства возвращены.`
            : `❌ Critical lip-sync generation error. Funds refunded.`
        )
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
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS WIZARD] Step 3 STARTED - Генерация WAN 2.5 видео', {
      telegramId,
      function: 'aiReelsWizard.step3',
    })

    if (!telegramId || !ctx.session.aiReels?.firstVideoUrl || !ctx.session.aiReels?.imageUrl) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не найдены данные первого видео. Начните заново.'
          : '❌ Error: first video data not found. Start over.'
      )
      return ctx.scene.leave()
    }

    try {
      const imageUrl = ctx.session.aiReels.imageUrl

      // Автоматический промпт для WAN 2.5 на основе изображения
      const wan25Prompt = isRu
        ? WAN25_DEFAULT_PROMPTS.CINEMATIC.ru
        : WAN25_DEFAULT_PROMPTS.CINEMATIC.en

      // Создаем задачу в WAN 2.5
      const wan25Request: WAN25CreateTaskRequest = {
        model: WAN25_MODELS[WAN25ModelType.IMAGE_TO_VIDEO].modelId,
        input: {
          prompt: wan25Prompt,
          image_url: imageUrl,
          duration: "5",
          resolution: ctx.session.aiReels?.resolution || "720p",
          enable_prompt_expansion: true,
        }
      }

      // Валидация параметров WAN 2.5
      const validation = validateWAN25Parameters(
        WAN25ModelType.IMAGE_TO_VIDEO,
        5,
        ctx.session.aiReels?.resolution || "720p"
      )

      if (!validation.isValid) {
        throw new Error(`WAN 2.5 validation failed: ${validation.error}`)
      }

      logger.info('🔥 [AI REELS] Отправляем запрос в WAN 2.5', {
        telegramId,
        prompt: wan25Prompt.substring(0, 100),
        imageUrl: imageUrl.substring(0, 100),
        resolution: wan25Request.input.resolution,
      })

      try {
        // Реальный вызов WAN 2.5 API
        const taskResponse = await createWAN25Task(wan25Request)

        if (taskResponse.code !== 200) {
          throw new Error(`WAN 2.5 API error: ${taskResponse.message}`)
        }

        const taskId = taskResponse.data.taskId

        logger.info('🔥 [AI REELS] WAN 2.5 задача создана', {
          telegramId,
          taskId,
        })

        // Сохраняем taskId для отслеживания
        ctx.session.aiReels = {
          ...ctx.session.aiReels,
          wan25TaskId: taskId,
          wan25Prompt,
        }

        // Ожидание результата с polling
        const secondVideoUrl = await waitForWAN25Task(taskId, WAN25_API_CONFIG.TIMEOUT.MAX_WAIT_TIME)

        if (!secondVideoUrl) {
          throw new Error('WAN 2.5 task completed but no video URL returned')
        }

        // Сохраняем URL второго видео
        ctx.session.aiReels = {
          ...ctx.session.aiReels,
          secondVideoUrl: secondVideoUrl,
          wan25Prompt,
          step: 'merging',
        }

        await ctx.reply(
          isRu
            ? `✅ Второе видео (WAN 2.5) готово!\n\n` +
              `3️⃣ Склеиваем два видео в финальный ролик...\n` +
              `⏳ Это займет 30-45 секунд...`
            : `✅ Second video (WAN 2.5) ready!\n\n` +
              `3️⃣ Merging two videos into final reel...\n` +
              `⏳ This will take 30-45 seconds...`
        )

        logger.info('✅ [AI REELS] Второе видео (WAN 2.5) сгенерировано', {
          telegramId,
          secondVideoUrl,
          taskId,
        })

        // Переходим к следующему шагу (склеивание)
        return ctx.wizard.next()

      } catch (wan25Error) {
        logger.error('❌ [AI REELS] Ошибка генерации WAN 2.5', { error: wan25Error })

        // Проверяем, является ли это timeout ошибкой
        if (wan25Error instanceof Error && wan25Error.message.includes('timeout')) {
          await ctx.reply(
            isRu
              ? '⏱️ Генерация WAN 2.5 видео заняла больше времени, чем ожидалось.\n' +
                'Но первое видео готово!\n' +
                `🎬 Ваше lip-sync видео: ${ctx.session.aiReels?.firstVideoUrl}`
              : '⏱️ WAN 2.5 video generation took longer than expected.\n' +
                'But first video is ready!\n' +
                `🎬 Your lip-sync video: ${ctx.session.aiReels?.firstVideoUrl}`
          )
        } else {
          await ctx.reply(
            isRu
              ? '❌ Ошибка генерации второго видео. Но первое видео готово!\n' +
                `🎬 Ваше lip-sync видео: ${ctx.session.aiReels?.firstVideoUrl}`
              : '❌ Error generating second video. But first video is ready!\n' +
                `🎬 Your lip-sync video: ${ctx.session.aiReels?.firstVideoUrl}`
          )
        }

        return ctx.scene.leave()
      }

    } catch (error) {
      logger.error('❌ [AI REELS] Ошибка генерации WAN 2.5 видео', { error })

      await ctx.reply(
        isRu
          ? '❌ Ошибка генерации второго видео. Но первое видео готово!\n' +
            `🎬 Ваше lip-sync видео: ${ctx.session.aiReels?.firstVideoUrl}`
          : '❌ Error generating second video. But first video is ready!\n' +
            `🎬 Your lip-sync video: ${ctx.session.aiReels?.firstVideoUrl}`
      )

      return ctx.scene.leave()
    }
  },

  // Step 4: Склеивание двух видео
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS WIZARD] Step 4 STARTED - Склеивание видео', {
      telegramId,
      function: 'aiReelsWizard.step4',
    })

    if (!telegramId || !ctx.session.aiReels?.firstVideoUrl || !ctx.session.aiReels?.secondVideoUrl) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не найдены URL обоих видео. Проверьте предыдущие шаги.'
          : '❌ Error: both video URLs not found. Check previous steps.'
      )
      return ctx.scene.leave()
    }

    try {
      const firstVideoUrl = ctx.session.aiReels.firstVideoUrl
      const secondVideoUrl = ctx.session.aiReels.secondVideoUrl

      logger.info('🔗 [AI REELS] Начинаем склеивание видео', {
        telegramId,
        firstVideoUrl: firstVideoUrl.substring(0, 100),
        secondVideoUrl: secondVideoUrl.substring(0, 100),
      })

      // Создаем временную директорию для работы с видео
      const tempDir = path.join(os.tmpdir(), `ai-reels-${telegramId}-${Date.now()}`)
      await fs.mkdir(tempDir, { recursive: true })

      try {
        // Скачиваем оба видео
        const firstVideoPath = path.join(tempDir, 'first-video.mp4')
        const secondVideoPath = path.join(tempDir, 'second-video.mp4')
        const finalVideoPath = path.join(tempDir, 'final-reels.mp4')

        logger.info('📥 [AI REELS] Скачиваем видео', {
          telegramId,
          tempDir,
        })

        await Promise.all([
          downloadFile(firstVideoUrl, firstVideoPath),
          downloadFile(secondVideoUrl, secondVideoPath),
        ])

        logger.info('✅ [AI REELS] Видео скачаны, начинаем склеивание', {
          telegramId,
          firstVideoSize: (await fs.stat(firstVideoPath)).size,
          secondVideoSize: (await fs.stat(secondVideoPath)).size,
        })

        // Склеиваем видео с помощью FFmpeg
        await combineVideos(
          [firstVideoPath, secondVideoPath],
          finalVideoPath,
          'none', // без перехода для простоты
          0
        )

        logger.info('🎬 [AI REELS] Видео склеено, загружаем результат', {
          telegramId,
          finalVideoSize: (await fs.stat(finalVideoPath)).size,
        })

        // Загружаем склеенное видео в Supabase Storage
        const finalVideoUrl = await uploadVideoToSupabase(
          finalVideoPath,
          `ai-reels-final-${telegramId}-${Date.now()}.mp4`,
          telegramId
        )

        // Сохраняем финальный URL
        ctx.session.aiReels = {
          ...ctx.session.aiReels,
          finalVideoUrl,
          step: 'completed' as any,
        }

        await ctx.reply(
          isRu
            ? `🎉 ИИ Рилс готов!\n\n` +
              `📹 Финальное видео: ${finalVideoUrl}\n\n` +
              `📊 Что создано:\n` +
              `1️⃣ Lip-sync видео: ${firstVideoUrl}\n` +
              `2️⃣ WAN 2.5 видео: ${secondVideoUrl}\n` +
              `3️⃣ Склеенный ролик: ${finalVideoUrl}\n\n` +
              `✨ Спасибо за использование ИИ Рилс!`
            : `🎉 AI Reels ready!\n\n` +
              `📹 Final video: ${finalVideoUrl}\n\n` +
              `📊 What was created:\n` +
              `1️⃣ Lip-sync video: ${firstVideoUrl}\n` +
              `2️⃣ WAN 2.5 video: ${secondVideoUrl}\n` +
              `3️⃣ Merged reel: ${finalVideoUrl}\n\n` +
              `✨ Thank you for using AI Reels!`
        )

        logger.info('🎉 [AI REELS] Финальный ролик готов', {
          telegramId,
          finalVideoUrl,
          processingTime: Date.now() - (ctx.session.aiReels?.startTime || Date.now()),
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

// Реальные функции для работы с WAN 2.5 API

/**
 * Создает задачу в WAN 2.5 API
 */
async function createWAN25Task(request: WAN25CreateTaskRequest): Promise<WAN25TaskResponse> {
  const { KIE_AI_API_KEY } = await import('@/config')

  if (!KIE_AI_API_KEY) {
    throw new Error('KIE_AI_API_KEY not configured')
  }

  const url = `${WAN25_API_CONFIG.BASE_URL}${WAN25_API_CONFIG.ENDPOINTS.CREATE_TASK}`

  logger.info('🔥 [WAN 2.5 API] Создание задачи', {
    url,
    model: request.model,
    duration: request.input.duration,
    resolution: request.input.resolution,
  })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...WAN25_API_CONFIG.HEADERS,
      'Authorization': `Bearer ${KIE_AI_API_KEY}`,
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(WAN25_API_CONFIG.TIMEOUT.CREATE_TASK),
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('❌ [WAN 2.5 API] Ошибка создания задачи', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    })
    throw new Error(`WAN 2.5 API error: ${response.status} ${response.statusText}`)
  }

  const result = await response.json()
  logger.info('✅ [WAN 2.5 API] Задача создана', { taskId: result.data?.taskId })

  return result
}

/**
 * Проверяет статус задачи WAN 2.5
 */
async function checkWAN25TaskStatus(taskId: string): Promise<WAN25StatusResponse> {
  const { KIE_AI_API_KEY } = await import('@/config')

  if (!KIE_AI_API_KEY) {
    throw new Error('KIE_AI_API_KEY not configured')
  }

  const url = `${WAN25_API_CONFIG.BASE_URL}${WAN25_API_CONFIG.ENDPOINTS.TASK_STATUS}?taskId=${taskId}`

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${KIE_AI_API_KEY}`,
    },
    signal: AbortSignal.timeout(WAN25_API_CONFIG.TIMEOUT.STATUS_CHECK),
  })

  if (!response.ok) {
    throw new Error(`WAN 2.5 status check error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/**
 * Ожидает завершения задачи WAN 2.5 с polling
 */
async function waitForWAN25Task(taskId: string, maxWaitTimeMs: number = 120000): Promise<string> {
  const startTime = Date.now()
  const pollInterval = WAN25_API_CONFIG.TIMEOUT.POLL_INTERVAL

  logger.info('⏳ [WAN 2.5 API] Начинаем ожидание результата', {
    taskId,
    maxWaitTimeMs,
    pollInterval,
  })

  while (Date.now() - startTime < maxWaitTimeMs) {
    try {
      const status = await checkWAN25TaskStatus(taskId)

      logger.info('🔍 [WAN 2.5 API] Проверка статуса', {
        taskId,
        state: status.data.state,
        elapsedTime: Date.now() - startTime,
      })

      if (status.code === 200 && status.data.state === 'success') {
        const resultJson = status.data.resultJson ? JSON.parse(status.data.resultJson) : {}
        const videoUrl = resultJson.resultUrls?.[0] || ''

        if (videoUrl) {
          logger.info('✅ [WAN 2.5 API] Задача завершена успешно', {
            taskId,
            videoUrl: videoUrl.substring(0, 100),
            totalTime: Date.now() - startTime,
            consumeCredits: status.data.consumeCredits,
          })
          return videoUrl
        } else {
          throw new Error('WAN 2.5 task completed but no video URL in result')
        }
      }

      if (status.data.state === 'fail') {
        logger.error('❌ [WAN 2.5 API] Задача завершилась с ошибкой', {
          taskId,
          failMsg: status.data.failMsg,
        })
        throw new Error(`WAN 2.5 task failed: ${status.data.failMsg || 'Unknown error'}`)
      }

      // Если задача все еще обрабатывается, ждем
      if (status.data.state === 'processing') {
        await new Promise(resolve => setTimeout(resolve, pollInterval))
        continue
      }

      // Неизвестное состояние
      logger.warn('⚠️ [WAN 2.5 API] Неизвестное состояние задачи', {
        taskId,
        state: status.data.state,
        response: status,
      })

    } catch (pollError) {
      logger.error('❌ [WAN 2.5 API] Ошибка при проверке статуса', {
        taskId,
        error: pollError,
        elapsedTime: Date.now() - startTime,
      })

      // Если это последняя попытка, выбрасываем ошибку
      if (Date.now() - startTime + pollInterval >= maxWaitTimeMs) {
        throw pollError
      }

      // Иначе ждем и пробуем снова
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }
  }

  logger.error('⏱️ [WAN 2.5 API] Timeout ожидания результата', {
    taskId,
    maxWaitTimeMs,
    elapsedTime: Date.now() - startTime,
  })

  throw new Error(`WAN 2.5 task timeout after ${maxWaitTimeMs}ms`)
}

/**
 * Загружает видео файл в Supabase Storage и возвращает публичный URL
 */
async function uploadVideoToSupabase(
  videoFilePath: string,
  fileName: string,
  telegramId: string
): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js')
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import('@/config')

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase configuration not found')
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  logger.info('☁️ [SUPABASE] Загружаем видео', {
    fileName,
    telegramId,
    videoSize: (await fs.stat(videoFilePath)).size,
  })

  // Читаем файл
  const videoBuffer = await fs.readFile(videoFilePath)

  // Путь в storage
  const storagePath = `ai-reels-videos/${telegramId}/${fileName}`

  // Загружаем в Supabase Storage
  const { error: uploadError } = await serviceClient.storage
    .from('images') // используем существующий bucket 'images'
    .upload(storagePath, videoBuffer, {
      contentType: 'video/mp4',
      upsert: false,
    })

  if (uploadError) {
    logger.error('❌ [SUPABASE] Ошибка загрузки видео', {
      error: uploadError,
      fileName,
      storagePath,
    })
    throw new Error(`Supabase upload failed: ${uploadError.message}`)
  }

  // Получаем публичный URL
  const { data: urlData } = serviceClient.storage
    .from('images')
    .getPublicUrl(storagePath)

  const publicUrl = urlData.publicUrl

  logger.info('✅ [SUPABASE] Видео загружено', {
    fileName,
    publicUrl: publicUrl.substring(0, 100),
    storagePath,
  })

  // Опционально: сохраняем информацию о видео в таблицу assets
  try {
    const { saveVideoUrlToSupabase } = await import('@/core/supabase/saveVideoUrlToSupabase')
    await saveVideoUrlToSupabase(telegramId, publicUrl, storagePath, 'ai_reels_final')
  } catch (saveError) {
    logger.warn('⚠️ [SUPABASE] Не удалось сохранить информацию в таблицу assets', {
      error: saveError,
    })
    // Не критично, продолжаем
  }

  return publicUrl
}

export default aiReelsWizard