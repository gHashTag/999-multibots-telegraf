import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getUserBalance, getVoiceId } from '../../core/supabase'
import {
  sendBalanceMessage,
  // sendInsufficientStarsMessage, // Больше не используется здесь напрямую, т.к. проверка баланса выше
} from '@/price/helpers'
import {
  createAudioFileFromText,
  VoiceNotFoundError,
} from '@/core/elevenlabs/createAudioFileFromText'
import {
  validateAndCleanVoiceId,
  getVoiceAvatarErrorMessage,
  getCreateVoiceAvatarMessage,
} from '@/helpers/voiceValidation'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { createHelpCancelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'
import fs from 'fs'
import logger from '@/utils/logger'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { ModeEnum } from '@/interfaces/modes'
import { sendCompletionNotification } from '@/helpers/completionNotification'

export const textToSpeechWizard = new Scenes.WizardScene<MyContext>(
  'text_to_speech',
  async ctx => {
    console.log('CASE: text_to_speech')
    const isRu = isRussianFromState(ctx)

    // Check if we have pre-filled text from voice transcription
    if (ctx.session.ttsTextToConvert) {
      const prefilledText = ctx.session.ttsTextToConvert
      // Clear the pre-filled text from session
      delete ctx.session.ttsTextToConvert

      // Show the text and ask for confirmation
      await ctx.reply(
        isRu
          ? `📝 Текст для озвучивания:\n\n<i>${prefilledText}</i>\n\n✅ Нажмите /convert чтобы озвучить или отправьте другой текст`
          : `📝 Text to convert:\n\n<i>${prefilledText}</i>\n\n✅ Send /convert to proceed or send different text`,
        { parse_mode: 'HTML', ...createHelpCancelKeyboard(isRu) }
      )

      // Store text temporarily for next step
      ctx.session.pendingTtsText = prefilledText
    } else {
      await ctx.reply(
        isRu
          ? '🎙️ Отправьте текст, для преобразования его в голос'
          : '🎙️ Send text, to convert it to voice',
        createHelpCancelKeyboard(isRu)
      )
    }

    ctx.wizard.next()
    return
  },
  async ctx => {
    console.log('CASE: text_to_speech.next', ctx.message)
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    let audioPath: string | null = null
    let textToConvert: string | undefined

    // Check for /convert command with pending text
    if (message && 'text' in message && message.text === '/convert' && ctx.session.pendingTtsText) {
      textToConvert = ctx.session.pendingTtsText
      delete ctx.session.pendingTtsText
    } else if (message && 'text' in message && message.text !== '/convert') {
      // Use the new text provided by user
      textToConvert = message.text
      delete ctx.session.pendingTtsText // Clear any pending text
    } else if (!message || !('text' in message)) {
      await ctx.reply(
        isRu ? '✍️ Пожалуйста, отправьте текст' : '✍️ Please send text'
      )
      return
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      ctx.scene.leave()
      return
    } else if (textToConvert) {
      try {
        if (!ctx.from?.id) {
          console.error('❌ Telegram ID не найден')
          return
        }
        const voice_id = await getVoiceId(ctx.from.id.toString())

        // 🔧 НОВАЯ ЛОГИКА: getVoiceId теперь всегда возвращает voice_id (fallback или пользовательский)
        // Проверим валидность только если это не fallback голос
        logger.info('[textToSpeechWizard] Voice ID obtained', {
          voice_id,
          telegram_id: ctx.from.id.toString()
        })

        // Если voice_id получен, проверяем его валидность только для пользовательских голосов
        if (voice_id) {
          const voiceIsValid = await validateAndCleanVoiceId(
            voice_id,
            ctx.from.id.toString()
          )

          if (!voiceIsValid) {
            logger.warn('[textToSpeechWizard] Voice validation failed, but proceeding with fallback logic')
            // Fallback логика теперь встроена в createAudioFileFromText, поэтому продолжаем
          }
        }

        logger.info('[textToSpeechWizard] Calling createAudioFileFromText', {
          text: textToConvert.substring(0, 20) + '...',
          voice_id,
        })
        audioPath = await createAudioFileFromText({
          text: textToConvert,
          voice_id,
          telegram_id: ctx.from.id.toString(),
        })
        logger.info('[textToSpeechWizard] createAudioFileFromText finished', {
          audioPath,
        })

        if (!audioPath) {
          throw new Error('Failed to generate audio file path.')
        }

        await ctx.replyWithVoice({ source: audioPath })
        logger.info('[textToSpeechWizard] Audio sent to user as voice.', {
          audioPath,
        })

        await ctx.replyWithDocument({ source: audioPath })
        logger.info('[textToSpeechWizard] Audio sent to user as document.', {
          audioPath,
        })

        // Send completion notification with sound
        await sendCompletionNotification(ctx, isRu, 'text_to_speech')

        // --- Начало блока отправки сообщения о балансе ---
        const costResult = calculateModeCost({ mode: ModeEnum.TextToSpeech })
        const cost = costResult.stars
        const currentUserId = ctx.from?.id?.toString()
        const botName = ctx.botInfo?.username || 'unknown_bot'

        if (currentUserId) {
          const currentBalance = await getUserBalance(currentUserId)
          await sendBalanceMessage(ctx, currentBalance, cost, isRu, botName)
          logger.info('[textToSpeechWizard] Balance message sent to user.', {
            currentBalance,
            cost,
          })
        } else {
          logger.warn(
            '[textToSpeechWizard] Cannot send balance message, user ID not found.'
          )
        }
        // --- Конец блока отправки сообщения о балансе ---
      } catch (error) {
        console.error('Error processing text_to_speech in wizard:', error)

        if (error instanceof VoiceNotFoundError) {
          await ctx.reply(getVoiceAvatarErrorMessage(isRu))
        } else {
          await ctx.reply(
            isRu
              ? '❌ Произошла ошибка при преобразовании текста в речь'
              : '❌ Error occurred while converting text to speech'
          )
        }
      } finally {
        if (audioPath && fs.existsSync(audioPath)) {
          try {
            logger.info('[textToSpeechWizard] Deleting temporary audio file', {
              audioPath,
            })
            fs.unlinkSync(audioPath)
          } catch (unlinkErr) {
            logger.error(
              '[textToSpeechWizard] Error deleting temp audio file for TTS',
              { audioPath, error: unlinkErr }
            )
          }
        }
        await ctx.scene.leave()
        await ctx.scene.enter(ModeEnum.MainMenu)
      }
      return
    }
  }
)

export default textToSpeechWizard
