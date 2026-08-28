import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { Markup } from 'telegraf'
import { handleCancel, createGlobalCancelHandler } from '@/utils/cancelHandler'
import { createCancelOnlyKeyboard } from '@/utils/cancelKeyboard'
import {
  validateVideoInput,
  validateAudioInput,
  validateSession,
  validateTelegramFile,
  LIPSYNC_CONSTANTS,
} from '@/interfaces/zod/lipsync.zod'
import { z } from 'zod'
import { logger } from '@/utils/logger'
import { FalVeedFabricProvider } from '@/core/lipsync/providers/fal-veed-fabric-provider'
import {
  getLipSyncModelById,
  calculateLipSyncCostStars,
} from '@/config/lipsync-models.config'
import {
  convertAudioToMp3,
  needsAudioConversion,
} from '@/helpers/video-helpers'
import { refundAndTell } from '@/price/helpers/refundAndTell'

const MAX_FILE_SIZE = LIPSYNC_CONSTANTS.MAX_FILE_SIZE

// Fal.ai провайдер для LatentSync и Hummingbird
const falProvider = new FalVeedFabricProvider()

/**
 * Получает выбранную модель из сессии или использует default
 */
function getSelectedModel(ctx: MyContext): string {
  return ctx.session?.selectedLipSyncModel || 'latentsync'
}

/**
 * Рассчитывает стоимость для выбранной модели
 */
function calculateCostForModel(
  modelId: string,
  durationSeconds: number = 10
): number {
  return calculateLipSyncCostStars(modelId, durationSeconds)
}

