import { Scenes } from 'telegraf'
import type { Update } from 'telegraf/types'
import type { MyContext } from '../../interfaces'
import { generateLipSync } from '../../services/generateLipSync'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB, пример ограничения

export const lipSyncWizard = new Scenes.WizardScene<MyContext>(
  'lip_sync',
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    await ctx.reply(
      isRu ? 'Отправьте видео или URL видео' : 'Send a video or video URL',
      {
        reply_markup: { remove_keyboard: true },
      }
    )
    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
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
    console.log('videoUrl', videoUrl)
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
    const isRu = ctx.from?.language_code === 'ru'
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
      console.log('voiceFile', voiceFile)
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
    if (!ctx.session.videoUrl) {
      console.error('❌ Video URL не найден')
      return
    }
    if (!ctx.session.audioUrl) {
      console.error('❌ Audio URL не найден')
      return
    }
    if (!ctx.from?.id) {
      console.error('❌ Telegram ID не найден')
      return
    }
    if (!ctx.botInfo?.username) {
      console.error('❌ Bot username не найден')
      return
    }
    try {
      await generateLipSync(
        ctx.session.videoUrl,
        ctx.session.audioUrl,
        ctx.from.id.toString(),
        ctx.botInfo?.username
      )

      await ctx.reply(
        isRu
          ? `🎥 Видео отправлено на обработку. Ждите результата`
          : `🎥 Video sent for processing. Wait for the result`
      )
    } catch (error) {
      console.error('Error in generateLipSync:', error)
      await ctx.reply(
        isRu
          ? 'Произошла ошибка при обработке видео'
          : 'An error occurred while processing the video'
      )
    }
    return ctx.scene.leave()
  }
)

export default lipSyncWizard
