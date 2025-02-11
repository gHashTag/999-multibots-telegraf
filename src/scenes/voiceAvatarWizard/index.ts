import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { generateVoiceAvatar } from '@/services/generateVoiceAvatar'
import { isRussian } from '@/helpers/language'
import { getUserBalance } from '@/core/supabase'
import {
  sendInsufficientStarsMessage,
  sendBalanceMessage,
  voiceConversationCost,
} from '@/price/helpers'
import { createHelpCancelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'

export const voiceAvatarWizard = new Scenes.WizardScene<MyContext>(
  'voice',
  async ctx => {
    const isRu = isRussian(ctx)
    if (!ctx.from?.id) {
      await ctx.reply(
        isRu ? 'Ошибка идентификации пользователя' : 'User identification error'
      )
      return ctx.scene.leave()
    }

    const currentBalance = await getUserBalance(ctx.from.id)
    const price = voiceConversationCost
    if (currentBalance < price) {
      await sendInsufficientStarsMessage(ctx, currentBalance, isRu)
      return ctx.scene.leave()
    }

    await sendBalanceMessage(ctx, currentBalance, price, isRu)

    await ctx.reply(
      isRu
        ? '🎙️ Пожалуйста, отправьте голосовое сообщение для создания голосового аватара'
        : '🎙️ Please send a voice message to create your voice avatar',
      createHelpCancelKeyboard(isRu)
    )

    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (
      !message ||
      !('voice' in message || 'audio' in message || 'text' in message)
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
    } else {
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
        await generateVoiceAvatar(
          fileUrl,
          ctx.from.id,
          ctx,
          isRu,
          ctx.botInfo?.username
        )
      } catch (error) {
        console.error('Error in handleVoiceMessage:', error)
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при создании голосового аватара. Пожалуйста, попробуйте позже.'
            : '❌ An error occurred while creating the voice avatar. Please try again later.'
        )
      }

      return ctx.scene.leave()
    }
  }
)

export default voiceAvatarWizard
