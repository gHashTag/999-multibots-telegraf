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

// Интерфейс для aiReels теперь определен в MySession interface

/**
 * ИИ Рилс Wizard - создает композицию из lip-sync видео и фонового видео
 *
 * Шаблон 1 (Circle Composition):
 * 1. Получение изображения (фото с лицом для lip-sync)
 * 2. Получение текста/голоса
 * 3. Загрузка фонового видео от пользователя
 * 4. Генерация lip-sync видео из фото (Fal.ai Veed Fabric 1.0 Fast)
 * 5. Композиция: lip-sync в кружочке поверх фонового видео
 *    - Автоматическая детекция лица (face-api.js)
 *    - Динамический размер круга (80% margin от лица)
 *    - Автоматическое позиционирование (левый нижний угол)
 *    - Автоматическая подрезка по длительности
 *
 * Стоимость: 240⭐ (фиксированная)
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
        ? '🎬 ИИ Рилс - Шаблон 1 (Circle Composition)\n\n' +
            '📸 Шаг 1/5: Отправьте фото или URL изображения с лицом для lip-sync видео.\n\n' +
            '🎯 Процесс:\n' +
            '1️⃣ Фото с лицом\n' +
            '2️⃣ Текст/голос для озвучки\n' +
            '3️⃣ Фоновое видео от вас\n' +
            '4️⃣ Генерация lip-sync\n' +
            '5️⃣ Композиция: лицо в кружочке поверх фона\n\n' +
            '🤖 Автоматическая детекция лица и позиционирование\n' +
            '💰 Стоимость: 240⭐'
        : '🎬 AI Reels - Template 1 (Circle Composition)\n\n' +
            '📸 Step 1/5: Send a photo or image URL with a face for lip-sync video.\n\n' +
            '🎯 Process:\n' +
            '1️⃣ Photo with face\n' +
            '2️⃣ Text/voice for audio\n' +
            '3️⃣ Background video from you\n' +
            '4️⃣ Lip-sync generation\n' +
            '5️⃣ Composition: face in circle over background\n\n' +
            '🤖 Automatic face detection and positioning\n' +
            '💰 Cost: 240⭐',
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


      // ✅ СОХРАНЯЕМ данные в сессию (БЕЗ генерации)
      ctx.session.aiReels = {
        ...ctx.session.aiReels,
        imageUrl,
        text,
        audioUrl,
        step: 'data_collected',
      }

      logger.info('✅ [AI REELS] Шаг 2/5: Данные собраны (фото + текст/голос)', {
        telegramId,
        hasImageUrl: !!imageUrl,
        hasText: !!text,
        hasAudioUrl: !!audioUrl,
        textLength: text.length,
      })

      // Уведомляем пользователя о сборе данных
      await ctx.reply(
        isRu
          ? '✅ Шаг 2/5 завершён: Данные собраны!\n\n' +
              '📝 Изображение: ✅\n' +
              (audioUrl ? '🎤 Голос: ✅\n' : '📝 Текст: ✅\n') +
              '\n' +
              '📹 Следующий шаг: Загрузите фоновое видео'
          : '✅ Step 2/5 completed: Data collected!\n\n' +
              '📝 Image: ✅\n' +
              (audioUrl ? '🎤 Voice: ✅\n' : '📝 Text: ✅\n') +
              '\n' +
              '📹 Next step: Upload background video'
      )

      // Переходим к Step 3 (запрос фонового видео)
      return ctx.wizard.next()
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

  // Step 3: Запрос фонового видео от пользователя
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()
    const message = ctx.message

    logger.info(
      '🎬 [AI REELS WIZARD] Step 3 STARTED - Запрос фонового видео',
      {
        telegramId,
        function: 'aiReelsWizard.step3',
        hasMessage: !!message,
        messageType: message ? ('video' in message ? 'video' : 'other') : 'none',
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

    // Если это первый заход на этот шаг - показываем инструкции
    if (!message || !('video' in message)) {
      await ctx.reply(
        isRu
          ? '🎬 Шаг 3/5: Загрузите фоновое видео\n\n' +
              '📹 Отправьте видео для композиции.\n\n' +
              '💡 Ваше лицо из lip-sync появится в кружочке поверх этого видео.\n' +
              '🤖 Автоматическая детекция лица и позиционирование\n\n' +
              '⚠️ Рекомендации:\n' +
              '• Вертикальное видео (9:16) для Reels/TikTok\n' +
              '• Длительность: до 60 секунд\n' +
              '• Размер: до 50 MB'
          : '🎬 Step 3/5: Upload background video\n\n' +
              '📹 Send a video for composition.\n\n' +
              '💡 Your lip-sync face will appear in a circle over this video.\n' +
              '🤖 Automatic face detection and positioning\n\n' +
              '⚠️ Recommendations:\n' +
              '• Vertical video (9:16) for Reels/TikTok\n' +
              '• Duration: up to 60 seconds\n' +
              '• Size: up to 50 MB',
        {
          reply_markup: {
            keyboard: [
              [
                {
                  text: isRu ? '📹 Загрузить видео' : '📹 Upload Video',
                  request_video: true,
                },
              ],
              [{ text: isRu ? '❌ Отмена' : '❌ Cancel' }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
          },
        }
      )

      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    // Проверяем что пришло видео
    if (!message || !('video' in message)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте видео или нажмите "Отмена"'
          : '❌ Please send a video or press "Cancel"'
      )
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    const video = message.video

    // Проверка размера видео
    if (video.file_size && video.file_size > 50 * 1024 * 1024) {
      await ctx.reply(
        isRu
          ? `❌ Видео слишком большое (${(video.file_size / 1024 / 1024).toFixed(1)} MB). Максимум: 50 MB`
          : `❌ Video is too large (${(video.file_size / 1024 / 1024).toFixed(1)} MB). Maximum: 50 MB`
      )
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    try {
      await ctx.reply(
        isRu
          ? '⏳ Загружаем фоновое видео...'
          : '⏳ Uploading background video...'
      )

      // Получаем файл
      const fileLink = await ctx.telegram.getFileLink(video.file_id)
      const videoUrl = fileLink.href

      logger.info('✅ [AI REELS] Фоновое видео загружено', {
        telegramId,
        videoUrl: videoUrl.substring(0, 100),
        fileSize: video.file_size,
        duration: video.duration,
      })

      // Сохраняем URL фонового видео в session
      ctx.session.aiReels = {
        ...ctx.session.aiReels,
        backgroundVideoUrl: videoUrl,
        step: 'background_video_uploaded',
      }

      await ctx.reply(
        isRu
          ? '✅ Шаг 3/5 завершён: Фоновое видео загружено!\n\n' +
              '📹 Все данные собраны:\n' +
              '• Изображение ✅\n' +
              '• Текст/голос ✅\n' +
              '• Фоновое видео ✅\n\n' +
              '⏳ Начинаем генерацию...'
          : '✅ Step 3/5 completed: Background video uploaded!\n\n' +
              '📹 All data collected:\n' +
              '• Image ✅\n' +
              '• Text/voice ✅\n' +
              '• Background video ✅\n\n' +
              '⏳ Starting generation...'
      )

      // Переходим к Step 4 (генерация lip-sync)
      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ [AI REELS] Ошибка загрузки фонового видео', {
        error,
        telegramId,
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка загрузки видео. Попробуйте еще раз.'
          : '❌ Error uploading video. Please try again.'
      )
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }
  },

  // Step 4: Генерация lip-sync видео (ПОСЛЕ сбора всех данных)
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info(
      '🎬 [AI REELS WIZARD] Step 4 STARTED - Генерация lip-sync видео',
      {
        telegramId,
        function: 'aiReelsWizard.step4',
        hasImageUrl: !!ctx.session.aiReels?.imageUrl,
        hasText: !!ctx.session.aiReels?.text,
        hasAudioUrl: !!ctx.session.aiReels?.audioUrl,
        hasBackgroundVideo: !!ctx.session.aiReels?.backgroundVideoUrl,
      }
    )

    if (!telegramId || !ctx.session.aiReels?.imageUrl || !ctx.session.aiReels?.text || !ctx.session.aiReels?.backgroundVideoUrl) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не все данные собраны. Начните заново.'
          : '❌ Error: not all data collected. Start over.'
      )
      return ctx.scene.leave()
    }

    const { imageUrl, text, audioUrl } = ctx.session.aiReels

    try {
      // 💰 Фиксированная стоимость 240⭐ (lip-sync + composition)
      const totalCost = 240

      logger.info('💰 AI Reels - проверка баланса', {
        totalCost,
        telegramId,
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
            ? `💰 Недостаточно средств\n\n` +
                `📊 Стоимость: ${totalCost}⭐ ($${(totalCost / 100).toFixed(2)})\n` +
                `💳 У вас: ${currentBalance.toFixed(2)}⭐`
            : `💰 Insufficient funds\n\n` +
                `📊 Cost: ${totalCost}⭐ ($${(totalCost / 100).toFixed(2)})\n` +
                `💳 You have: ${currentBalance.toFixed(2)}⭐`
        )
        return ctx.scene.leave()
      }

      // Списание средств
      const paymentSuccess = await updateUserBalance(
        telegramId,
        totalCost,
        PaymentType.MONEY_OUTCOME,
        'AI Reels (lip-sync + composition)',
        {
          bot_name: ctx.botInfo?.username || 'unknown_bot',
          service_type: 'ai_reels_circle_template',
          text_length: text.length,
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
          ? `💰 Списано ${totalCost.toFixed(2)}⭐. Баланс: ${newBalance.toFixed(2)}⭐\n\n` +
              `🎬 Шаг 4/5: Генерация lip-sync видео...\n` +
              `⏳ 30-60 секунд...`
          : `💰 Charged ${totalCost.toFixed(2)}⭐. Balance: ${newBalance.toFixed(2)}⭐\n\n` +
              `🎬 Step 4/5: Generating lip-sync video...\n` +
              `⏳ 30-60 seconds...`
      )

      // Генерация lip-sync через Fal.ai
      let finalAudioUrl = audioUrl

      // Если нет аудио - генерируем из текста
      if (!finalAudioUrl && text) {
        try {
          const { createAudioFileFromText } = await import(
            '@/core/elevenlabs/createAudioFileFromText'
          )

          const { supabase } = await import('@/core/supabase')
          const { data: userData } = await supabase
            .from('users')
            .select('voice_id_elevenlabs')
            .eq('telegram_id', telegramId)
            .single()

          if (!userData?.voice_id_elevenlabs) {
            throw new Error('Voice ID not found')
          }

          const voiceId = userData.voice_id_elevenlabs
          const audioPath = await createAudioFileFromText({
            text,
            voice_id: voiceId,
            telegram_id: telegramId,
          })

          if (!audioPath) {
            throw new Error('Failed to create audio from text')
          }

          const fs = await import('fs/promises')
          const audioBuffer = await fs.readFile(audioPath)

          const { createClient } = await import('@supabase/supabase-js')
          const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import('@/config')

          const serviceClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
          const fileName = `ai-reels-generated-audio/${telegramId}/${Date.now()}.mp3`

          const { error: uploadError } = await serviceClient.storage
            .from('images')
            .upload(fileName, audioBuffer, {
              contentType: 'audio/mpeg',
              upsert: false,
            })

          if (uploadError) {
            throw new Error(`Upload failed: ${uploadError.message}`)
          }

          const { data: urlData } = serviceClient.storage
            .from('images')
            .getPublicUrl(fileName)

          finalAudioUrl = urlData.publicUrl

          // Cleanup
          try {
            await fs.unlink(audioPath)
          } catch {}

          logger.info('✅ [AI REELS] Audio generated', {
            telegramId,
            audioUrl: finalAudioUrl.substring(0, 100),
          })
        } catch (audioError) {
          logger.error('❌ [AI REELS] Audio generation error', { error: audioError })
          // Refund
          await updateUserBalance(
            telegramId,
            totalCost,
            PaymentType.MONEY_INCOME,
            'AI Reels refund - audio error',
            { bot_name: ctx.botInfo?.username || 'unknown_bot' }
          )
          await ctx.reply(
            isRu
              ? '❌ Ошибка генерации аудио. Средства возвращены.'
              : '❌ Audio generation error. Refunded.'
          )
          return ctx.scene.leave()
        }
      }

      if (!finalAudioUrl) {
        throw new Error('No audio URL available')
      }

      // Создаем input для Fal.ai
      const input = LipSyncInputBuilder.forFalVeedFabric(
        imageUrl,
        finalAudioUrl,
        telegramId,
        {
          botName: ctx.botInfo?.username || 'unknown_bot',
          resolution: '720p',
        }
      )

      // Генерируем lip-sync
      const { FalVeedFabricProvider } = await import(
        '@/core/lipsync/providers/fal-veed-fabric-provider'
      )

      const falProvider = new FalVeedFabricProvider()
      const lipSyncResult = await falProvider.generate(input)

      if ('error' in lipSyncResult || !lipSyncResult.output) {
        logger.error('❌ [AI REELS] Fal.ai failed', {
          error: lipSyncResult,
        })

        // Refund
        await updateUserBalance(
          telegramId,
          totalCost,
          PaymentType.MONEY_INCOME,
          'AI Reels refund - lip-sync failed',
          { bot_name: ctx.botInfo?.username || 'unknown_bot' }
        )

        await ctx.reply(
          isRu
            ? `❌ Ошибка генерации lip-sync. Средства возвращены: ${totalCost.toFixed(2)}⭐`
            : `❌ Lip-sync failed. Refunded: ${totalCost.toFixed(2)}⭐`
        )

        return ctx.scene.leave()
      }

      const lipSyncVideoUrl = lipSyncResult.output

      // Сохраняем в session
      ctx.session.aiReels = {
        ...ctx.session.aiReels,
        firstVideoUrl: lipSyncVideoUrl,
        step: 'lipsync_ready',
      }

      logger.info('✅ [AI REELS] Lip-sync готов', {
        telegramId,
        lipSyncVideoUrl: lipSyncVideoUrl.substring(0, 100),
      })

      // Отправляем промежуточный результат
      await ctx.reply(
        isRu
          ? '✅ Шаг 4/5 завершён: Lip-sync видео готово!'
          : '✅ Step 4/5 completed: Lip-sync video ready!'
      )

      await ctx.replyWithVideo(
        { url: lipSyncVideoUrl },
        {
          caption: isRu
            ? '🎬 Промежуточный результат - Lip-sync видео'
            : '🎬 Intermediate result - Lip-sync video',
        }
      )

      await ctx.reply(
        isRu
          ? '🎬 Шаг 5/5: Создаём композицию (лицо в кружочке поверх фона)...\n⏳ 10-20 секунд...'
          : '🎬 Step 5/5: Creating composition (face in circle over background)...\n⏳ 10-20 seconds...'
      )

      // Переходим к Step 5 (composition)
      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ [AI REELS] Step 4 error', { error })

      // Refund if payment was made
      try {
        await updateUserBalance(
          telegramId,
          240,
          PaymentType.MONEY_INCOME,
          'AI Reels refund - critical error',
          { bot_name: ctx.botInfo?.username || 'unknown_bot' }
        )
      } catch {}

      await ctx.reply(
        isRu
          ? '❌ Критическая ошибка. Средства возвращены.'
          : '❌ Critical error. Refunded.'
      )

      return ctx.scene.leave()
    }
  },

  // Step 5: Композиция с кружочком (lip-sync в circle поверх background)
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS WIZARD] Step 5 STARTED - Circle composition', {
      telegramId,
      function: 'aiReelsWizard.step5',
      hasLipSyncVideo: !!ctx.session.aiReels?.firstVideoUrl,
      hasBackgroundVideo: !!ctx.session.aiReels?.backgroundVideoUrl,
    })

    if (
      !telegramId ||
      !ctx.session.aiReels?.firstVideoUrl ||
      !ctx.session.aiReels?.backgroundVideoUrl
    ) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не найдены видео. Проверьте предыдущие шаги.'
          : '❌ Error: videos not found. Check previous steps.'
      )
      return ctx.scene.leave()
    }

    const lipSyncVideoUrl = ctx.session.aiReels.firstVideoUrl
    const backgroundVideoUrl = ctx.session.aiReels.backgroundVideoUrl

    try {
      // Создаем временную директорию
      const tempDir = path.join(
        os.tmpdir(),
        `ai-reels-${telegramId}-${Date.now()}`
      )
      await fs.mkdir(tempDir, { recursive: true })

      try {
        // Пути для видео
        const lipSyncPath = path.join(tempDir, 'lipsync.mp4')
        const backgroundPath = path.join(tempDir, 'background.mp4')
        const finalPath = path.join(tempDir, 'final-composition.mp4')

        logger.info('📥 [AI REELS] Скачиваем видео для композиции', {
          telegramId,
          tempDir,
        })

        // Скачиваем оба видео
        await Promise.all([
          downloadFile(lipSyncVideoUrl, lipSyncPath),
          downloadFile(backgroundVideoUrl, backgroundPath),
        ])

        logger.info('✅ [AI REELS] Видео скачаны, начинаем композицию с face detection', {
          telegramId,
          lipSyncSize: (await fs.stat(lipSyncPath)).size,
          backgroundSize: (await fs.stat(backgroundPath)).size,
        })

        // ✅ ИСПОЛЬЗУЕМ SIMPLE CIRCLE COMPOSITION (no face detection, muted background)
        const { createCircleCompositionSimple } = await import(
          '@/helpers/face-circle-composer'
        )

        // Circle in bottom-left corner (fixed position)
        await createCircleCompositionSimple(
          backgroundPath,  // фоновое видео (БЕЗ ЗВУКА)
          lipSyncPath,     // lip-sync видео (С ЗВУКОМ)
          finalPath,
          300,  // радиус круга
          300,  // X позиция (левый нижний угол)
          1620  // Y позиция (левый нижний угол для 1920px высоты)
        )

        logger.info('🎬 [AI REELS] Композиция создана', {
          telegramId,
          finalSize: (await fs.stat(finalPath)).size,
        })

        // Обновляем сессию
        ctx.session.aiReels = {
          ...ctx.session.aiReels,
          step: 'completed' as any,
        }

        // Отправляем финальное видео
        const { createReadStream } = await import('fs')
        await ctx.replyWithVideo(
          { source: createReadStream(finalPath) as any },
          {
            caption: isRu
              ? `🎬 Ваш AI Reels готов!\n\n` +
                  `✨ Lip-sync в кружочке поверх фонового видео\n` +
                  `🔇 Фоновое видео без звука (только голос аватара)`
              : `🎬 Your AI Reels is ready!\n\n` +
                  `✨ Lip-sync in circle over background video\n` +
                  `🔇 Background muted (avatar voice only)`,
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

        logger.info('🎉 [AI REELS] Весь процесс завершён', {
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
          logger.warn('⚠️ [AI REELS] Ошибка очистки', {
            error: cleanupError,
            tempDir,
          })
        }
      }
    } catch (error) {
      logger.error('❌ [AI REELS] Ошибка композиции', { error })

      await ctx.reply(
        isRu
          ? '❌ Ошибка создания композиции. Но видео готовы отдельно!\n\n' +
              `🎬 Lip-sync: ${lipSyncVideoUrl}\n` +
              `🎬 Background: ${backgroundVideoUrl}`
          : '❌ Composition error. But videos are ready separately!\n\n' +
              `🎬 Lip-sync: ${lipSyncVideoUrl}\n` +
              `🎬 Background: ${backgroundVideoUrl}`
      )

      return ctx.scene.leave()
    }
  }
)

