import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { createVoiceAvatar } from '@/services/plan_b/createVoiceAvatar'
import { telegramFileApiFor } from '@/services/telegramApi'
import { isRussian } from '@/helpers/language'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import {
  sendInsufficientStarsMessage,
  sendBalanceMessage,
  voiceConversationCost,
} from '@/price/helpers'
import { createHelpCancelKeyboard } from '@/navigation'
import { handleHelpCancel } from '@/navigation'
import { logger } from '@/utils/logger'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { PaymentType } from '@/interfaces/payments.interface'

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
          isRu
            ? '❌ Процесс отменён. Возвращаюсь в главное меню.'
            : '❌ Process cancelled. Returning to main menu.',
          { reply_markup: { remove_keyboard: true } }
        )
        await ctx.scene.leave()
        const { showMainMenu } = await import('@/navigation')
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
      const { showMainMenu } = await import('@/navigation')
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
        const { showMainMenu } = await import('@/navigation')
        await showMainMenu(ctx)
        return
      }

      // In-flight guard (same shape as morphing/aiCover). createVoiceAvatar
      // levels the user up, creates an ElevenLabs voice, and writes voice_id to
      // the DB; step 2 stays active until it resolves, so a second voice message
      // sent during that window ran it again — double level-up, a second and now
      // orphaned ElevenLabs voice, and a duplicate success message. Reject the
      // re-entry without touching the winner's flag; set synchronously so there
      // is no await between the check and the set.
      if (ctx.session.voiceAvatarInProgress) {
        await ctx.reply(
          isRu
            ? '⏳ Уже создаю ваш голосовой аватар, подождите немного...'
            : '⏳ Already creating your voice avatar, please wait a moment...'
        )
        return
      }
      ctx.session.voiceAvatarInProgress = true

      try {
        const file = await ctx.telegram.getFile(fileId)
        if (!file.file_path) {
          throw new Error('File path not found')
        }

        const fileUrl = `${telegramFileApiFor(ctx.telegram.token)}/${file.file_path}`

        // Получаем текст сообщения безопасно
        const messageText =
          'text' in ctx.message ? ctx.message.text : 'No text provided'
        if (!ctx.from?.id) {
          logger.error('❌ Telegram ID не найден')
          return
        }

        // Gate the paid ElevenLabs voice clone on balance BEFORE calling it,
        // mirroring textToSpeechWizard (same Voice family, same subscriber tier).
        // This wizard previously ran a persistent, credit-burning clone with no
        // balance check and no star deduction; the sibling gates AND charges.
        const cost = calculateModeCost({ mode: ModeEnum.Voice }).stars
        const { checkUserBalance } = await import('@/helpers/checkUserBalance')
        const hasBalance = await checkUserBalance(ctx, cost)
        if (!hasBalance) {
          await ctx.scene.leave()
          const { showMainMenu } = await import('@/navigation')
          await showMainMenu(ctx)
          return
        }

        const voiceResult = await createVoiceAvatar(
          fileUrl,
          ctx.from.id.toString(),
          ctx.from?.username || '',
          isRu,
          ctx
        )

        // Charge only when a voice was actually created. createVoiceAvatar
        // resolves with undefined on the ElevenLabs voice-limit path (it messages
        // the user and does NOT throw), so charging unconditionally would bill for
        // a voice that was never made. Charging AFTER the await also means an
        // ElevenLabs throw short-circuits before any deduction (no charge-on-fail).
        // isFallback means a Cloudflare block substituted the stock Rachel voice
        // instead of cloning the user's -- not the paid product, so do not charge.
        if (voiceResult?.voiceId && !voiceResult.isFallback && cost > 0) {
          const charged = await updateUserBalance(
            ctx.from.id.toString(),
            cost,
            PaymentType.MONEY_OUTCOME,
            'Voice avatar creation',
            { service_type: 'VOICE_AVATAR' }
          )
          if (!charged) {
            logger.error('❌ Failed to charge user for voice avatar', {
              telegram_id: ctx.from.id,
              cost,
            })
            await ctx.reply(
              isRu
                ? '⚠️ Аватар создан, но произошла ошибка при списании средств. Обратитесь в поддержку.'
                : '⚠️ Avatar created, but there was an error charging your balance. Please contact support.'
            )
          }
        }

        // ✅ УЛУЧШЕНО: Проверяем флаг возврата в Veed Fabric
        if (
          ctx.session.returnToVeedFabricAfterVoice &&
          ctx.session.veedFabric
        ) {
          // Очищаем флаг
          delete ctx.session.returnToVeedFabricAfterVoice

          await ctx.reply(
            isRu
              ? '✅ Голос успешно создан!\n\n🎭 Возвращаемся к генерации lip-sync видео...'
              : '✅ Voice successfully created!\n\n🎭 Returning to lip-sync generation...'
          )

          // Возвращаемся в Veed Fabric wizard на шаг генерации
          return ctx.scene.enter(ModeEnum.VeedFabricLipSync)
        }

        // ✅ ИСПРАВЛЕНИЕ: Переходим в главное меню после создания голоса
        await ctx.reply(
          isRu
            ? '✅ Голосовой аватар успешно создан!\n\n🎙️ Теперь вы можете использовать команду "🎙️ Текст в голос" или найти её в главном меню.'
            : '✅ Voice avatar successfully created!\n\n🎙️ Now you can use the "🎙️ Text to speech" command or find it in the main menu.'
        )
        await ctx.scene.leave()
        const { showMainMenu } = await import('@/navigation')
        await showMainMenu(ctx)
        return
      } catch (error) {
        logger.error('Error in handleVoiceMessage (Plan B):', {
          error: error.message || String(error),
        })
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при создании голосового аватара. Пожалуйста, попробуйте позже.'
            : '❌ An error occurred while creating the voice avatar. Please try again later.'
        )
        // ✅ ИСПРАВЛЕНИЕ: Переходим в главное меню при ошибке
        await ctx.scene.leave()
        const { showMainMenu } = await import('@/navigation')
        await showMainMenu(ctx)
        return
      } finally {
        ctx.session.voiceAvatarInProgress = false
      }
    }
  }
)

// A veed-fabric lip-sync detour into this Voice scene sets
// returnToVeedFabricAfterVoice so a SUCCESSFUL voice creation resumes lip-sync.
// If the user abandons the detour (cancel / invalid input / insufficient
// balance / error), that flag must not survive into a later, unrelated voice
// creation -- otherwise its success re-enters VeedFabricLipSync on the OLD
// staged image+text (cross-scene session pollution -> paid wrong generation).
// Clearing it on EVERY scene leave closes all abandon paths at once. The
// legitimate return path already deletes the flag before ctx.scene.enter, so
// this is a no-op there and leaves ctx.session.veedFabric intact for the resume.
voiceAvatarWizard.leave(async ctx => {
  if (ctx.session) {
    delete ctx.session.returnToVeedFabricAfterVoice
  }
})

export default voiceAvatarWizard
