import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getUserBalance, getVoiceId } from '../../core/supabase'
import {
  textToSpeechCost,
  sendBalanceMessage,
  sendInsufficientStarsMessage,
} from '@/price/helpers'
import { generateTextToSpeech } from '../../services/generateTextToSpeech'
import { isRussian } from '@/helpers'
import { createHelpCancelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'

export const textToSpeechWizard = new Scenes.WizardScene<MyContext>(
  'textToSpeechWizard',
  async ctx => {
    console.log('CASE: textToSpeechWizard')
    const isRu = isRussian(ctx)
    if (!ctx.from) {
      await ctx.reply(
        isRu ? 'Ошибка идентификации пользователя' : 'User identification error'
      )
      ctx.scene.leave()
      return
    }

    const currentBalance = await getUserBalance(ctx.from.id)
    const price = textToSpeechCost
    if (currentBalance < price) {
      await sendInsufficientStarsMessage(ctx, currentBalance, isRu)
      ctx.scene.leave()
      return
    }

    await sendBalanceMessage(ctx, currentBalance, price, isRu)

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
    console.log('CASE: textToSpeechWizard.next', ctx.message)
    const isRu = isRussian(ctx)
    const message = ctx.message

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

        await generateTextToSpeech(
          message.text,
          voice_id,
          ctx.from.id,
          ctx.from.username || '',
          isRu,
          ctx.botInfo?.username
        )
      } catch (error) {
        console.error('Error in textToSpeechWizard:', error)
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при создании голосового аватара'
            : 'Error occurred while creating voice avatar'
        )
      }
      ctx.scene.leave()
      return
    }
  }
)

export default textToSpeechWizard
