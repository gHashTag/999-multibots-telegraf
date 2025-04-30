import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { uploadVideoToServer } from '../../services/uploadVideoToServer'
import { randomUUID } from 'node:crypto'
import { Markup } from 'telegraf'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB, пример ограничения

export const uploadVideoScene = new Scenes.WizardScene<MyContext>(
  'video_in_url',
  async ctx => {
    console.log('CASE 1: uploadVideoScene')
    const isRu = ctx.from?.language_code === 'ru'
    await ctx.reply(
      isRu
        ? '📹 Пожалуйста, отправьте видеофайл'
        : '📹 Please send the video file',
      Markup.removeKeyboard()
    )
    ctx.wizard.next()
    return
  },
  async ctx => {
    console.log('CASE 2: uploadVideoScene')
    const isRu = ctx.from?.language_code === 'ru'
    const message = ctx.message

    if (message && 'video' in message) {
      if (message.video.file_size > MAX_FILE_SIZE) {
        await ctx.reply(
          isRu
            ? '⚠️ Ошибка: видео слишком большое. Максимальный размер: 50MB'
            : '⚠️ Error: video is too large. Maximum size: 50MB'
        )
        return ctx.scene.leave()
      }

      const videoFile = await ctx.telegram.getFile(message.video.file_id)
      const videoUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${videoFile.file_path}`
      console.log('CASE: videoUrl', videoUrl)
      ctx.session.videoUrl = videoUrl
      ctx.wizard.next()
      return
    } else {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: видео не предоставлено'
          : '❌ Error: Video not provided'
      )
      ctx.scene.leave()
      return
    }
  },
  async ctx => {
    console.log('CASE 3: uploadVideoScene')
    const isRu = ctx.from?.language_code === 'ru'
    const telegramId = ctx.from?.id

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: Не удалось определить ID пользователя.'
          : '❌ Error: Could not determine user ID.'
      )
      return ctx.scene.leave()
    }

    try {
      const filePath = await uploadVideoToServer({
        videoUrl: ctx.session.videoUrl,
        telegram_id: telegramId,
        fileName: `video_to_url_${randomUUID()}`,
      })
      await ctx.reply(
        (isRu
          ? '✅ Видео успешно загружено на сервер. Путь: '
          : '✅ Video successfully uploaded to the server. Path: ') + filePath
      )
    } catch (error) {
      console.error('Error uploading video:', error)
      await ctx.reply(
        isRu ? '❌ Ошибка при загрузке видео' : '❌ Error uploading video'
      )
    }
    return ctx.scene.leave()
  }
)
