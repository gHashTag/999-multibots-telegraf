import { Scenes, Markup, Telegraf } from 'telegraf'
import { type MyContext } from '../../interfaces'
import { getUserBalance, getVoiceId } from '../../core/supabase'
import {
  sendBalanceMessage,
  sendInsufficientStarsMessage,
} from '@/price/helpers'
import { generateTextToSpeech } from '../../services/generateTextToSpeech'
import { isRussian } from '@/helpers'

export const textToSpeechWizard = new Scenes.WizardScene<MyContext>(
  'text_to_speech',
  async ctx => {
    console.log('CASE: text_to_speech')
    const isRu = isRussian(ctx)
    await ctx.reply(
      isRu
        ? '🎙️ Отправьте текст, для преобразования его в голос'
        : '🎙️ Send text, to convert it to voice'
    )
    ctx.wizard.next()
    return
  },
  async ctx => {
    console.log('CASE: text_to_speech.next', ctx.message)
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (!message || !('text' in message)) {
      await ctx.reply(
        isRu ? '✍️ Пожалуйста, отправьте текст' : '✍️ Please send text'
      )
      return
    }

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
      if (!ctx.from?.id) {
        console.error('❌ Telegram ID не найден')
        return
      }
      if (!ctx.from?.username) {
        console.error('❌ Username не найден')
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
      console.error('Error in text_to_speech:', error)
      await ctx.reply(
        isRu
          ? 'Произошла ошибка при создании голосового аватара'
          : 'Error occurred while creating voice avatar'
      )
    }
    ctx.scene.leave()
    return
  }
)

export default textToSpeechWizard
