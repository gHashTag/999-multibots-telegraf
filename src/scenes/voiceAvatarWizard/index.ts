import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { createVoiceAvatar } from '@/services/plan_b/createVoiceAvatar'
import { isRussian } from '@/helpers/language'
import { getUserBalance } from '@/core/supabase'
import {
  sendInsufficientStarsMessage,
  sendBalanceMessage,
  voiceConversationCost,
} from '@/price/helpers'
import { createHelpCancelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'
import { transcribeAudioFromUrl } from '@/services/audioTranscription'
import { logger } from '@/utils/logger'

export const voiceAvatarWizard = new Scenes.WizardScene<MyContext>(
  'voice',
  async ctx => {
    const isRu = isRussian(ctx)

    // Create keyboard with two options
    const keyboard = Markup.keyboard([
      [
        Markup.button.text(isRu ? '🎙️ Создать голосовой аватар' : '🎙️ Create voice avatar'),
        Markup.button.text(isRu ? '📝 Голос в текст' : '📝 Voice to text')
      ],
      [Markup.button.text(isRu ? '❌ Отмена' : '❌ Cancel')]
    ]).resize()

    await ctx.reply(
      isRu
        ? '🎙️ Выберите действие:\n\n• Создать голосовой аватар - для озвучки текста вашим голосом\n• Голос в текст - для расшифровки голосового сообщения'
        : '🎙️ Choose action:\n\n• Create voice avatar - for text-to-speech with your voice\n• Voice to text - for transcribing voice message',
      keyboard
    )

    return ctx.wizard.next()
  },
  // Step 2: Handle the user choice
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (message && 'text' in message) {
      // Check which option was selected
      if (message.text === (isRu ? '🎙️ Создать голосовой аватар' : '9️ Create voice avatar')) {
        ctx.session.voiceMode = 'avatar'
        await ctx.reply(
          isRu
            ? '🎙️ Отправьте голосовое сообщение для создания голосового аватара'
            : '🎙️ Send a voice message to create your voice avatar',
          Markup.removeKeyboard()
        )
        return ctx.wizard.next()
      } else if (message.text === (isRu ? '📝 Голос в текст' : '📝 Voice to text')) {
        ctx.session.voiceMode = 'transcribe'
        await ctx.reply(
          isRu
            ? '🎙️ Отправьте голосовое сообщение для расшифровки в текст'
            : '🎙️ Send a voice message to transcribe to text',
          Markup.removeKeyboard()
        )
        return ctx.wizard.next()
      } else if (message.text === (isRu ? '❌ Отмена' : '❌ Cancel')) {
        await ctx.scene.leave()
        return
      }
    }

    // If no valid option selected, repeat
    await ctx.reply(
      isRu
        ? '❌ Пожалуйста, выберите одну из опций'
        : '❌ Please select one of the options'
    )
    return
  },
  // Step 3: Process voice message
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message
    const mode = ctx.session.voiceMode || 'avatar' // Default to avatar if not set

    // Проверяем команды отмены
    if (message && 'text' in message) {
      const text = message.text

      if (text === '/menu' || text === '/cancel') {
        await ctx.reply(
          isRu ? '❌ Процесс отменён. Возвращаюсь в главное меню.' : '❌ Process cancelled. Returning to main menu.',
          { reply_markup: { remove_keyboard: true } }
        )
        return ctx.scene.leave()
      }
    }

    if (
      !message ||
      !('voice' in message || 'audio' in message)
    ) {
      await ctx.reply(
        isRu
          ? '🎙️ Пожалуйста, отправьте голосовое сообщение'
          : '🎙️ Please send a voice message'
      )
      return
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    const fileId =
      'voice' in message
        ? message.voice.file_id
        : 'audio' in message
        ? message.audio.file_id
        : undefined

    if (!fileId) {
      await ctx.reply(
        isRu
          ? 'Ошибка: не удалось получить идентификатор файла'
          : 'Error: could not retrieve file ID'
      )
      return ctx.scene.leave()
    }

    try {
      const file = await ctx.telegram.getFile(fileId)
      if (!file.file_path) {
        throw new Error('File path not found')
      }

      const fileUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`

      if (!ctx.from?.id) {
        console.error('❌ Telegram ID не найден')
        return ctx.scene.leave()
      }

      // Branch based on mode
      if (mode === 'transcribe') {
        // Voice-to-text transcription mode
        await ctx.reply(
          isRu
            ? '⏳ Расшифровываю голосовое сообщение...'
            : '⏳ Transcribing voice message...'
        )

        logger.info('[VoiceWizard] Starting voice transcription', {
          telegramId: ctx.from.id,
          fileId,
          fileUrl
        })

        const transcriptionResult = await transcribeAudioFromUrl(fileUrl)

        if (transcriptionResult.success && transcriptionResult.text) {
          // Send transcribed text
          const transcribedText = transcriptionResult.text

          // Send as formatted text for easy copying
          await ctx.reply(
            isRu
              ? `✅ Расшифровка голосового сообщения:\n\n<code>${transcribedText}</code>`
              : `✅ Voice message transcription:\n\n<code>${transcribedText}</code>`,
            { parse_mode: 'HTML' }
          )

          logger.info('[VoiceWizard] Voice transcription successful', {
            telegramId: ctx.from.id,
            textLength: transcribedText.length,
            language: transcriptionResult.language
          })

          // Offer to convert text to speech
          const keyboard = Markup.keyboard([
            [Markup.button.text(isRu ? '🎙️ Озвучить текст' : '🎙️ Convert to speech')],
            [Markup.button.text(isRu ? '📝 Ещё расшифровка' : '📝 Another transcription')],
            [Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu')]
          ]).resize()

          await ctx.reply(
            isRu
              ? 'Хотите озвучить этот текст или расшифровать ещё одно сообщение?'
              : 'Would you like to convert this text to speech or transcribe another message?',
            keyboard
          )

          // Store transcribed text in session for potential TTS
          ctx.session.lastTranscribedText = transcribedText
        } else {
          logger.error('[VoiceWizard] Voice transcription failed', {
            telegramId: ctx.from.id,
            error: transcriptionResult.error
          })

          await ctx.reply(
            isRu
              ? `❌ Не удалось расшифровать голосовое сообщение: ${transcriptionResult.error || 'Неизвестная ошибка'}`
              : `❌ Failed to transcribe voice message: ${transcriptionResult.error || 'Unknown error'}`
          )
        }
      } else {
        // Original voice avatar creation mode
        await createVoiceAvatar(
          fileUrl,
          ctx.from.id.toString(),
          ctx.from?.username || '',
          isRu,
          ctx
        )

        // ✅ УЛУЧШЕНО: Проверяем флаг возврата в Veed Fabric
        if (ctx.session.returnToVeedFabricAfterVoice && ctx.session.veedFabric) {
          // Очищаем флаг
          delete ctx.session.returnToVeedFabricAfterVoice

          await ctx.reply(
            isRu
              ? '✅ Голос успешно создан!\n\n🎭 Возвращаемся к генерации lip-sync видео...'
              : '✅ Voice successfully created!\n\n🎭 Returning to lip-sync generation...'
          )

          // Возвращаемся в Veed Fabric wizard на шаг генерации
          return ctx.scene.enter('veed_fabric_lipsync')
        }

        // Если createVoiceAvatar выполнился успешно (не выбросил исключение),
        // переходим в сцену text_to_speech вместо выхода из текущей сцены.
        return ctx.scene.enter('text_to_speech');
      }
    } catch (error: any) {
      console.error('Error in handleVoiceMessage (Plan B):', error)
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при создании голосового аватара. Пожалуйста, попробуйте позже.'
          : '❌ An error occurred while creating the voice avatar. Please try again later.'
      )
    }
  }
)

// Add handlers for transcription navigation buttons
voiceAvatarWizard.hears(
  ['🎙️ Озвучить текст', '🎙️ Convert to speech'],
  async ctx => {
    const isRu = isRussian(ctx)

    // Check if we have transcribed text stored
    if (ctx.session.lastTranscribedText) {
      // Enter TTS wizard with the transcribed text
      ctx.session.ttsTextToConvert = ctx.session.lastTranscribedText
      return ctx.scene.enter('text_to_speech')
    } else {
      await ctx.reply(
        isRu
          ? '❌ Нет текста для озвучивания'
          : '❌ No text to convert to speech'
      )
    }
  }
)

voiceAvatarWizard.hears(
  ['📝 Ещё расшифровка', '📝 Another transcription'],
  async ctx => {
    // Restart the wizard from the beginning
    return ctx.scene.reenter()
  }
)

voiceAvatarWizard.hears(
  ['🏠 Главное меню', '🏠 Main menu'],
  async ctx => {
    return ctx.scene.leave()
  }
)

export default voiceAvatarWizard