export const lipSyncWizard = new Scenes.WizardScene<MyContext>(
  'lip_sync',
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    try {
      // Проверка наличия telegramId
      if (!telegramId) {
        await ctx.reply(
          isRu
            ? '❌ Ошибка идентификации пользователя.'
            : '❌ User identification error.'
        )
        return ctx.scene.leave()
      }

      // Инициализируем сессию с валидацией
      const validatedSession = validateSession({
        step: 'video',
        startTime: Date.now(),
      })
      ctx.session = {
        ...ctx.session,
        ...validatedSession,
      }

      await ctx.reply(
        isRu ? 'Отправьте видео или URL видео' : 'Send a video or video URL',
        {
          reply_markup: {
            inline_keyboard: [
              [
                Markup.button.callback(
                  isRu ? 'Отмена' : 'Cancel',
                  'lipsync_cancel'
                ),
              ],
            ],
          },
        }
      )
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

    // Проверяем нажатие кнопки "Отмена"
    if (
      ctx.callbackQuery &&
      'data' in ctx.callbackQuery &&
      ctx.callbackQuery.data === 'lipsync_cancel'
    ) {
      await ctx.answerCbQuery()
      await ctx.reply(isRu ? '❌ Процесс отменён.' : '❌ Process cancelled.')
      return ctx.scene.leave()
    }

    try {
      if (message && 'video' in message) {
        // Валидация Telegram видео файла
        const validatedFile = validateTelegramFile({
          file_id: message.video.file_id,
          file_size: message.video.file_size,
        })

        if (
          validatedFile.file_size &&
          validatedFile.file_size > MAX_FILE_SIZE
        ) {
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
          bot_token: ctx.telegram.token,
        }

        ctx.session.videoUrl = videoUrl
      } else if (message && 'text' in message) {
        // Валидация URL
        videoInput = validateVideoInput({
          type: 'url',
          url: message.text,
        })

        ctx.session.videoUrl = message.text
      }

      if (!videoInput || !ctx.session.videoUrl) {
        await ctx.reply(
          isRu
            ? '❌ Некорректное видео. Отправьте видео файл или URL.'
            : '❌ Invalid video. Send a video file or URL.'
        )
        return ctx.scene.leave()
      }

      // Обновляем сессию
      const validatedSession = validateSession({
        step: 'audio',
        videoUrl: ctx.session.videoUrl,
        startTime: ctx.session.startTime,
      })
      ctx.session = {
        ...ctx.session,
        ...validatedSession,
      }

      await ctx.reply(
        isRu
          ? 'Видео получено! Теперь отправьте аудио, голосовое сообщение или URL аудио'
          : 'Video received! Now send an audio, voice message, or audio URL',
        {
          reply_markup: {
            inline_keyboard: [
              [
                Markup.button.callback(
                  isRu ? 'Отмена' : 'Cancel',
                  'lipsync_cancel'
                ),
              ],
            ],
          },
        }
      )
      return ctx.wizard.next()
    } catch (error) {
      console.error('❌ Ошибка валидации видео:', error)
      const errorMessage =
        error instanceof z.ZodError
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

    try {
      if (message && 'audio' in message) {
        if (!message.audio.file_id) {
          throw new Error('Audio file ID не найден')
        }

        const validatedFile = validateTelegramFile({
          file_id: message.audio.file_id,
          file_size: message.audio.file_size,
        })

        if (
          validatedFile.file_size &&
          validatedFile.file_size > MAX_FILE_SIZE
        ) {
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
          bot_token: ctx.telegram.token,
        }

        ctx.session.audioUrl = audioUrl
      } else if (message && 'voice' in message) {
        const validatedFile = validateTelegramFile({
          file_id: message.voice.file_id,
          file_size: message.voice.file_size,
        })

        if (
          validatedFile.file_size &&
          validatedFile.file_size > MAX_FILE_SIZE
        ) {
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
          bot_token: ctx.telegram.token,
        }

        ctx.session.audioUrl = audioUrl
      } else if (message && 'text' in message) {
        audioInput = validateAudioInput({
          type: 'url',
          url: message.text,
        })

        ctx.session.audioUrl = message.text
      }

      if (!audioInput || !ctx.session.audioUrl) {
        await ctx.reply(
          isRu
            ? '❌ Некорректное аудио. Отправьте аудио файл, голосовое сообщение или URL.'
            : '❌ Invalid audio. Send an audio file, voice message, or URL.'
        )
        return ctx.scene.leave()
      }

      // Обновляем сессию
      const validatedSession = validateSession({
        step: 'processing',
        videoUrl: ctx.session.videoUrl,
        audioUrl: ctx.session.audioUrl,
        startTime: ctx.session.startTime,
      })
      ctx.session = {
        ...ctx.session,
        ...validatedSession,
      }

      if (!ctx.from?.id) {
        throw new Error('User ID не предоставлен')
      }

      // Получаем выбранную модель из сессии
      const telegramId = ctx.from.id.toString()
      const selectedModelId = getSelectedModel(ctx)
      const modelConfig = getLipSyncModelById(selectedModelId)

      logger.info('🎤 [LIP SYNC] Выбранная модель', {
        telegramId,
        selectedModelId,
        modelName: modelConfig?.name,
      })

      // Рассчитываем стоимость для выбранной модели (примерно 10 секунд видео)
      const estimatedDuration = 10 // секунд
      const lipSyncCost = calculateCostForModel(
        selectedModelId,
        estimatedDuration
      )

      const currentBalance = await getUserBalance(telegramId)

      if (currentBalance === null) {
        await ctx.reply(
          isRu
            ? 'Ошибка получения баланса. Попробуйте позже.'
            : 'Error getting balance. Try again later.'
        )
        return ctx.scene.leave()
      }

      if (currentBalance < lipSyncCost) {
        await ctx.reply(
          isRu
            ? `Недостаточно средств. Требуется: ~${Math.ceil(lipSyncCost)}⭐ (за ~${estimatedDuration} сек), у вас: ${Math.floor(currentBalance)}⭐`
            : `Insufficient funds. Required: ~${Math.ceil(lipSyncCost)}⭐ (for ~${estimatedDuration} sec), you have: ${Math.floor(currentBalance)}⭐`
        )
        return ctx.scene.leave()
      }

      // Списание средств
      const paymentSuccess = await updateUserBalance(
        telegramId,
        lipSyncCost,
        PaymentType.MONEY_OUTCOME,
        `LipSync: ${modelConfig?.name || selectedModelId}`,
        {
          bot_name: ctx.botInfo?.username || 'unknown_bot',
          service_type: 'lip_sync',
          model_name: selectedModelId,
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

      const newBalance = currentBalance - lipSyncCost
      await ctx.reply(
        isRu
          ? `✅ Списано ~${Math.ceil(lipSyncCost)}⭐ (${modelConfig?.name || selectedModelId}). Баланс: ${Math.floor(newBalance)}⭐`
          : `✅ Charged ~${Math.ceil(lipSyncCost)}⭐ (${modelConfig?.name || selectedModelId}). Balance: ${Math.floor(newBalance)}⭐`
      )

      if (!ctx.session.videoUrl || !ctx.session.audioUrl) {
        logger.error('❌ Video URL или Audio URL не найден', { telegramId })
        await updateUserBalance(
          telegramId,
          lipSyncCost,
          PaymentType.MONEY_INCOME,
          'LipSync refund - missing URLs',
          { bot_name: ctx.botInfo?.username || 'unknown_bot' }
        )
        return ctx.scene.leave()
      }

      try {
        // Определяем Fal.ai modelId по выбранному ID
        const falModelId =
          selectedModelId === 'latentsync'
            ? 'fal-ai/latentsync'
            : selectedModelId === 'hummingbird'
              ? 'fal-ai/tavus/hummingbird-lipsync/v0'
              : 'fal-ai/latentsync' // default

        // Конвертируем аудио из .oga в .mp3 если нужно (Telegram voice messages)
        let finalAudioUrl = ctx.session.audioUrl
        if (needsAudioConversion(ctx.session.audioUrl)) {
          await ctx.reply(
            isRu
              ? '🔄 Конвертирую аудио в MP3 формат...'
              : '🔄 Converting audio to MP3 format...'
          )

          try {
            finalAudioUrl = await convertAudioToMp3(
              ctx.session.audioUrl,
              telegramId
            )
            logger.info('✅ [LIP SYNC] Audio converted to MP3', {
              telegramId,
              originalUrl: ctx.session.audioUrl.substring(0, 50) + '...',
              convertedUrl: finalAudioUrl.substring(0, 50) + '...',
            })
          } catch (conversionError) {
            logger.error('❌ [LIP SYNC] Audio conversion failed', {
              error:
                conversionError instanceof Error
                  ? conversionError.message
                  : String(conversionError),
              telegramId,
            })
            throw new Error(
              isRu
                ? 'Не удалось конвертировать аудио. Попробуйте отправить MP3 или WAV файл.'
                : 'Failed to convert audio. Please try sending an MP3 or WAV file.'
            )
          }
        }

        logger.info('🚀 [LIP SYNC] Запуск генерации через Fal.ai', {
          telegramId,
          falModelId,
          videoUrl: ctx.session.videoUrl.substring(0, 50) + '...',
          audioUrl: finalAudioUrl.substring(0, 50) + '...',
        })

        // Используем Fal.ai провайдер для LatentSync/Hummingbird
        const result = await falProvider.generate({
          provider: 'fal',
          modelId: falModelId,
          telegramId,
          videoUrl: ctx.session.videoUrl,
          audioUrl: finalAudioUrl,
          durationSeconds: estimatedDuration,
        })

        // Проверяем результат
        if ('error' in result) {
          throw new Error(result.message || 'Ошибка генерации')
        }

        logger.info('✅ [LIP SYNC] Генерация успешна', {
          telegramId,
          resultId: result.id,
          outputUrl: result.output?.substring(0, 50) + '...',
        })

        // Отправляем видео пользователю
        if (result.output) {
          await ctx.replyWithVideo(result.output, {
            caption: isRu
              ? `✅ Lip Sync готов! (${modelConfig?.name || selectedModelId})`
              : `✅ Lip Sync ready! (${modelConfig?.name || selectedModelId})`,
          })
        } else {
          await ctx.reply(
            isRu
              ? '✅ Видео обрабатывается. Результат будет отправлен позже.'
              : '✅ Video is processing. Result will be sent later.'
          )
        }
      } catch (error) {
        logger.error('❌ Error in Fal.ai LipSync generation:', {
          error: error instanceof Error ? error.message : String(error),
          telegramId,
        })

        const errorMessage =
          error instanceof z.ZodError
            ? error.errors.map(e => e.message).join(', ')
            : error instanceof Error
              ? error.message
              : 'Неизвестная ошибка'

        // Возвращаем средства при ошибке — и говорим правду о том, вернулись ли
        // они: начисление может не пройти.
        await refundAndTell({
          ctx,
          telegramId,
          amount: lipSyncCost,
          description: 'LipSync refund - generation error',
          reason: {
            ru: `Ошибка при обработке: ${errorMessage}`,
            en: `Processing error: ${errorMessage}`,
          },
          isRu,
        })
      }
    } catch (error) {
      console.error('❌ Ошибка валидации аудио:', error)
      const errorMessage =
        error instanceof z.ZodError
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

// Глобальный обработчик отмены для всех команд отмены
lipSyncWizard.action(/^cancel_/, async ctx => {
  await handleCancel(ctx, {
    messageRu: '❌ Процесс отменён.',
    messageEn: '❌ Process cancelled.',
  })
})

export default lipSyncWizard
