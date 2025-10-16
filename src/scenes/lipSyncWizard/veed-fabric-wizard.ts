import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { lipSyncOrchestrator } from '@/core/lipsync/lipsync-orchestrator'
import { LipSyncInputBuilder } from '@/core/lipsync/schemas/lipsync-schemas'
import { logger } from '@/utils/logger'
import {
  LIPSYNC_MODELS,
  getAvailableLipSyncModels,
  calculateLipSyncCost,
} from '@/config/lipsync-models.config'

/**
 * Wizard для Veed Fabric модели (image + text input)
 */
export const veedFabricWizard = new Scenes.WizardScene<MyContext>(
  'veed_fabric_lipsync',

  // Step 0: Запрос изображения (или продолжение после создания голоса)
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎭 [VEED FABRIC WIZARD] Step 0 STARTED - Запрос изображения', {
      telegramId,
      hasFrom: !!ctx.from,
      hasSavedState: !!(ctx.session.veedFabric?.imageUrl && ctx.session.veedFabric?.text),
      needsVoiceCreation: ctx.session.veedFabric?.needsVoiceCreation,
      function: 'veedFabricWizard.step0',
    })

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    // ✅ УЛУЧШЕНО: Проверяем, возвращаемся ли после создания голоса
    if (
      ctx.session.veedFabric?.imageUrl &&
      ctx.session.veedFabric?.text &&
      ctx.session.veedFabric?.needsVoiceCreation
    ) {
      logger.info('🎭 [VEED FABRIC] Продолжаем с сохраненными данными', {
        telegramId,
        hasImageUrl: !!ctx.session.veedFabric.imageUrl,
        hasText: !!ctx.session.veedFabric.text,
      })

      // Очищаем флаг needsVoiceCreation
      ctx.session.veedFabric.needsVoiceCreation = false

      await ctx.reply(
        isRu
          ? '🎭 Продолжаем генерацию lip-sync видео с вашими данными...'
          : '🎭 Continuing lip-sync video generation with your data...'
      )

      // Пропускаем к Step 2 (генерация)
      ctx.wizard.selectStep(2)
      return ctx.wizard.next()
    }

    // Обычный флоу: инициализируем сессию
    ctx.session.veedFabric = {
      step: 'image',
      startTime: Date.now(),
    }

    logger.info('🎭 [VEED FABRIC WIZARD] Step 0 - Session initialized', {
      telegramId,
      sessionState: ctx.session.veedFabric,
    })

    await ctx.reply(
      isRu
        ? '🎭 Синхронизация губ\n\n📸 Отправьте фото или URL изображения с лицом.\n\n' +
          '📝 На следующем шаге выберите:\n' +
          '• Текст (будет озвучен вашим голосом аватара)\n' +
          '• 🎤 Голосовое сообщение (до 30 сек)'
        : '🎭 Lip Sync\n\n📸 Send a photo or image URL with a face.\n\n' +
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

    logger.info('🎭 [VEED FABRIC WIZARD] Step 1 STARTED - Обработка изображения', {
      telegramId: ctx.from?.id?.toString(),
      hasMessage: !!message,
      messageType: message ? ('photo' in message ? 'photo' : 'text' in message ? 'text' : 'other') : 'none',
      function: 'veedFabricWizard.step1',
    })

    try {
      // Обработка фото из Telegram
      if (message && 'photo' in message && message.photo.length > 0) {
        const photo = message.photo[message.photo.length - 1] // Берем самое большое фото
        const telegramId = ctx.from?.id?.toString()

        logger.info('📸 Скачиваем фото из Telegram', { fileId: photo.file_id, telegramId })

        // ✅ ИСПРАВЛЕНО: Скачиваем и загружаем в Supabase (как голосовое сообщение)
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
          const fileName = `lipsync-images/${telegramId}/${Date.now()}.jpg`

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

          logger.info('✅ Фото загружено в Supabase', {
            fileName,
            publicUrl: imageUrl,
          })
        } catch (uploadError) {
          logger.error('❌ Ошибка загрузки фото', { error: uploadError })
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

        // Простая валидация URL
        if (text.startsWith('http://') || text.startsWith('https://')) {
          imageUrl = text
          logger.info('📸 Получен URL изображения', { url: imageUrl.substring(0, 100) })
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
      ctx.session.veedFabric = {
        ...ctx.session.veedFabric,
        imageUrl,
        step: 'text',
      }

      await ctx.reply(
        isRu
          ? '✅ Изображение получено!\n\n📝 Теперь отправьте:\n• Текст (до 500 символов) - будет озвучен голосом вашего аватара\n• ИЛИ голосовое сообщение - будет использовано напрямую'
          : '✅ Image received!\n\n📝 Now send:\n• Text (up to 500 characters) - will be voiced with your avatar\n• OR voice message - will be used directly'
      )

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ Ошибка обработки изображения', { error })
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке изображения. Попробуйте еще раз.'
          : '❌ An error occurred while processing the image. Try again.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 2: Обработка текста, генерация
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    const telegramId = ctx.from?.id?.toString()

    console.log('🎭 [VEED FABRIC WIZARD] Step 2 STARTED - Обработка текста')
    logger.info('🎭 [VEED FABRIC WIZARD] Step 2 STARTED - Обработка текста', {
      telegramId,
      hasMessage: !!message,
      messageType: message ? ('text' in message ? 'text' : 'other') : 'none',
      textPreview: message && 'text' in message ? message.text.substring(0, 50) : 'N/A',
      hasSavedData: !!(ctx.session.veedFabric?.text && ctx.session.veedFabric?.imageUrl),
      function: 'veedFabricWizard.step2',
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
      // ✅ УЛУЧШЕНО: Получаем текст/голос либо из сообщения, либо из сохраненных данных
      let text: string = ''
      let imageUrl: string
      let audioUrl: string | null = null // Для голосовых сообщений

      if (ctx.session.veedFabric?.text && ctx.session.veedFabric?.imageUrl) {
        // Используем сохраненные данные (после возврата из voice wizard)
        text = ctx.session.veedFabric.text
        imageUrl = ctx.session.veedFabric.imageUrl

        logger.info('🎭 [VEED FABRIC] Using saved data', {
          telegramId,
          textLength: text.length,
          imageUrl: imageUrl.substring(0, 50),
        })
      } else {
        // Обычный флоу: получаем текст или голосовое сообщение
        imageUrl = ctx.session.veedFabric?.imageUrl || ''

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
          // ✅ НОВОЕ: Обработка голосового сообщения
          const voice = message.voice

          logger.info('🎤 [VEED FABRIC] Получено голосовое сообщение', {
            telegramId,
            duration: voice.duration,
            fileSize: voice.file_size,
          })

          // Проверка длительности (максимум 30 секунд)
          if (voice.duration > 30) {
            await ctx.reply(
              isRu
                ? `❌ Голосовое сообщение слишком длинное (${voice.duration} сек). Максимум: 30 секунд.`
                : `❌ Voice message is too long (${voice.duration} sec). Maximum: 30 seconds.`
            )
            return ctx.scene.leave()
          }

          // Скачиваем голосовое сообщение
          try {
            const fileLink = await ctx.telegram.getFileLink(voice.file_id)
            const response = await fetch(fileLink.href)

            if (!response.ok) {
              throw new Error(`Failed to download voice: ${response.statusText}`)
            }

            const audioBuffer = Buffer.from(await response.arrayBuffer())

            // Загружаем в Supabase Storage
            const { createClient } = await import('@supabase/supabase-js')
            const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import('@/config')

            const serviceClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
            const fileName = `lipsync-audio/${telegramId}/${Date.now()}.ogg`

            const { error: uploadError } = await serviceClient.storage
              .from('images')
              .upload(fileName, audioBuffer, {
                contentType: 'audio/ogg',
                upsert: false,
              })

            if (uploadError) {
              throw new Error(`Upload failed: ${uploadError.message}`)
            }

            // Получаем публичный URL
            const { data: urlData } = serviceClient.storage
              .from('images')
              .getPublicUrl(fileName)

            audioUrl = urlData.publicUrl

            logger.info('✅ [VEED FABRIC] Голосовое сообщение загружено', {
              telegramId,
              audioUrl,
              duration: voice.duration,
            })

            // Для расчета стоимости используем реальную длительность
            text = 'voice_message_' + voice.duration // Placeholder для логики стоимости

          } catch (voiceError) {
            logger.error('❌ [VEED FABRIC] Ошибка обработки голоса', { voiceError })
            await ctx.reply(
              isRu
                ? '❌ Ошибка обработки голосового сообщения. Попробуйте еще раз.'
                : '❌ Error processing voice message. Please try again.'
            )
            return ctx.scene.leave()
          }

        } else if (message && 'text' in message) {
          // Обычный текст
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
          // Неподдерживаемый тип сообщения
          await ctx.reply(
            isRu
              ? '❌ Пожалуйста, отправьте текст или голосовое сообщение.'
              : '❌ Please send text or voice message.'
          )
          return ctx.scene.leave()
        }
      }

      // ✅ Проверка наличия голоса аватара (только если используем текст, а не голосовое сообщение)
      if (!audioUrl) {
        const { supabase } = await import('@/core/supabase')
        const { ModeEnum } = await import('@/interfaces/modes')
        const { data: userData } = await supabase
          .from('users')
          .select('voice_id_elevenlabs')
          .eq('telegram_id', telegramId)
          .maybeSingle()

        if (!userData?.voice_id_elevenlabs) {
        // ✅ УЛУЧШЕНО: Сохраняем состояние wizard и предлагаем создать голос
        ctx.session.veedFabric = {
          ...ctx.session.veedFabric,
          imageUrl,
          text,
          step: 'text',
          needsVoiceCreation: true,
        }

        await ctx.reply(
          isRu
            ? '❌ У вас не настроен голос аватара!\n\n' +
              '📝 Для использования этой функции нужен голос аватара.\n\n' +
              '🎤 Хотите создать голос сейчас? Это займет 1-2 минуты.\n\n' +
              '📌 После создания голоса вы сможете продолжить генерацию lip-sync видео.'
            : '❌ You don\'t have an avatar voice configured!\n\n' +
              '📝 This feature requires an avatar voice.\n\n' +
              '🎤 Want to create a voice now? It takes 1-2 minutes.\n\n' +
              '📌 After creating the voice, you can continue with lip-sync generation.'
        )

        // Перенаправляем в команду создания голоса
        const { ModeEnum } = await import('@/interfaces/modes')
        ctx.session.mode = ModeEnum.Voice
        ctx.session.returnToVeedFabricAfterVoice = true // Флаг для возврата

        logger.info('🎤 [VEED FABRIC] Redirecting to voice creation', {
          telegramId,
          savedImageUrl: imageUrl.substring(0, 50),
          savedText: text.substring(0, 50),
        })

          await ctx.scene.enter(ModeEnum.CheckBalanceScene)
          return
        }
      }

      // ✅ Расчет длительности: для голоса берем реальную длительность, для текста оцениваем
      let estimatedDurationSeconds: number

      if (audioUrl) {
        // Для голосового сообщения: извлекаем длительность из placeholder
        const durationMatch = text.match(/voice_message_(\d+)/)
        estimatedDurationSeconds = durationMatch ? parseInt(durationMatch[1], 10) : 10
      } else {
        // Для текста: оцениваем длительность (примерно 15 символов в секунду речи)
        estimatedDurationSeconds = Math.ceil(text.length / 15)
      }
      const resolution = ctx.session.veedFabric?.resolution || '720p' // default 720p для лучшего качества

      // Используем новую систему ценообразования с наценкой 2.4x
      const { calculateLipSyncCostStars } = await import('@/config/lipsync-models.config')
      const cost = calculateLipSyncCostStars('veed_fabric', estimatedDurationSeconds, resolution)

      logger.info('💰 Расчет стоимости Veed Fabric', {
        textLength: text.length,
        estimatedDurationSeconds,
        resolution,
        costStars: cost,
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

      if (currentBalance < cost) {
        await ctx.reply(
          isRu
            ? `Недостаточно средств. Требуется: ${cost.toFixed(2)}⭐, у вас: ${currentBalance}⭐`
            : `Insufficient funds. Required: ${cost.toFixed(2)}⭐, you have: ${currentBalance}⭐`
        )
        return ctx.scene.leave()
      }

      // ✅ СОХРАНЯЕМ ВСЕ ДАННЫЕ в сессию для Step 3
      ctx.session.veedFabric = {
        ...ctx.session.veedFabric,
        imageUrl,
        text,
        audioUrl: audioUrl || undefined,
        duration: estimatedDurationSeconds,
        cost,
        step: 'confirm',
      }

      // ✅ ПОКАЗЫВАЕМ СТОИМОСТЬ И ЗАПРАШИВАЕМ ПОДТВЕРЖДЕНИЕ
      const { Markup } = await import('telegraf')
      await ctx.reply(
        isRu
          ? `💰 Стоимость генерации:\n\n` +
            `⏱ Длительность: ${estimatedDurationSeconds} сек\n` +
            `📺 Качество: ${resolution}\n` +
            `💎 Стоимость: ${cost.toFixed(2)}⭐ (${cost}⭐)\n` +
            `💰 Ваш баланс: ${currentBalance.toFixed(2)}⭐\n\n` +
            `❓ Подтвердите генерацию?`
          : `💰 Generation cost:\n\n` +
            `⏱ Duration: ${estimatedDurationSeconds} sec\n` +
            `📺 Quality: ${resolution}\n` +
            `💎 Cost: ${cost.toFixed(2)}⭐ (${cost}⭐)\n` +
            `💰 Your balance: ${currentBalance.toFixed(2)}⭐\n\n` +
            `❓ Confirm generation?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '✅ Подтвердить' : '✅ Confirm',
              'veed_fabric_confirm'
            )
          ],
          [
            Markup.button.callback(isRu ? '❌ Отменить' : '❌ Cancel', 'veed_fabric_cancel')
          ],
        ])
      )

      // Переходим к следующему шагу (обработка подтверждения)
      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ Ошибка в Veed Fabric wizard Step 2', { error })
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка. Попробуйте позже.'
          : '❌ An error occurred. Try again later.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 3: Обработка подтверждения и генерация
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    // Обрабатываем только callback_query
    if (!('callback_query' in ctx.update)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, нажмите одну из кнопок.'
          : '❌ Please press one of the buttons.'
      )
      return // Остаемся в том же шаге
    }

    const callbackData = 'data' in ctx.update.callback_query ? ctx.update.callback_query.data : ''

    // Обработка отмены
    if (callbackData === 'veed_fabric_cancel') {
      await ctx.answerCbQuery()
      await ctx.reply(isRu ? '❌ Генерация отменена.' : '❌ Generation cancelled.')
      return ctx.scene.leave()
    }

    // Обработка подтверждения
    if (callbackData === 'veed_fabric_confirm') {
      await ctx.answerCbQuery()

      if (!telegramId) {
        await ctx.reply(
          isRu
            ? '❌ Ошибка: не удалось определить ваш ID'
            : '❌ Error: could not determine your ID'
        )
        return ctx.scene.leave()
      }

      try {
        // Получаем сохраненные данные из сессии
        const { imageUrl, text, audioUrl, cost, duration } = ctx.session.veedFabric || {}

        if (!imageUrl || !text || cost === undefined) {
          await ctx.reply(
            isRu
              ? '❌ Ошибка: данные генерации не найдены. Начните заново.'
              : '❌ Error: generation data not found. Start over.'
          )
          return ctx.scene.leave()
        }

        // Списание средств
        const paymentSuccess = await updateUserBalance(
          telegramId,
          cost,
          PaymentType.MONEY_OUTCOME,
          'Lip-sync video generation',
          {
            bot_name: ctx.botInfo?.username || 'unknown_bot',
            service_type: 'lipsync',
            text_length: text.length,
            cost_tier: text.length <= 100 ? 'small' : text.length <= 250 ? 'medium' : 'large',
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

        const currentBalance = await getUserBalance(telegramId)
        const newBalance = currentBalance ? currentBalance : 0

        await ctx.reply(
          isRu
            ? `💰 Списано ${cost.toFixed(2)}⭐. Новый баланс: ${newBalance.toFixed(2)}⭐\n\n⏳ Генерация началась, это займет 30-60 секунд...`
            : `💰 Charged ${cost.toFixed(2)}⭐. New balance: ${newBalance.toFixed(2)}⭐\n\n⏳ Generation started, it will take 30-60 seconds...`
        )

        // ✅ РЕШЕНИЕ ПРОБЛЕМЫ ТАЙМАУТОВ: Асинхронная генерация
        try {
          const input = LipSyncInputBuilder.forVeedFabric(
            imageUrl,
            audioUrl || text, // Передаем либо audioUrl, либо text
            telegramId,
            {
              botName: ctx.botInfo?.username || 'unknown_bot',
              resolution: '720p', // Высокое качество 720p
              isAudioUrl: !!audioUrl, // Флаг: если audioUrl существует, значит это URL, иначе text
            }
          )

          logger.info('🎭 Запуск АСИНХРОННОЙ Veed Fabric генерации', {
            telegramId,
            imageUrl: imageUrl.substring(0, 100),
            textLength: text.length,
          })

          // ✅ Импортируем асинхронный менеджер
          const { asyncLipSyncManager } = await import('@/core/lipsync/async-lipsync-manager')

          // Устанавливаем ссылку на бота (если еще не установлена)
          asyncLipSyncManager.setBotInstance(ctx)

          // Запускаем асинхронную генерацию
          const jobId = await asyncLipSyncManager.startAsyncGeneration(
            input,
            cost,
            telegramId,
            ctx.chat!.id,
            ctx.botInfo
          )

          await ctx.reply(
            isRu
              ? `🚀 Генерация запущена!\n\n` +
                `⏳ Это займет 30-300 секунд\n` +
                `📱 Результат придет отдельным сообщением\n` +
                `🆔 ID задачи: ${jobId.slice(-8)}\n\n` +
                `💡 Можете продолжать пользоваться ботом!`
              : `🚀 Generation started!\n\n` +
                `⏳ It will take 30-300 seconds\n` +
                `📱 Result will come in a separate message\n` +
                `🆔 Job ID: ${jobId.slice(-8)}\n\n` +
                `💡 You can continue using the bot!`
          )

          logger.info('✅ Асинхронная задача запущена', {
            telegramId,
            jobId,
            chatId: ctx.chat!.id,
          })

        } catch (genError) {
          logger.error('❌ Ошибка запуска асинхронной генерации', { error: genError })

          // Возврат средств
          await updateUserBalance(
            telegramId,
            cost,
            PaymentType.MONEY_INCOME,
            'Lip-sync refund - startup error',
            { bot_name: ctx.botInfo?.username || 'unknown_bot' }
          )

          await ctx.reply(
            isRu
              ? `❌ Ошибка запуска генерации. Средства возвращены.`
              : `❌ Error starting generation. Funds refunded.`
          )
        }

        return ctx.scene.leave()
      } catch (error) {
        logger.error('❌ Ошибка в Veed Fabric wizard Step 3', { error })
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка. Попробуйте позже.'
            : '❌ An error occurred. Try again later.'
        )
        return ctx.scene.leave()
      }
    }

    // Неизвестный callback
    await ctx.answerCbQuery()
    await ctx.reply(
      isRu
        ? '❌ Неизвестная команда. Начните заново.'
        : '❌ Unknown command. Start over.'
    )
    return ctx.scene.leave()
  }
)

export default veedFabricWizard
