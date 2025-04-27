import { Scenes, Markup, Telegraf } from 'telegraf'
import type { MyContext } from '@/interfaces'
import { generateVoiceAvatar } from '@/services/generateVoiceAvatar'
import { isRussian } from '@/helpers'
import { getUserBalance, getVoiceId } from '@/core/supabase'
import {
  sendInsufficientStarsMessage,
  sendBalanceMessage,
  voiceConversationCost,
} from '@/price/helpers'

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

    const currentBalance = await getUserBalance(ctx.from.id.toString())
    const price = voiceConversationCost
    if (currentBalance < price) {
      await sendInsufficientStarsMessage(ctx, currentBalance, isRu)
      return ctx.scene.leave()
    }

    await sendBalanceMessage(
      ctx,
      currentBalance,
      price,
      isRu,
      ctx.botInfo.username
    )

    await ctx.reply(
      isRu
        ? 'Отправьте описание голоса для аватара'
        : 'Send a voice description for the avatar'
    )

    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    let fileId: string | undefined
    if (message && 'voice' in message && message.voice) {
      fileId = message.voice.file_id
    } else if (message && 'audio' in message && message.audio) {
      fileId = message.audio.file_id
    }

    if (!fileId) {
      await ctx.reply(
        isRu
          ? 'Ошибка: не удалось получить идентификатор файла из голосового сообщения или аудио.'
          : 'Error: could not retrieve file ID from voice message or audio.'
      )
      return ctx.scene.leave()
    }

    try {
      const file = await ctx.telegram.getFile(fileId)
      if (!file.file_path) {
        throw new Error('File path not found')
      }

      const fileUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`

      const description = ctx.session.voiceDescription
      if (!description) {
        await ctx.reply(
          isRu
            ? 'Ошибка: описание голоса не найдено в сессии.'
            : 'Error: Voice description not found in session.'
        )
        return ctx.scene.leave()
      }

      if (!ctx.from?.id) {
        console.error('❌ Telegram ID не найден')
        return
      }
      await generateVoiceAvatar(
        fileUrl,
        description,
        ctx.from.id.toString(),
        ctx,
        isRu,
        ctx.botInfo?.username || 'unknown_bot'
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
)
