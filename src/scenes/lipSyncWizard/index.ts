import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { generateLipSync } from '../../services/generateLipSync'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { BASE_COSTS } from '@/scenes/checkBalanceScene'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { createHelpCancelKeyboard } from '@/menu/createHelpCancelKeyboard/createHelpCancelKeyboard'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import {
  validateVideoInput,
  validateAudioInput,
  validateSession,
  validateTelegramFile,
  isValidAdmin,
  LIPSYNC_CONSTANTS,
  LipsyncSessionSchema,
  MediaInputSchema,
  LipsyncErrorSchema
} from '@/interfaces/zod/lipsync.zod'
import { z } from 'zod'

// НОВОЕ: Проверка админских прав для LipSync с Zod валидацией
const adminIds = process.env.ADMIN_IDS?.split(',') || []

function isUserAdmin(telegramId: string): boolean {
  return isValidAdmin(telegramId, adminIds)
}

const MAX_FILE_SIZE = LIPSYNC_CONSTANTS.MAX_FILE_SIZE

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
    
    try {
      // Валидация и проверка админских прав
      if (!telegramId || !isUserAdmin(telegramId)) {
        await ctx.reply(
          isRu 
            ? '🔒 Извините, функция LipSync временно доступна только администраторам.'
            : '🔒 Sorry, LipSync feature is temporarily available for administrators only.'
        )
        return ctx.scene.leave()
      }
      
      // Инициализируем сессию с валидацией
      const validatedSession = validateSession({
        step: 'video',
        startTime: Date.now()
      })
      ctx.session = {
        ...ctx.session,
        ...validatedSession
      }
      
      await ctx.reply(
        isRu ? 'Отправьте видео или URL видео' : 'Send a video or video URL',
        {
          reply_markup: {
            ...createHelpCancelKeyboard(isRu).reply_markup
          },
        }
      )

      // Проверяем отмену перед переходом к следующему шагу
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }

      return ctx.wizard.next()
    } catch (error) {
      console.error('❌ Ошибка инициализации LipSync:', error)
      await ctx.reply(
        isRu 
          ? '❌ Ошибка инициализации. Попробуйте позже.'
          : '❌ Initialization error. Try again later.'
      )
      return ctx.scene.leave()
    }
  },
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    let videoInput: any

    // Проверяем отмену сразу после получения сообщения
    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    try {
      if (message && 'video' in message) {
        // Валидация Telegram видео файла
        const validatedFile = validateTelegramFile({
          file_id: message.video.file_id,
          file_size: message.video.file_size,
        })
        
        if (validatedFile.file_size && validatedFile.file_size > MAX_FILE_SIZE) {
          await ctx.reply(
            isRu
              ? `❌ Видео слишком большое. Максимальный размер: ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB`
              : `❌ Video is too large. Maximum size: ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB`
          )
          return ctx.scene.leave()
        }
        
        const videoFile = await ctx.telegram.getFile(message.video.file_id)
        const videoUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${videoFile.file_path}`
        
        videoInput = {
          type: 'telegram_file',
          file: validatedFile,
          bot_token: ctx.telegram.token
        }
        
        ctx.session.videoUrl = videoUrl
        
      } else if (message && 'text' in message) {
        // Валидация URL
        videoInput = validateVideoInput({
          type: 'url',
          url: message.text
        })
        
        ctx.session.videoUrl = message.text
      }

      if (!videoInput || !ctx.session.videoUrl) {
        await ctx.reply(
          isRu ? '❌ Некорректное видео. Отправьте видео файл или URL.' : '❌ Invalid video. Send a video file or URL.'
        )
        return ctx.scene.leave()
      }
      
      // Обновляем сессию
      const validatedSession = validateSession({
        step: 'audio',
        videoUrl: ctx.session.videoUrl,
        startTime: ctx.session.startTime
      })
      ctx.session = {
        ...ctx.session,
        ...validatedSession
      }

      await ctx.reply(
        isRu
          ? '✅ Видео получено! Теперь отправьте аудио, голосовое сообщение или URL аудио'
          : '✅ Video received! Now send an audio, voice message, or audio URL',
        {
          reply_markup: {
            ...createHelpCancelKeyboard(isRu).reply_markup
          },
        }
      )

      // Проверяем отмену перед переходом к следующему шагу
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }

      return ctx.wizard.next()
      
    } catch (error) {
      console.error('❌ Ошибка валидации видео:', error)
      const errorMessage = error instanceof z.ZodError 
        ? error.errors.map(e => e.message).join(', ')
        : 'Неизвестная ошибка'
        
      await ctx.reply(
        isRu 
          ? `❌ Ошибка обработки видео: ${errorMessage}`
          : `❌ Video processing error: ${errorMessage}`
      )
      return ctx.scene.leave()
    }
  },
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    let audioInput: any

    // Проверяем отмену сразу после получения сообщения
    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    try {
      if (message && 'audio' in message) {
        if (!message.audio.file_id) {
          throw new Error('Audio file ID не найден')
        }
        
        const validatedFile = validateTelegramFile({
          file_id: message.audio.file_id,
          file_size: message.audio.file_size,
        })
        
        if (validatedFile.file_size && validatedFile.file_size > MAX_FILE_SIZE) {
          await ctx.reply(
            isRu
              ? `❌ Аудио слишком большое. Максимальный размер: ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB`
              : `❌ Audio is too large. Maximum size: ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB`
          )
          return ctx.scene.leave()
        }
        
        const audioFile = await ctx.telegram.getFile(message.audio.file_id)
        const audioUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${audioFile.file_path}`
        
        audioInput = {
          type: 'telegram_file',
          file: validatedFile,
          bot_token: ctx.telegram.token
        }
        
        ctx.session.audioUrl = audioUrl
        
      } else if (message && 'voice' in message) {
        const validatedFile = validateTelegramFile({
          file_id: message.voice.file_id,
          file_size: message.voice.file_size,
        })
        
        if (validatedFile.file_size && validatedFile.file_size > MAX_FILE_SIZE) {
          await ctx.reply(
            isRu
              ? `❌ Голосовое сообщение слишком большое. Максимальный размер: ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB`
              : `❌ Voice message is too large. Maximum size: ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB`
          )
          return ctx.scene.leave()
        }
        
        const voiceFile = await ctx.telegram.getFile(message.voice.file_id)
        const audioUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${voiceFile.file_path}`
        
        audioInput = {
          type: 'telegram_file',
          file: validatedFile,
          bot_token: ctx.telegram.token
        }
        
        ctx.session.audioUrl = audioUrl
        
      } else if (message && 'text' in message) {
        audioInput = validateAudioInput({
          type: 'url',
          url: message.text
        })
        
        ctx.session.audioUrl = message.text
      }

      if (!audioInput || !ctx.session.audioUrl) {
        await ctx.reply(
          isRu ? '❌ Некорректное аудио. Отправьте аудио файл, голосовое сообщение или URL.' : '❌ Invalid audio. Send an audio file, voice message, or URL.'
        )
        return ctx.scene.leave()
      }
      
      // Обновляем сессию
      const validatedSession = validateSession({
        step: 'processing',
        videoUrl: ctx.session.videoUrl,
        audioUrl: ctx.session.audioUrl,
        startTime: ctx.session.startTime
      })
      ctx.session = {
        ...ctx.session,
        ...validatedSession
      }
      
      ctx.session.audioUrl = ctx.session.audioUrl

      if (!ctx.from?.id) {
        throw new Error('User ID не предоставлен')
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
      console.error('❌ Error in generateLipSync:', error)

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

      const errorMessage = error instanceof z.ZodError 
        ? error.errors.map(e => e.message).join(', ')
        : error instanceof Error ? error.message : 'Неизвестная ошибка'

      await ctx.reply(
        isRu
          ? `❌ Произошла ошибка при обработке видео: ${errorMessage}. Средства возвращены.`
          : `❌ An error occurred while processing the video: ${errorMessage}. Funds refunded.`
      )
    }
    
    } catch (error) {
      console.error('❌ Ошибка валидации аудио:', error)
      const errorMessage = error instanceof z.ZodError 
        ? error.errors.map(e => e.message).join(', ')
        : 'Неизвестная ошибка'
        
      await ctx.reply(
        isRu 
          ? `❌ Ошибка обработки аудио: ${errorMessage}`
          : `❌ Audio processing error: ${errorMessage}`
      )
      return ctx.scene.leave()
    }
    
    return ctx.scene.leave()
  }
)

export default lipSyncWizard
