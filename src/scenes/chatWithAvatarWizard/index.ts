import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussian } from '../../helpers/language'
import { createHelpCancelKeyboard, handleHelpCancel, CancelButtonService, showMainMenu } from '@/navigation'
import { MAIN_MENU_VARIANTS, CANCEL_VARIANTS } from '@/navigation/config/categories.config'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { transcribeAudioFromUrl } from '@/services/audioTranscription'

/**
 * 🤖 Обработка сообщения пользователя (текст или транскрибированное аудио)
 */
async function processUserMessage(ctx: MyContext, prompt: string): Promise<void> {
  const telegramId = ctx.from?.id?.toString()
  if (!telegramId) {
    await ctx.scene.leave()
    return
  }

  // Показываем индикатор "печатает..." пока готовим ответ
  await ctx.sendChatAction('typing')

  const { answerAi } = await import('../../core/openai/requests')
  const { getUserData, getUserModel } = await import('../../core/supabase')
  const { getUserLanguageFromState } = await import('@/helpers/centralizedLanguage')

  const userData = await getUserData(telegramId)
  const userModel = await getUserModel(telegramId)
  const languageCode = getUserLanguageFromState(ctx)

  const model = userModel || 'deepseek-chat'

  // Отправляем еще один индикатор перед вызовом AI (для долгих запросов)
  await ctx.sendChatAction('typing')

  const response = await answerAi(
    model,
    userData,
    prompt,
    languageCode,
    undefined,
    ctx,
    telegramId,
    isRussian(ctx)
  )

  // ✅ Проверяем, является ли ответ изображением (от Nano Banana Pro)
  if (typeof response === 'object' && response.type === 'image') {
    logger.info('🖼️ [chatWithAvatarWizard] Image response received', {
      telegramId,
      imageUrl: response.imageUrl,
      cost: response.cost,
    })
    const isRu = isRussian(ctx)

    // ✅ Формируем подпись с информацией о стоимости
    const caption = isRu
      ? `✨ Изображение сгенерировано с помощью Nano Banana Pro\n\n💫 Стоимость: ${response.cost || 'N/A'}⭐`
      : `✨ Image generated using Nano Banana Pro\n\n💫 Cost: ${response.cost || 'N/A'}⭐`

    await ctx.replyWithPhoto(response.imageUrl, { caption })
  } else {
    // Обычный текстовый ответ
    await ctx.reply(response as string)
  }

  // Пост-обработка пользователя (достижимый код)
  try {
    const userExists = await getUserByTelegramId(ctx)
    if (!userExists) {
      logger.error(`[chatWithAvatarWizard] User with ID ${telegramId} not found after message processing.`)
    } else {
      const level = userExists.level
      if (level === 4) {
        await updateUserLevelPlusOne(telegramId, level)
      }
    }
  } catch (e) {
    logger.error('[chatWithAvatarWizard] post-processing error:', e)
  }
}

