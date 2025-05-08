import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getUserBalance, getVoiceId } from '../../core/supabase'
import {
  sendBalanceMessage,
  // sendInsufficientStarsMessage, // Больше не используется здесь напрямую, т.к. проверка баланса выше
} from '@/price/helpers'
import { createAudioFileFromText } from '@/core/elevenlabs/createAudioFileFromText'
import { isRussian } from '@/helpers'
import { createHelpCancelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'
import fs from 'fs'
import logger from '@/utils/logger'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { ModeEnum } from '@/interfaces/modes'

export const textToSpeechWizard = new Scenes.WizardScene<MyContext>(
  'text_to_speech',
  async ctx => {
    console.log('CASE: text_to_speech')
    const isRu = isRussian(ctx)
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
    console.log('CASE: text_to_speech.next', ctx.message)
    const isRu = isRussian(ctx)
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
          console.error('❌ Telegram ID не найден')
          return
        }
        const voice_id = await getVoiceId(ctx.from.id.toString())

        if (!voice_id) {
          await ctx.reply(
            isRu
              ? '🎯 Для корректной работы обучите аватар используя 🎤 Голос для аватара в главном меню'
              : '🎯 For correct operation, train the avatar using 🎤 Voice for avatar in the main menu'
          )
          ctx.scene.leave()
          return
        }

        logger.info('[textToSpeechWizard] Calling createAudioFileFromText', {
          text: message.text.substring(0, 20) + '...',
          voice_id,
        })
        audioPath = await createAudioFileFromText({
          text: message.text,
          voice_id,
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
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при преобразовании текста в речь'
            : '❌ Error occurred while converting text to speech'
        )
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
        ctx.scene.leave()
      }
      return
    }
  }
)

export default textToSpeechWizard
