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
import { logger } from '@/utils/logger'

export const voiceAvatarWizard = new Scenes.WizardScene<MyContext>(
  'voice',
  async ctx => {
    const isRu = isRussian(ctx)
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

    // Проверяем команды отмены
    if (message && 'text' in message) {
      const text = message.text

      if (text === '/menu' || text === '/cancel') {
        await ctx.reply(
          isRu ? '❌ Процесс отменён. Возвращаюсь в главное меню.' : '❌ Process cancelled. Returning to main menu.',
          { reply_markup: { remove_keyboard: true } }
        )
        await ctx.scene.leave()
        const { showMainMenu } = await import('@/services/NavigationService')
        await showMainMenu(ctx)
        return
      }
    }

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
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/services/NavigationService')
      await showMainMenu(ctx)
      return
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
        await ctx.scene.leave()
        const { showMainMenu } = await import('@/services/NavigationService')
        await showMainMenu(ctx)
        return
      }

      try {
        const file = await ctx.telegram.getFile(fileId)
        if (!file.file_path) {
          throw new Error('File path not found')
        }

        const fileUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`

        // Получаем текст сообщения безопасно
        const messageText =
          'text' in ctx.message ? ctx.message.text : 'No text provided'
        if (!ctx.from?.id) {
          logger.error('❌ Telegram ID не найден')
          return
        }

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

        // ✅ ИСПРАВЛЕНИЕ: Переходим в главное меню после создания голоса
        await ctx.reply(
          isRu
            ? '✅ Голосовой аватар успешно создан!\n\n🎙️ Теперь вы можете использовать команду "🎙️ Текст в голос" или найти её в главном меню.'
            : '✅ Voice avatar successfully created!\n\n🎙️ Now you can use the "🎙️ Text to speech" command or find it in the main menu.'
        )
        await ctx.scene.leave()
        const { showMainMenu } = await import('@/services/NavigationService')
        await showMainMenu(ctx)
        return
      } catch (error) {
        logger.error('Error in handleVoiceMessage (Plan B):', { error: error.message || String(error) })
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при создании голосового аватара. Пожалуйста, попробуйте позже.'
            : '❌ An error occurred while creating the voice avatar. Please try again later.'
        )
        // ✅ ИСПРАВЛЕНИЕ: Переходим в главное меню при ошибке
        await ctx.scene.leave()
        const { showMainMenu } = await import('@/services/NavigationService')
        await showMainMenu(ctx)
        return
      }
    }
  }
)

export default voiceAvatarWizard