export const chatWithAvatarWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ChatWithAvatar,
  async ctx => {
    console.log('CASE: Чат с аватаром')
    const isRu = isRussian(ctx)

    await ctx.reply(
      isRu
        ? 'Напиши мне сообщение 💭 или отправь голосовое 🎤'
        : 'Write me a message 💭 or send a voice 🎤',
      {
        reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
      }
    )
    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const telegramId = ctx.from?.id?.toString()

    // ✅ Обработка "Справка" через глобальный обработчик
    // ✅ "Отмена" обрабатывается глобально в registerCommands.ts
    if (ctx.message && 'text' in ctx.message) {
      const text = ctx.message.text.trim()

      // ✅ FIX: Обработка кнопки "Главное меню" - выход из сцены
      if (MAIN_MENU_VARIANTS.includes(text)) {
        logger.info('🏠 [chatWithAvatarWizard] Main menu pressed, leaving scene')
        await ctx.scene.leave()
        await showMainMenu(ctx)
        return
      }

      // ✅ FIX: Обработка кнопки "Отмена" - выход из сцены
      if (CANCEL_VARIANTS.includes(text)) {
        logger.info('❌ [chatWithAvatarWizard] Cancel pressed, leaving scene')
        await ctx.scene.leave()
        await showMainMenu(ctx)
        return
      }

      const isHelpHandled = await handleHelpCancel(ctx)
      if (isHelpHandled) {
        return
      }
    }

    // ✅ Обработка ТЕКСТОВОГО сообщения
    if (ctx.message && 'text' in ctx.message) {
      try {
        await processUserMessage(ctx, ctx.message.text)
        return ctx.wizard.selectStep(1)
      } catch (error) {
        logger.error('[chatWithAvatarWizard] Error processing text:', error)
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при обработке сообщения.'
            : '❌ An error occurred while processing the message.'
        )
        return ctx.scene.leave()
      }
    }

    // ✅ Обработка ГОЛОСОВОГО сообщения
    if (ctx.message && 'voice' in ctx.message) {
      try {
        logger.info('🎤 [chatWithAvatarWizard] Voice message received', {
          telegramId,
          duration: ctx.message.voice.duration,
          fileSize: ctx.message.voice.file_size,
        })

        // Показываем статус "записывает голосовое" пока транскрибируем
        await ctx.sendChatAction('record_voice')

        // Получаем ссылку на файл от Telegram
        const fileId = ctx.message.voice.file_id
        const fileLink = await ctx.telegram.getFileLink(fileId)

        logger.info('🎤 [chatWithAvatarWizard] Downloading and transcribing voice', {
          telegramId,
          fileUrl: fileLink.href,
        })

        // Показываем статус "печатает" пока транскрибируем
        await ctx.sendChatAction('typing')

        // Транскрибируем аудио через OpenAI Whisper
        const transcription = await transcribeAudioFromUrl(fileLink.href)

        if (!transcription.success || !transcription.text) {
          logger.error('🎤 [chatWithAvatarWizard] Transcription failed', {
            telegramId,
            error: transcription.error,
          })
          await ctx.reply(
            isRu
              ? '❌ Не удалось распознать голосовое сообщение. Попробуйте ещё раз или напишите текстом.'
              : '❌ Could not recognize voice message. Please try again or type your message.'
          )
          return ctx.wizard.selectStep(1)
        }

        logger.info('🎤 [chatWithAvatarWizard] Voice transcribed successfully', {
          telegramId,
          textLength: transcription.text.length,
          text: transcription.text.substring(0, 100) + '...',
        })

        // Показываем пользователю распознанный текст
        await ctx.reply(
          isRu
            ? `🎤 Распознано: "${transcription.text}"`
            : `🎤 Recognized: "${transcription.text}"`
        )

        // Обрабатываем транскрибированный текст как обычное сообщение
        await processUserMessage(ctx, transcription.text)
        return ctx.wizard.selectStep(1)
      } catch (error) {
        logger.error('[chatWithAvatarWizard] Error processing voice:', error)
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при обработке голосового сообщения.'
            : '❌ An error occurred while processing the voice message.'
        )
        return ctx.wizard.selectStep(1)
      }
    }

    // ✅ Неизвестный тип сообщения
    logger.warn('[chatWithAvatarWizard] Unsupported message type', {
      telegramId,
      messageType: Object.keys(ctx.message || {}),
    })
    await ctx.reply(
      isRu
        ? '❓ Отправьте текстовое или голосовое сообщение.'
        : '❓ Please send a text or voice message.'
    )
    return ctx.wizard.selectStep(1)
  }
)

chatWithAvatarWizard.action('cancel', async (ctx) => {
  await ctx.answerCbQuery()
  logger.info('❌ [chatWithAvatarWizard] Cancel button pressed')
  await ctx.scene.leave()
  await showMainMenu(ctx)
})

chatWithAvatarWizard.action('help', async (ctx) => {
  await ctx.answerCbQuery()
  const isRu = isRussian(ctx)
  await ctx.reply(
    isRu
      ? '💡 <b>Чат с аватаром</b>\n\n• Напишите текстовое сообщение\n• Или отправьте голосовое\n• Аватар ответит используя выбранную модель AI\n\n❌ Нажмите "Отмена" для выхода'
      : '💡 <b>Avatar Chat</b>\n\n• Send a text message\n• Or send a voice message\n• Avatar will respond using the selected AI model\n\n❌ Press "Cancel" to exit',
    { parse_mode: 'HTML' }
  )
})

export default chatWithAvatarWizard
