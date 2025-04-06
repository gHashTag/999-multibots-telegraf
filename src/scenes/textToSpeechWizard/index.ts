import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getVoiceId } from '../../core/supabase'

import { inngest } from '@/core/inngest/clients'
import { isRussian } from '@/helpers'
import { createHelpCancelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'
import { v4 as uuidv4 } from 'uuid'

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
        const telegramId = ctx.from?.id.toString()
        if (!telegramId) {
          await ctx.reply(
            isRu
              ? '❌ Ошибка: не удалось получить ID пользователя'
              : '❌ Error: User ID not found'
          )
          return ctx.scene.leave()
        }

        const voice_id = await getVoiceId(telegramId)

        if (!voice_id) {
          await ctx.reply(
            isRu
              ? '🎯 Для корректной работы обучите аватар используя 🎤 Голос для аватара в главном меню'
              : '🎯 For correct operation, train the avatar using 🎤 Voice for avatar in the main menu'
          )
          ctx.scene.leave()
          return
        }

        await inngest.send({
          id: `tts-${telegramId}-${Date.now()}-${uuidv4().substring(0, 8)}`,
          name: 'text-to-speech.requested',
          data: {
            text: message.text,
            voice_id,
            telegram_id: telegramId,
            is_ru: isRu,
            bot_name: ctx.botInfo?.username,
          },
        })
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
  }
)

export default textToSpeechWizard
