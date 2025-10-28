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
import logger from '@/utils/enhancedLogger'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { ModeEnum } from '@/interfaces/modes'
import { sendCompletionNotification } from '@/helpers/completionNotification'

export const textToSpeechWizard = new Scenes.WizardScene<MyContext>(
  'text_to_speech',
  async ctx => {
    logger.debug('CASE: text_to_speech')
    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '🎙️ Отправьте текст, для преобразования его в голос'
        : '🎙️ Send text, to convert it to voice',
      createHelpCancelKeyboard(isRu)
    )
    ctx.wizard.next()
    return
  },
  async ctx => {
    logger.debug('CASE: text_to_speech.next', ctx.message)
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    let audioPath: string | null = null

    if (!message || !('text' in message)) {
      await ctx.reply(
        isRu ? '✍️ Пожалуйста, отправьте текст' : '✍️ Please send text'
      )
      return
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      ctx.scene.leave()
      return
    } else {
      try {
        if (!ctx.from?.id) {
          logger.error('❌ Telegram ID не найден')
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
          text: message.text.substring(0, 20) + '...',
          voice_id,
        })
        audioPath = await createAudioFileFromText({
          text: message.text,
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
        logger.error('Error processing text_to_speech in wizard:', error)

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
