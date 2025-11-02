import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'

// ✅ НОВЫЕ ИМПОРТЫ - Inngest!
import { sendInngestEvent, INNGEST_EVENTS } from '@/inngest_app/inngestClient'

export const aiReelsWizard = new Scenes.WizardScene<MyContext>(
  'ai_reels_wizard',

  // Step 0: Запрос изображения
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS WIZARD] Step 0 STARTED - Requesting image', {
      telegramId,
      hasFrom: !!ctx.from,
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
      logger.info('🎬 [AI REELS] Continuing with saved data', {
        telegramId,
        hasImageUrl: !!ctx.session.aiReels.imageUrl,
        hasText: !!ctx.session.aiReels.text,
      })

      ctx.session.aiReels.needsVoiceCreation = false
      ctx.wizard.selectStep(2)
      return ctx.wizard.next()
    }

    // Инициализируем сессию
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

    logger.info('🎬 [AI REELS WIZARD] Step 1 STARTED - Processing image', {
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
      // ✅ ОБРАБОТКА ФОТО (упрощённая версия)
      if (message && 'photo' in message && message.photo.length > 0) {
        const photo = message.photo[message.photo.length - 1]
        const telegramId = ctx.from?.id?.toString()

        logger.info('📸 Processing photo from Telegram for AI Reels', {
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

          const { data: urlData } = serviceClient.storage
            .from('images')
            .getPublicUrl(fileName)

          imageUrl = urlData.publicUrl

          logger.info('✅ Photo for AI Reels uploaded to Supabase', {
            fileName,
            publicUrl: imageUrl,
          })
        } catch (uploadError) {
          logger.error('❌ Error uploading photo for AI Reels', {
            error: uploadError,
          })
          await ctx.reply(
            isRu
              ? '❌ Ошибка загрузки изображения. Попробуйте ещё раз.'
              : '❌ Error uploading image. Try again.'
          )
          return ctx.scene.leave()
        }
      } else {
        await ctx.reply(
          isRu
            ? '❌ Пожалуйста, отправьте изображение с лицом.'
            : '❌ Please send an image with a face.'
        )
        return ctx.scene.leave()
      }

      // Сохраняем изображение в сессии
      ctx.session.aiReels.imageUrl = imageUrl

      logger.info('💾 [AI REELS] Image saved to session', {
        telegramId: ctx.from?.id?.toString(),
        imageUrl,
      })

      // Показываем превью изображения
      await ctx.replyWithPhoto(imageUrl, {
        caption: isRu
          ? '✅ Изображение получено! Теперь выберите способ создания:'
          : '✅ Image received! Now choose creation method:',
      })

      // Показываем кнопки выбора
      await ctx.reply(
        isRu
          ? '🎭 Выберите тип контента:'
          : '🎭 Choose content type:',
        {
          reply_markup: Markup.keyboard([
            [
              Markup.button.text(
                isRu ? '📝 Текст' : '📝 Text'
              ),
            ],
            [
              Markup.button.text(
                isRu ? '🎤 Голосовое сообщение' : '🎤 Voice message'
              ),
            ],
            [
              Markup.button.text(
                isRu ? '❌ Отмена' : '❌ Cancel'
              ),
              Markup.button.text(
                isRu ? '🏠 Главное меню' : '🏠 Main menu'
              ),
            ],
          ]).resize().oneTime(),
        }
      )

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ [AI REELS] Error in step 1:', {
        error: error instanceof Error ? error.message : String(error),
        telegramId: ctx.from?.id?.toString(),
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка обработки изображения.'
          : '❌ Error processing image.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 2: Получение текста/голоса и запуск генерации
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS WIZARD] Step 2 STARTED - Getting text/voice', {
      telegramId,
      hasMessage: !!message,
    })

    if (!telegramId) {
      await ctx.reply(
        isRu ? '❌ Ошибка получения ID' : '❌ Error getting ID'
      )
      return ctx.scene.leave()
    }

    if (!ctx.session.aiReels?.imageUrl) {
      await ctx.reply(
        isRu
          ? '❌ Изображение не найдено в сессии. Начните заново.'
          : '❌ Image not found in session. Start over.'
      )
      return ctx.scene.leave()
    }

    try {
      // Обработка выбора пользователя
      if (message && 'text' in message) {
        const choice = message.text.trim()

        // Отмена
        if (
          choice === (isRu ? '❌ Отмена' : '❌ Cancel') ||
          choice === (isRu ? '🏠 Главное меню' : '🏠 Main menu')
        ) {
          return ctx.scene.leave()
        }

        if (choice === (isRu ? '📝 Текст' : '📝 Text')) {
          // Запрашиваем текст
          await ctx.reply(
            isRu
              ? '📝 Введите текст для озвучивания (до 5000 символов):'
              : '📝 Enter text for voice-over (up to 5000 characters):',
            {
              reply_markup: Markup.keyboard([
                [Markup.button.text(isRu ? '❌ Отмена' : '❌ Cancel')],
              ]).resize(),
            }
          )
          return ctx.wizard.next()
        } else if (choice === (isRu ? '🎤 Голосовое сообщение' : '🎤 Voice message')) {
          // Запрашиваем голос
          await ctx.reply(
            isRu
              ? '🎤 Отправьте голосовое сообщение (до 30 секунд):'
              : '🎤 Send a voice message (up to 30 seconds):',
            {
              reply_markup: Markup.keyboard([
                [Markup.button.text(isRu ? '❌ Отмена' : '❌ Cancel')],
              ]).resize(),
            }
          )
          // Переходим к обработке голоса
          ctx.wizard.selectStep(3)
          return ctx.wizard.next()
        } else {
          await ctx.reply(
            isRu
              ? '❌ Неверный выбор. Выберите один из вариантов.'
              : '❌ Invalid choice. Select one of the options.'
          )
          return ctx.scene.leave()
        }
      } else {
        await ctx.reply(
          isRu
            ? '❌ Пожалуйста, используйте кнопки для выбора.'
            : '❌ Please use buttons to select.'
        )
        return ctx.scene.leave()
      }
    } catch (error) {
      logger.error('❌ [AI REELS] Error in step 2:', {
        error: error instanceof Error ? error.message : String(error),
        telegramId,
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка обработки выбора.'
          : '❌ Error processing choice.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 3: Получение текста и запуск генерации
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS WIZARD] Step 3 STARTED - Processing text', {
      telegramId,
      hasMessage: !!message,
    })

    if (!telegramId) {
      await ctx.reply(
        isRu ? '❌ Ошибка получения ID' : '❌ Error getting ID'
      )
      return ctx.scene.leave()
    }

    try {
      if (!message || !('text' in message)) {
        await ctx.reply(
          isRu
            ? '❌ Пожалуйста, введите текст.'
            : '❌ Please enter text.'
        )
        return ctx.scene.leave()
      }

      const text = message.text.trim()

      if (text.length === 0) {
        await ctx.reply(
          isRu ? '❌ Текст не может быть пустым.' : '❌ Text cannot be empty.'
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

      // ✅ НОВАЯ ЛОГИКА С INNGEST
      try {
        logger.info('🎬 [AI REELS] Sending generation request to Inngest', {
          telegramId,
          imageUrl: ctx.session.aiReels?.imageUrl,
          textLength: text.length,
        })

        // 💰 Стоимость: 240⭐
        const totalCost = 240

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
                  `📊 Стоимость: ${totalCost}⭐ ($${(totalCost / 100).toFixed(2)})\n` +
                  `💳 У вас: ${currentBalance.toFixed(2)}⭐`
              : `💰 Insufficient funds for AI Reels creation\n\n` +
                  `📊 Cost: ${totalCost}⭐ ($${(totalCost / 100).toFixed(2)})\n` +
                  `💳 You have: ${currentBalance.toFixed(2)}⭐`
          )
          return ctx.scene.leave()
        }

        // ✅ Отправляем событие в Inngest
        const eventId = await sendInngestEvent(
          INNGEST_EVENTS.GENERATE_AI_REELS,
          {
            imageUrl: ctx.session.aiReels?.imageUrl,
            text,
            voiceType: 'avatar_voice', // или 'custom_voice'
            telegramId,
            username: ctx.from.username ?? 'unknown',
            totalCost,
            isRu,
            metadata: {
              type: 'ai-reels',
              wizard: 'ai_reels_wizard',
              template: 'Veo 3.1',
            },
          }
        )

        // ✅ Мгновенно отвечаем пользователю
        await ctx.reply(
          isRu
            ? `🎬 Запускаю создание ИИ Рилс...\n\n` +
                `🎯 Процесс включает:\n` +
                `1️⃣ Lip-sync видео\n` +
                `2️⃣ Google Veo 3.1\n` +
                `3️⃣ Склеивание видео\n\n` +
                `⏱️ Время: ~3-5 минут\n` +
                `💰 Стоимость: ${totalCost}⭐\n\n` +
                `🔄 ID задачи: ${eventId.substring(0, 8)}...\n\n` +
                `Вы получите уведомление когда будет готово! 🎉`
            : `🎬 Starting AI Reels creation...\n\n` +
                `🎯 Process includes:\n` +
                `1️⃣ Lip-sync video\n` +
                `2️⃣ Google Veo 3.1\n` +
                `3️⃣ Video merging\n\n` +
                `⏱️ Time: ~3-5 minutes\n` +
                `💰 Cost: ${totalCost}⭐\n\n` +
                `🔄 Task ID: ${eventId.substring(0, 8)}...\n\n` +
                `You'll receive a notification when ready! 🎉`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: isRu ? '🔄 Проверить статус' : '🔄 Check status',
                    callback_data: `status_${eventId}`,
                  },
                ],
                [
                  {
                    text: isRu ? '🏠 Главное меню' : '🏠 Main menu',
                    callback_data: 'go_main_menu',
                  },
                ],
              ],
            },
          }
        )

        logger.info('✅ [AI REELS] Generation started successfully', {
          telegramId,
          eventId,
          textLength: text.length,
        })

        // ✅ Выходим из сцены - генерация работает в фоне
        return ctx.scene.leave()
      } catch (error) {
        logger.error('❌ [AI REELS] Failed to send Inngest event', {
          error: error instanceof Error ? error.message : String(error),
          telegramId,
          text: text.substring(0, 50),
        })

        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при запуске генерации. Попробуйте позже.'
            : '❌ An error occurred while starting generation. Please try again later.'
        )
        return ctx.scene.leave()
      }
    } catch (error) {
      logger.error('❌ [AI REELS] Error in step 3:', {
        error: error instanceof Error ? error.message : String(error),
        telegramId,
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка обработки текста.'
          : '❌ Error processing text.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 4: Обработка голосовых сообщений (упрощённо)
  async ctx => {
    logger.info('🎬 [AI REELS WIZARD] Step 4 - Voice processing', {
      telegramId: ctx.from?.id?.toString(),
    })

    await ctx.reply(
      isRu
        ? '⚠️ Обработка голосовых сообщений пока не реализована в Inngest версии.'
        : '⚠️ Voice message processing not yet implemented in Inngest version.'
    )

    return ctx.scene.leave()
  }
)

export default aiReelsWizard
