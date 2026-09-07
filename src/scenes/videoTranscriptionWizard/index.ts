import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { isRussian } from '@/helpers/language'
import {
  handleHelpCancel,
  createHelpCancelKeyboard,
  sendGenericErrorMessage,
  getMainMenuText,
} from '@/navigation'
import { logger } from '@/utils/logger'
import {
  transcribeInstagramReel,
  transcribeVideoFromDirectUrl,
} from '@/services/videoTranscription'
import path from 'path'
import fs from 'fs'
import { updateUserBalance, getUserBalance } from '@/core/supabase'
import { PaymentType } from '@/interfaces/payments.interface'
import { standardButtons } from '@/navigation/helpers/actionButtons'

export const videoTranscriptionWizard = new Scenes.WizardScene<MyContext>(
  'video_transcription',
  async ctx => {
    const isRu = isRussian(ctx)

    // Устанавливаем режим для правильной работы справки
    ctx.session.mode = ModeEnum.VideoTranscription

    await ctx.reply(
      isRu
        ? '📺 Отправьте видео для транскрибации в текст\n\n💡 Способы загрузки:\n• 📎 Загрузить видеофайл (до 50MB) - РЕКОМЕНДУЕТСЯ!\n• 🔗 Отправить ссылку на Instagram Reel\n\n⚠️ Для ссылок поддерживаются только Instagram Reels. Для других платформ загружайте файл.'
        : '📺 Send a video for transcription to text\n\n💡 Upload methods:\n• 📎 Upload a video file (up to 50MB) - RECOMMENDED!\n• 🔗 Send Instagram Reel link\n\n⚠️ Only Instagram Reels are supported for links. For other platforms, upload the file.',
      createHelpCancelKeyboard(isRu)
    )
    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    // Проверяем команды отмены/помощи
    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    // Проверяем, что это видео или ссылка
    const isVideoFile = message && 'video' in message
    const isTextWithUrl =
      message &&
      'text' in message &&
      message.text &&
      message.text.includes('instagram.com')

    if (!isVideoFile && !isTextWithUrl) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте видеофайл или ссылку на Instagram Reel'
          : '❌ Please send a video file or Instagram Reel link'
      )
      return // Остаемся на том же шаге
    }

    let videoUrl: string
    let isFromUrl = false

    if (isVideoFile) {
      // Обработка загруженного видеофайла
      const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
      // getFile throws a Telegram 400 for files above the Bot API download limit
      // (~20MB on api.telegram.org). Unguarded, that throw aborts this step and
      // silently drops the user's uploaded video (this runs before any charge).
      // Catch it and tell the user how to proceed instead of losing the upload.
      let videoFile
      try {
        videoFile = await ctx.telegram.getFile(message.video.file_id)
      } catch (getFileErr) {
        logger.error(
          '[VideoTranscription] getFile failed (file too large or unavailable)',
          {
            error:
              getFileErr instanceof Error
                ? getFileErr.message
                : String(getFileErr),
          }
        )
        await ctx.reply(
          isRu
            ? '❌ Не удалось загрузить видео (возможно, оно больше 20 МБ). Пришлите файл поменьше или ссылку на Instagram Reel.'
            : '❌ Could not download the video (it may exceed 20 MB). Send a smaller file or an Instagram Reel link.'
        )
        return ctx.scene.leave()
      }

      if (videoFile?.file_size && videoFile.file_size > MAX_FILE_SIZE) {
        await ctx.reply(
          isRu
            ? '❌ Видео слишком большое. Максимальный размер: 50MB'
            : '❌ Video is too large. Maximum size: 50MB'
        )
        return ctx.scene.leave()
      }

      videoUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${videoFile.file_path}`
    } else if (isTextWithUrl) {
      // Обработка ссылки на видео
      videoUrl = message.text.trim()
      isFromUrl = true
    } else {
      // Это не должно произойти из-за проверки выше
      throw new Error('Invalid input type')
    }

    if (!ctx.from?.id || !ctx.botInfo?.username) {
      logger.error('[VideoTranscription] Critical user or bot info missing', {
        from: ctx.from,
        botInfo: ctx.botInfo,
      })
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    // ✅ ИСПРАВЛЕНО: Проверяем и списываем баланс ДО транскрипции
    const costInStars = 3 // Стоимость транскрипции
    const currentBalance = await getUserBalance(ctx.from.id.toString())

    if (currentBalance < costInStars) {
      // A refusal that names the price hands over the way to pay it. The
      // person asked for something paid and was told the only obstacle is
      // money -- the highest-intent moment there is, and it carried nothing
      // to press.
      await ctx.reply(
        isRu
          ? `❌ Недостаточно средств для транскрибации.\n\n💰 Нужно: ${costInStars} ⭐\n💳 Ваш баланс: ${currentBalance.toFixed(2)} ⭐\n\nПополните баланс и попробуйте снова.`
          : `❌ Insufficient funds for transcription.\n\n💰 Required: ${costInStars} ⭐\n💳 Your balance: ${currentBalance.toFixed(2)} ⭐\n\nTop up your balance and try again.`,
        standardButtons(isRu)
      )
      return ctx.scene.leave()
    }

    // Списываем баланс ДО выполнения услуги
    // In-flight guard: the charge + transcription below are awaited before
    // scene.leave(), so a second message during the ~transcription would
    // re-enter this step and double-charge. Reject-before-set (sync); released
    // in the .leave() handler below. #1360
    if (ctx.session.videoTranscriptionInProgress) {
      await ctx.reply(
        isRu
          ? '⏳ Уже обрабатываю, подождите...'
          : '⏳ Already processing, please wait...'
      )
      return
    }
    ctx.session.videoTranscriptionInProgress = true
    const paymentSuccess = await updateUserBalance(
      ctx.from.id.toString(),
      costInStars,
      PaymentType.MONEY_OUTCOME,
      'Транскрибация видео',
      {
        service_type: 'VIDEO_TRANSCRIPTION',
        isFromUrl,
        videoUrl: isFromUrl ? videoUrl : undefined,
      }
    )

    if (!paymentSuccess) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка при списании средств. Попробуйте позже.'
          : '❌ Payment processing error. Please try again later.'
      )
      return ctx.scene.leave()
    }

    const newBalance = await getUserBalance(ctx.from.id.toString())

    try {
      // Показываем статус обработки
      await ctx.reply(
        isRu
          ? '⏳ Обрабатываю видео и извлекаю текст... Это может занять некоторое время.'
          : '⏳ Processing video and extracting text... This may take some time.',
        Markup.removeKeyboard()
      )

      logger.info('[VideoTranscription] Starting transcription', {
        telegramId: ctx.from.id,
        isFromUrl,
        videoUrl: isFromUrl ? videoUrl : 'telegram_file',
        videoFileId: isVideoFile ? message.video.file_id : undefined,
        videoSize: isVideoFile
          ? (await ctx.telegram.getFile(message.video.file_id)).file_size
          : undefined,
      })

      const transcriptionResult = isFromUrl
        ? await transcribeInstagramReel(videoUrl)
        : await transcribeVideoFromDirectUrl(videoUrl)

      if (!transcriptionResult.success || !transcriptionResult.text) {
        logger.error('[VideoTranscription] Transcription failed', {
          telegramId: ctx.from.id,
          success: transcriptionResult.success,
          hasText: !!transcriptionResult.text,
          error: transcriptionResult.error,
        })
        throw new Error(
          transcriptionResult.error || 'Failed to transcribe video'
        )
      }

      logger.info(
        '[VideoTranscription] Transcription successful, preparing to send results',
        {
          telegramId: ctx.from.id,
          textLength: transcriptionResult.text.length,
          hasVideoPath: !!transcriptionResult.videoPath,
          isFromUrl,
        }
      )

      // ✅ Оплата уже списана ДО транскрипции - показываем результат
      await ctx.reply(
        isRu
          ? `💰 Списано: ${costInStars} ⭐\nВаш баланс: ${newBalance.toFixed(2)} ⭐`
          : `💰 Charged: ${costInStars} ⭐\nYour balance: ${newBalance.toFixed(2)} ⭐`
      )

      // Отправляем результат
      const caption = isRu
        ? `📺 Транскрибация завершена!\n\n📝 Текст из видео:\n\n${transcriptionResult.text}`
        : `📺 Transcription completed!\n\n📝 Text from video:\n\n${transcriptionResult.text}`

      if (isFromUrl) {
        logger.info('[VideoTranscription] Processing URL result', {
          telegramId: ctx.from.id,
          hasVideoPath: !!transcriptionResult.videoPath,
          videoExists: transcriptionResult.videoPath
            ? fs.existsSync(transcriptionResult.videoPath)
            : false,
        })

        // Для URL отправляем скачанное видео с кратким описанием и рекламой бота
        const shortCaption = isRu
          ? `📺 Транскрибация завершена!\n\n🔗 Оригинал: ${videoUrl}\n\n🤖 Сделано в боте @${ctx.botInfo.username}\n✨ Попробуйте и вы — быстро и точно!`
          : `📺 Transcription completed!\n\n🔗 Original: ${videoUrl}\n\n🤖 Made by @${ctx.botInfo.username}\n✨ Try it yourself - fast and accurate!`

        // Отправляем скачанное видео (если путь есть в результате)
        if (
          transcriptionResult.videoPath &&
          fs.existsSync(transcriptionResult.videoPath)
        ) {
          try {
            // Проверяем размер файла перед отправкой
            const stats = fs.statSync(transcriptionResult.videoPath)
            const fileSizeMB = stats.size / (1024 * 1024)

            logger.info('[VideoTranscription] Sending video file', {
              telegramId: ctx.from.id,
              videoPath: transcriptionResult.videoPath,
              fileSizeMB: fileSizeMB.toFixed(2),
            })

            // Telegram лимит для видео - 50MB, но лучше использовать 45MB для безопасности
            if (fileSizeMB > 45) {
              throw new Error(
                `File too large: ${fileSizeMB.toFixed(2)}MB (max 45MB)`
              )
            }

            await ctx.replyWithVideo(
              { source: transcriptionResult.videoPath },
              {
                caption:
                  shortCaption.length > 1024
                    ? shortCaption.substring(0, 1021) + '...'
                    : shortCaption,
                supports_streaming: true, // Поддержка стриминга для лучшего качества
                parse_mode: 'HTML',
              }
            )

            logger.info('[VideoTranscription] Video sent successfully', {
              telegramId: ctx.from.id,
            })

            // Очищаем файл после отправки
            try {
              fs.unlinkSync(transcriptionResult.videoPath)
            } catch (cleanupError) {
              logger.warn('Failed to cleanup video file', {
                error: cleanupError,
              })
            }
          } catch (videoError) {
            logger.error('[VideoTranscription] Error sending video', {
              telegramId: ctx.from.id,
              error: videoError.message,
              stack: videoError.stack,
            })

            // Отправляем сообщение об ошибке с видео
            const videoErrorMsg = isRu
              ? `⚠️ Не удалось отправить видео (${videoError.message}). Отправляем только текст.`
              : `⚠️ Failed to send video (${videoError.message}). Sending text only.`

            await ctx.reply(videoErrorMsg)

            // Все равно очищаем файл
            try {
              fs.unlinkSync(transcriptionResult.videoPath)
            } catch (cleanupError) {
              logger.warn('Failed to cleanup video file', {
                error: cleanupError,
              })
            }
          }
        } else {
          logger.info('[VideoTranscription] No video file, sending text only', {
            telegramId: ctx.from.id,
          })
          // Если видео файла нет, отправляем просто описание
          await ctx.reply(shortCaption)
        }

        // Отправляем красиво отформатированный текст для копирования
        try {
          logger.info('[VideoTranscription] Sending transcribed text', {
            telegramId: ctx.from.id,
            textLength: transcriptionResult.text.length,
          })

          // Обрезаем текст если он слишком длинный для Markdown
          const maxTextLength = 3500
          const displayText =
            transcriptionResult.text.length > maxTextLength
              ? transcriptionResult.text.substring(0, maxTextLength) + '...'
              : transcriptionResult.text

          await ctx.reply(
            isRu
              ? `📝 <b>Текст для копирования:</b>\n\n<code>${displayText}</code>`
              : `📝 <b>Text for copying:</b>\n\n<code>${displayText}</code>`,
            { parse_mode: 'HTML' }
          )

          logger.info('[VideoTranscription] Text sent successfully', {
            telegramId: ctx.from.id,
          })
        } catch (textError) {
          logger.error('[VideoTranscription] Error sending text', {
            telegramId: ctx.from.id,
            error: textError.message,
          })

          // Fallback: отправляем простой текст без форматирования
          await ctx.reply(
            isRu
              ? `📝 Текст из видео:\n\n${transcriptionResult.text}`
              : `📝 Text from video:\n\n${transcriptionResult.text}`
          )
        }
      } else {
        // Для загруженного файла отправляем оригинальное видео с рекламой бота
        const shortCaption = isRu
          ? `📺 Транскрибация завершена!\n\n🤖 Сделано в боте @${ctx.botInfo.username}\n✨ Попробуйте и вы — быстро и точно!`
          : `📺 Transcription completed!\n\n🤖 Made by @${ctx.botInfo.username}\n✨ Try it yourself - fast and accurate!`

        await ctx.replyWithVideo(videoUrl, {
          caption: shortCaption,
          supports_streaming: true, // Поддержка стриминга для лучшего качества
        })

        // Отправляем красиво отформатированный текст для копирования
        const maxTextLength = 3500
        const displayText =
          transcriptionResult.text.length > maxTextLength
            ? transcriptionResult.text.substring(0, maxTextLength) + '...'
            : transcriptionResult.text

        await ctx.reply(
          isRu
            ? `📝 <b>Текст для копирования:</b>\n\n<code>${displayText}</code>`
            : `📝 <b>Text for copying:</b>\n\n<code>${displayText}</code>`,
          { parse_mode: 'HTML' }
        )
      }

      // Показываем кнопки для продолжения
      try {
        logger.info('[VideoTranscription] Sending completion message', {
          telegramId: ctx.from.id,
        })

        const keyboard = Markup.keyboard([
          [Markup.button.text(isRu ? '📺 Еще одно видео' : '📺 Another video')],
          [Markup.button.text(getMainMenuText(isRu))], // Главное меню
        ]).resize()

        await ctx.reply(
          isRu
            ? '✅ Готово! Хотите транскрибировать еще одно видео?'
            : '✅ Done! Would you like to transcribe another video?',
          keyboard
        )

        logger.info(
          '[VideoTranscription] Transcription completed successfully',
          {
            telegramId: ctx.from.id,
            textLength: transcriptionResult.text.length,
          }
        )
      } catch (finalError) {
        logger.error('[VideoTranscription] Error sending final message', {
          telegramId: ctx.from.id,
          error: finalError.message,
        })

        // Минимальное финальное сообщение
        await ctx.reply(
          isRu ? '✅ Транскрибация завершена!' : '✅ Transcription completed!'
        )
      }
    } catch (error) {
      logger.error('[VideoTranscription] Error during transcription', {
        telegramId: ctx.from.id,
        error: error.message,
        stack: error.stack,
      })

      // ✅ РЕФАНД: Возвращаем деньги при ошибке транскрипции
      try {
        const refundSuccess = await updateUserBalance(
          ctx.from.id.toString(),
          costInStars,
          PaymentType.MONEY_INCOME, // Возврат как пополнение
          'Возврат за неудачную транскрибацию',
          {
            service_type: 'VIDEO_TRANSCRIPTION_REFUND',
            reason: error.message,
          }
        )

        if (refundSuccess) {
          logger.info('✅ [VideoTranscription] Refund processed successfully', {
            telegramId: ctx.from.id,
            refundAmount: costInStars,
          })

          await ctx.reply(
            isRu
              ? `💫 Средства возвращены: ${costInStars} ⭐`
              : `💫 Refunded: ${costInStars} ⭐`
          )
        } else {
          // Reached without an exception: updateUserBalance returns false on a
          // ghost-payer or a database error. Announcing only the successful
          // refund and staying silent on the failed one leaves the user
          // believing the money came back.
          logger.error('❌ [VideoTranscription] Refund returned false', {
            telegramId: ctx.from.id,
            refundAmount: costInStars,
          })
          await ctx.reply(
            isRu
              ? `💫 Вернуть ${costInStars} ⭐ автоматически не удалось — напишите в поддержку.`
              : `💫 Could not return ${costInStars} ⭐ automatically — please contact support.`
          )
        }
      } catch (refundError) {
        logger.error('❌ [VideoTranscription] CRITICAL: Refund failed!', {
          telegramId: ctx.from.id,
          refundAmount: costInStars,
          error:
            refundError instanceof Error
              ? refundError.message
              : String(refundError),
        })
      }

      // Определяем тип ошибки для более информативного сообщения
      let errorMessage = ''

      if (error.message.includes('Instagram may require login')) {
        errorMessage = isRu
          ? '❌ Не удалось скачать видео из Instagram. Возможно, видео приватное или требует авторизации. Попробуйте другое видео или загрузите файл напрямую.'
          : '❌ Failed to download Instagram video. The video might be private or require authentication. Try another video or upload the file directly.'
      } else if (
        error.message.includes('rate-limit reached') ||
        error.message.includes('exceeded your hard limit') ||
        error.message.includes('rent a paid Actor')
      ) {
        errorMessage = isRu
          ? '❌ Сервис скачивания Instagram временно недоступен.\n\n💡 Попробуйте:\n• Скачать видео самостоятельно и загрузить файлом\n• Использовать другие платформы (TikTok, YouTube)\n• Повторить позже'
          : '❌ Instagram download service is temporarily unavailable.\n\n💡 Try:\n• Download the video yourself and upload as file\n• Use other platforms (TikTok, YouTube)\n• Try again later'
      } else if (error.message.includes('File too large')) {
        errorMessage = isRu
          ? '❌ Видео слишком большое для обработки (максимум 25MB). Попробуйте более короткое видео.'
          : '❌ Video is too large for processing (25MB max). Please try a shorter video.'
      } else if (error.message.includes('OPENAI_API_KEY')) {
        errorMessage = isRu
          ? '❌ Сервис транскрибации временно недоступен. Попробуйте позже.'
          : '❌ Transcription service is temporarily unavailable. Please try again later.'
      } else {
        errorMessage = isRu
          ? '❌ Произошла ошибка при обработке видео. Убедитесь, что ссылка корректная и видео доступно.'
          : '❌ An error occurred while processing the video. Make sure the link is correct and the video is accessible.'
      }

      await ctx.reply(errorMessage)
    }

    return ctx.scene.leave()
  }
)

// Release the in-flight guard on ANY scene exit (all paid-step paths call
// scene.leave). Reject-before-set is in step 1; this is the release. #1360
videoTranscriptionWizard.leave(async ctx => {
  if (ctx.session) {
    ctx.session.videoTranscriptionInProgress = false
  }
})

// Обработчик для кнопки "Еще одно видео"
videoTranscriptionWizard.hears(
  ['📺 Еще одно видео', '📺 Another video'],
  async ctx => {
    // Перезапускаем сцену с первого шага
    return ctx.scene.reenter()
  }
)

// Добавляем обработчики HELP и CANCEL как в других wizard'ах
videoTranscriptionWizard.help(ctx => handleHelpCancel(ctx))
videoTranscriptionWizard.command('cancel', ctx => handleHelpCancel(ctx))
