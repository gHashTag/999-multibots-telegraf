import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { isRussian } from '@/helpers/language'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { createHelpCancelKeyboard } from '@/menu'
import { sendGenericErrorMessage } from '@/menu'
import { logger } from '@/utils/logger'
import {
  transcribeVideo,
  transcribeVideoFromUrl,
  cleanupVideoFile,
} from '@/services/videoTranscription'
import { levels } from '@/menu/mainMenu'
import path from 'path'
import fs from 'fs'

export const videoTranscriptionWizard = new Scenes.WizardScene<MyContext>(
  'video_transcription',
  async ctx => {
    const isRu = isRussian(ctx)

    // Устанавливаем режим для правильной работы справки
    ctx.session.mode = ModeEnum.VideoTranscription

    await ctx.reply(
      isRu
        ? '📺 Отправьте видео (Reels) для транскрибации в текст\n\n💡 Вы можете:\n• Загрузить видеофайл\n• Отправить ссылку на Instagram Reel, TikTok, YouTube Shorts'
        : '📺 Send a video (Reels) for transcription to text\n\n💡 You can:\n• Upload a video file\n• Send a link to Instagram Reel, TikTok, YouTube Shorts',
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
      (message.text.includes('instagram.com') ||
        message.text.includes('tiktok.com') ||
        message.text.includes('youtube.com') ||
        message.text.includes('youtu.be'))

    if (!isVideoFile && !isTextWithUrl) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте видеофайл или ссылку на видео (Instagram, TikTok, YouTube)'
          : '❌ Please send a video file or video link (Instagram, TikTok, YouTube)'
      )
      return // Остаемся на том же шаге
    }

    let videoUrl: string
    let isFromUrl = false

    if (isVideoFile) {
      // Обработка загруженного видеофайла
      const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
      const videoFile = await ctx.telegram.getFile(message.video.file_id)

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
        ? await transcribeVideoFromUrl({
            videoUrl,
            telegramId: ctx.from.id.toString(),
            username: ctx.from.username || 'unknown_user',
            isRu,
            botName: ctx.botInfo.username,
          })
        : await transcribeVideo({
            videoUrl,
            telegramId: ctx.from.id.toString(),
            username: ctx.from.username || 'unknown_user',
            isRu,
            botName: ctx.botInfo.username,
          })

      if (!transcriptionResult.success || !transcriptionResult.text) {
        throw new Error(
          transcriptionResult.error || 'Failed to transcribe video'
        )
      }

      // Отправляем результат
      const caption = isRu
        ? `📺 Транскрибация завершена!\n\n📝 Текст из видео:\n\n${transcriptionResult.text}`
        : `📺 Transcription completed!\n\n📝 Text from video:\n\n${transcriptionResult.text}`

      if (isFromUrl) {
        // Для URL отправляем скачанное видео с кратким описанием
        const shortCaption = isRu
          ? `📺 Транскрибация завершена!\n\n🔗 Оригинал: ${videoUrl}`
          : `📺 Transcription completed!\n\n🔗 Original: ${videoUrl}`

        // Отправляем скачанное видео (если путь есть в результате)
        if (
          transcriptionResult.videoPath &&
          fs.existsSync(transcriptionResult.videoPath)
        ) {
          try {
            await ctx.replyWithVideo(
              { source: transcriptionResult.videoPath },
              {
                caption:
                  shortCaption.length > 1024
                    ? shortCaption.substring(0, 1021) + '...'
                    : shortCaption,
              }
            )

            // Очищаем файл после отправки
            cleanupVideoFile(transcriptionResult.videoPath)
          } catch (videoError) {
            logger.error('[VideoTranscription] Error sending video', {
              telegramId: ctx.from.id,
              error: videoError.message,
            })
            // Если не удалось отправить видео, отправляем просто текст
            await ctx.reply(shortCaption)
            // Все равно очищаем файл
            cleanupVideoFile(transcriptionResult.videoPath)
          }
        } else {
          // Если видео файла нет, отправляем просто описание
          await ctx.reply(shortCaption)
        }

        // Отправляем красиво отформатированный текст для копирования
        await ctx.reply(
          isRu
            ? `📝 *Текст для копирования:*\n\n\`\`\`\n${transcriptionResult.text}\n\`\`\``
            : `📝 *Text for copying:*\n\n\`\`\`\n${transcriptionResult.text}\n\`\`\``,
          { parse_mode: 'Markdown' }
        )
      } else {
        // Для загруженного файла отправляем оригинальное видео с кратким описанием
        const shortCaption = isRu
          ? `📺 Транскрибация завершена!`
          : `📺 Transcription completed!`

        await ctx.replyWithVideo(videoUrl, {
          caption: shortCaption,
        })

        // Отправляем красиво отформатированный текст для копирования
        await ctx.reply(
          isRu
            ? `📝 *Текст для копирования:*\n\n\`\`\`\n${transcriptionResult.text}\n\`\`\``
            : `📝 *Text for copying:*\n\n\`\`\`\n${transcriptionResult.text}\n\`\`\``,
          { parse_mode: 'Markdown' }
        )
      }

      // Показываем кнопки для продолжения
      const keyboard = Markup.keyboard([
        [Markup.button.text(isRu ? '📺 Еще одно видео' : '📺 Another video')],
        [
          Markup.button.text(
            isRu ? levels[104].title_ru : levels[104].title_en
          ),
        ], // Главное меню
      ]).resize()

      await ctx.reply(
        isRu
          ? '✅ Готово! Хотите транскрибировать еще одно видео?'
          : '✅ Done! Would you like to transcribe another video?',
        keyboard
      )

      logger.info('[VideoTranscription] Transcription completed successfully', {
        telegramId: ctx.from.id,
        textLength: transcriptionResult.text.length,
      })
    } catch (error) {
      logger.error('[VideoTranscription] Error during transcription', {
        telegramId: ctx.from.id,
        error: error.message,
        stack: error.stack,
      })

      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при транскрибации видео. Пожалуйста, попробуйте позже.'
          : '❌ An error occurred while transcribing the video. Please try again later.'
      )
    }

    return ctx.scene.leave()
  }
)

// Обработчик для кнопки "Еще одно видео"
videoTranscriptionWizard.hears(
  ['📺 Еще одно видео', '📺 Another video'],
  async ctx => {
    // Перезапускаем сцену с первого шага
    return ctx.scene.reenter()
  }
)

// Добавляем обработчики HELP и CANCEL как в других wizard'ах
videoTranscriptionWizard.help(handleHelpCancel)
videoTranscriptionWizard.command('cancel', handleHelpCancel)
