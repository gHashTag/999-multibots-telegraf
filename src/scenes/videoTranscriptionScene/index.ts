import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { videoTranscription } from '@/services/videoTranscription'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'

export const videoTranscriptionScene = new Scenes.WizardScene<MyContext>(
  'video_transcription',
  async ctx => {
    const isRu = isRussianFromState(ctx)

    console.log('[VideoTranscriptionScene] Starting video transcription wizard')

    // Проверяем подписку
    const hasSubscription = await checkSubscriptionGuard(ctx, 'NeuroPhoto')
    if (!hasSubscription) {
      // checkSubscriptionGuard уже отправил сообщение, просто возвращаемся
      return ctx.scene.leave()
    }

    await ctx.reply(
      isRu
        ? '📺 <b>Транскрибация Reels</b>\n\n' +
            'Отправьте видео для транскрибации и я извлеку из него текст.\n\n' +
            'Поддерживаемые форматы: MP4, MOV, AVI, MKV\n' +
            'Максимальный размер: 100 МБ'
        : '📺 <b>Reels Transcription</b>\n\n' +
            'Send a video for transcription and I will extract text from it.\n\n' +
            'Supported formats: MP4, MOV, AVI, MKV\n' +
            'Maximum size: 100 MB',
      {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [
            [
              isRu ? '❌ Отмена' : '❌ Cancel',
            ],
          ],
          resize_keyboard: true,
        },
      }
    )

    ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussianFromState(ctx)

    // Проверяем отмену
    const message = ctx.message
    if (message && 'text' in message) {
      const text = message.text
      if (text === (isRu ? '❌ Отмена' : '❌ Cancel')) {
        await ctx.reply(
          isRu ? 'Отменяю операцию...' : 'Cancelling...',
          Markup.removeKeyboard()
        )
        return ctx.scene.leave()
      }
    }

    // Проверяем видео
    if (message && 'video' in message) {
      const video = message.video
      const telegram_id = ctx.from?.id?.toString() || 'unknown'

      // Проверяем размер файла (макс 100 МБ)
      if (video.file_size && video.file_size > 100 * 1024 * 1024) {
        await ctx.reply(
          isRu
            ? '❌ Размер файла превышает 100 МБ'
            : '❌ File size exceeds 100 MB',
          Markup.removeKeyboard()
        )
        return ctx.scene.leave()
      }

      console.log('[VideoTranscriptionScene] Processing video:', {
        file_id: video.file_id,
        file_unique_id: video.file_unique_id,
        duration: video.duration,
        mime_type: video.mime_type,
        file_size: video.file_size,
      })

      await ctx.reply(
        isRu
          ? '⏳ Начинаю транскрибацию видео... Это может занять несколько минут.'
          : '⏳ Starting video transcription... This may take a few minutes.',
        Markup.removeKeyboard()
      )

      try {
        const result = await videoTranscription(video.file_id, telegram_id)

        if (result.success && result.transcription) {
          await ctx.reply(
            isRu
              ? '✅ <b>Транскрибация завершена!</b>\n\n📝 Текст:\n\n'
              : '✅ <b>Transcription completed!</b>\n\n📝 Text:\n\n',
            { parse_mode: 'HTML' }
          )

          // Отправляем результат
          await ctx.reply(result.transcription)

          // Добавляем кнопки действий
          await ctx.reply(
            isRu ? 'Что дальше?' : 'What next?',
            {
              reply_markup: {
                keyboard: [
                  [
                    isRu ? '📺 Транскрибировать еще' : '📺 Transcribe another',
                  ],
                  [
                    isRu ? '🏠 Главное меню' : '🏠 Main menu',
                  ],
                ],
                resize_keyboard: true,
              },
            }
          )
        } else {
          await ctx.reply(
            isRu
              ? `❌ Ошибка транскрибации: ${result.error}`
              : `❌ Transcription error: ${result.error}`,
            Markup.removeKeyboard()
          )
        }
      } catch (error) {
        console.error('[VideoTranscriptionScene] Error:', error)
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при транскрибации видео'
            : '❌ An error occurred during video transcription',
          Markup.removeKeyboard()
        )
      }

      return ctx.wizard.next()
    } else {
      await ctx.reply(
        isRu
          ? '📹 Пожалуйста, отправьте видео для транскрибации'
          : '📹 Please send a video for transcription'
      )
    }
  },
  async ctx => {
    const isRu = isRussianFromState(ctx)

    if (ctx.message && 'text' in ctx.message) {
      const text = ctx.message.text

      if (text === (isRu ? '📺 Транскрибировать еще' : '📺 Transcribe another')) {
        // Начинаем заново
        await ctx.reply(
          isRu
            ? '📺 <b>Транскрибация Reels</b>\n\n' +
                'Отправьте видео для транскрибации и я извлеку из него текст.\n\n' +
                'Поддерживаемые форматы: MP4, MOV, AVI, MKV\n' +
                'Максимальный размер: 100 МБ'
            : '📺 <b>Reels Transcription</b>\n\n' +
                'Send a video for transcription and I will extract text from it.\n\n' +
                'Supported formats: MP4, MOV, AVI, MKV\n' +
                'Maximum size: 100 MB',
          {
            parse_mode: 'HTML',
            reply_markup: {
              keyboard: [
                [
                  isRu ? '❌ Отмена' : '❌ Cancel',
                ],
              ],
              resize_keyboard: true,
            },
          }
        )

        ctx.wizard.selectStep(1)
      } else if (text === (isRu ? '🏠 Главное меню' : '🏠 Main menu')) {
        await ctx.reply(
          isRu ? 'Возвращаемся в главное меню...' : 'Returning to main menu...',
          Markup.removeKeyboard()
        )
        return ctx.scene.leave()
      } else {
        await ctx.reply(
          isRu ? 'Неверная команда' : 'Invalid command'
        )
      }
    }
  }
)
