import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { generateLipSync } from '../../services/generateLipSync'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { BASE_COSTS } from '@/scenes/checkBalanceScene'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

// НОВОЕ: Проверка админских прав для LipSync
const adminIds = process.env.ADMIN_IDS?.split(',') || []

function isUserAdmin(telegramId: string): boolean {
  return adminIds.includes(telegramId)
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

// Рассчитываем стоимость LipSync
const LIPSYNC_COST_VALUE = BASE_COSTS[ModeEnum.LipSync] || 84.38 // 84.38⭐
const LIPSYNC_COST =
  typeof LIPSYNC_COST_VALUE === 'function'
    ? LIPSYNC_COST_VALUE(1)
    : LIPSYNC_COST_VALUE

export const lipSyncWizard = new Scenes.WizardScene<MyContext>(
  'lip_sync',
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    // НОВОЕ: Проверка админских прав
    if (!telegramId || !isUserAdmin(telegramId)) {
      await ctx.reply(
        isRu
          ? '🔒 Извините, функция LipSync временно доступна только администраторам.'
          : '🔒 Sorry, LipSync feature is temporarily available for administrators only.'
      )
      return ctx.scene.leave()
    }

    await ctx.reply(
      isRu ? 'Отправьте видео или URL видео' : 'Send a video or video URL',
      {
        reply_markup: { remove_keyboard: true },
      }
    )
    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    let videoUrl: string | undefined

    if (message && 'video' in message) {
      const videoFile = await ctx.telegram.getFile(message.video.file_id)
      if (videoFile?.file_size && videoFile.file_size > MAX_FILE_SIZE) {
        await ctx.reply(
          isRu
            ? 'Ошибка: видео слишком большое. Максимальный размер: 50MB'
            : 'Error: video is too large. Maximum size: 50MB'
        )
        return ctx.scene.leave()
      }
      videoUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${videoFile.file_path}`
    } else if (message && 'text' in message) {
      videoUrl = message.text
    }

    if (!videoUrl) {
      await ctx.reply(
        isRu ? 'Ошибка: видео не предоставлено' : 'Error: video not provided'
      )
      return ctx.scene.leave()
    }

    ctx.session.videoUrl = videoUrl
    await ctx.reply(
      isRu
        ? 'Отправьте аудио, голосовое сообщение или URL аудио'
        : 'Send an audio, voice message, or audio URL'
    )
    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message

    let audioUrl: string | undefined
    if (message && 'audio' in message) {
      if (!message.audio.file_id) {
        console.error('❌ Audio file ID не найден')
        return
      }
      const audioFile = await ctx.telegram.getFile(message.audio.file_id)
      if (audioFile?.file_size && audioFile.file_size > MAX_FILE_SIZE) {
        await ctx.reply(
          isRu
            ? 'Ошибка: аудио слишком большое. Максимальный размер: 50MB'
            : 'Error: audio is too large. Maximum size: 50MB'
        )
        return ctx.scene.leave()
      }
      audioUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${audioFile.file_path}`
    } else if (message && 'voice' in message) {
      const voiceFile = await ctx.telegram.getFile(message.voice.file_id)
      if (voiceFile?.file_size && voiceFile.file_size > MAX_FILE_SIZE) {
        await ctx.reply(
          isRu
            ? 'Ошибка: голосовое сообщение слишком большое. Максимальный размер: 50MB'
            : 'Error: voice message is too large. Maximum size: 50MB'
        )
        return ctx.scene.leave()
      }
      audioUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${voiceFile.file_path}`
    } else if (message && 'text' in message) {
      audioUrl = message.text
    }

    if (!audioUrl) {
      await ctx.reply(
        isRu ? 'Ошибка: аудио не предоставлено' : 'Error: audio not provided'
      )
      return ctx.scene.leave()
    }

    ctx.session.audioUrl = audioUrl

    if (!ctx.from?.id) {
      await ctx.reply(
        isRu
          ? 'Ошибка: ID пользователя не предоставлен'
          : 'Error: User ID not provided'
      )
      return ctx.scene.leave()
    }

    // НОВОЕ: ПРОВЕРКА БАЛАНСА
    const telegramId = ctx.from.id.toString()
    const currentBalance = await getUserBalance(telegramId)

    if (currentBalance === null) {
      await ctx.reply(
        isRu
          ? 'Ошибка получения баланса. Попробуйте позже.'
          : 'Error getting balance. Try again later.'
      )
      return ctx.scene.leave()
    }

    if (currentBalance < LIPSYNC_COST) {
      await ctx.reply(
        isRu
          ? `Недостаточно средств. Требуется: ${LIPSYNC_COST}⭐, у вас: ${currentBalance}⭐`
          : `Insufficient funds. Required: ${LIPSYNC_COST}⭐, you have: ${currentBalance}⭐`
      )
      return ctx.scene.leave()
    }

    // НОВОЕ: СПИСАНИЕ СРЕДСТВ
    const paymentSuccess = await updateUserBalance(
      telegramId,
      LIPSYNC_COST,
      PaymentType.MONEY_OUTCOME,
      'LipSync video generation',
      {
        bot_name: ctx.botInfo?.username || 'unknown_bot',
        service_type: 'lip_sync',
        model_name: 'kwaivgi/kling-lip-sync',
        language: isRu ? 'ru' : 'en',
      }
    )

    if (!paymentSuccess) {
      await ctx.reply(
        isRu
          ? 'Ошибка списания средств. Попробуйте позже.'
          : 'Error charging payment. Try again later.'
      )
      return ctx.scene.leave()
    }

    // Показываем информацию о списании
    const newBalance = currentBalance - LIPSYNC_COST
    await ctx.reply(
      isRu
        ? `💰 Списано ${LIPSYNC_COST}⭐. Новый баланс: ${newBalance}⭐`
        : `💰 Charged ${LIPSYNC_COST}⭐. New balance: ${newBalance}⭐`
    )

    if (!ctx.session.videoUrl || !ctx.session.audioUrl) {
      console.error('❌ Video URL или Audio URL не найден')
      // Возвращаем средства при ошибке
      await updateUserBalance(
        telegramId,
        LIPSYNC_COST,
        PaymentType.MONEY_INCOME,
        'LipSync refund - missing URLs',
        {
          bot_name: ctx.botInfo?.username || 'unknown_bot',
        }
      )
      return ctx.scene.leave()
    }

    try {
      await generateLipSync(
        ctx.session.videoUrl,
        ctx.session.audioUrl,
        telegramId,
        ctx.botInfo?.username || 'unknown_bot'
      )

      await ctx.reply(
        isRu
          ? `🎥 Видео отправлено на обработку. Ждите результата`
          : `🎥 Video sent for processing. Wait for the result`
      )
    } catch (error) {
      console.error('Error in generateLipSync:', error)

      // Возвращаем средства при ошибке
      await updateUserBalance(
        telegramId,
        LIPSYNC_COST,
        PaymentType.MONEY_INCOME,
        'LipSync refund - generation error',
        {
          bot_name: ctx.botInfo?.username || 'unknown_bot',
        }
      )

      await ctx.reply(
        isRu
          ? 'Произошла ошибка при обработке видео. Средства возвращены.'
          : 'An error occurred while processing the video. Funds refunded.'
      )
    }
    return ctx.scene.leave()
  }
)

export default lipSyncWizard
