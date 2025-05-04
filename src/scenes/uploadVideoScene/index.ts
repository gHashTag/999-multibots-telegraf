import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { uploadVideoService } from '@/modules/uploadVideoService'
import { VideoService } from '@/modules/videoService'
import { logger } from '@/utils/logger'
import { downloadFile } from '@/helpers'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { randomUUID } from 'node:crypto'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB, пример ограничения
const UPLOADS_ROOT = process.env.UPLOADS_DIR || './uploads'

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
      ctx.scene.session.videoUrl = videoUrl
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
    const videoUrl = ctx.scene.session?.videoUrl

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: Не удалось определить ID пользователя.'
          : '❌ Error: Could not determine user ID.'
      )
      return ctx.scene.leave()
    }
    if (!videoUrl) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: URL видео не найден в сессии.'
          : '❌ Error: Video URL not found in session.'
      )
      return ctx.scene.leave()
    }

    try {
      const videoServiceDeps = {
        logger: logger,
        downloadFile: downloadFile,
        fs: { mkdir: fs.mkdir, writeFile: fs.writeFile },
        path: { join: path.join, dirname: path.dirname },
        uploadsDir: UPLOADS_ROOT,
      }
      const videoServiceInstance = new VideoService(videoServiceDeps)

      const uploadVideoServiceDeps = {
        logger: logger,
        videoService: videoServiceInstance,
      }

      const requestData = {
        videoUrl: videoUrl,
        telegram_id: telegramId,
        fileName: `video_to_url_${randomUUID()}.mp4`,
      }

      const result = await uploadVideoService(
        requestData,
        uploadVideoServiceDeps
      )
      const filePath = result.localPath

      await ctx.reply(
        (isRu
          ? '✅ Видео успешно загружено локально. Путь: '
          : '✅ Video successfully downloaded locally. Path: ') + filePath
      )
    } catch (error) {
      logger.error('Error in uploadVideoScene (step 3): ', error)
      await ctx.reply(
        isRu ? '❌ Ошибка при обработке видео' : '❌ Error processing video'
      )
    }
    return ctx.scene.leave()
  }
)
