import { MyContext } from '@/interfaces'
import { validateImageUrl } from './validateImageUrl'
import logger from '@/utils/logger'

interface SendPhotoOptions {
  caption?: string
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
  reply_markup?: any
}

export async function sendPhotoWithFallback(
  ctx: MyContext,
  photoUrl: string,
  options: SendPhotoOptions = {}
): Promise<boolean> {
  const telegramId = ctx.from?.id?.toString() || 'unknown'

  try {
    logger.info(`[sendPhotoWithFallback] Attempting to send photo: ${photoUrl}`)

    // Check if this is a Telegram file URL - these must be uploaded via buffer
    if (photoUrl.includes("api.telegram.org/file/bot")) {
      logger.info(`[sendPhotoWithFallback] Detected Telegram file URL, using buffer method directly`)
      throw new Error("Telegram file URLs require buffer upload")
    }

    // Сначала пробуем валидацию
    const validation = await validateImageUrl(photoUrl)
    if (!validation.isValid) {
      logger.warn(
        `[sendPhotoWithFallback] Image validation failed for URL: ${photoUrl}. Reason: ${validation.reason}`
      )
      return false
    }

    logger.info(
      `[sendPhotoWithFallback] Image validation passed. Size: ${
        validation.size
          ? (validation.size / 1024 / 1024).toFixed(2) + 'MB'
          : 'unknown'
      }, Type: ${validation.contentType}`
    )

    try {
      // Пробуем отправить по URL
      await ctx.replyWithPhoto(photoUrl, options)
      logger.info(
        `[sendPhotoWithFallback] Successfully sent photo via URL: ${photoUrl}`
      )
      return true
    } catch (urlError) {
      logger.warn(
        `[sendPhotoWithFallback] Failed to send photo via URL: ${photoUrl}. Error: ${
          urlError instanceof Error ? urlError.message : 'Unknown error'
        }. Trying buffer upload...`
      )

      // Fallback: загружаем изображение и отправляем через Buffer
      try {
        logger.info(
          `[sendPhotoWithFallback] Downloading image for buffer upload: ${photoUrl}`
        )

        const response = await fetch(photoUrl)
        if (!response.ok) {
          logger.error(
            `[sendPhotoWithFallback] Failed to download image: HTTP ${response.status}`
          )
          return false
        }

        const buffer = await response.arrayBuffer()
        const imageBuffer = Buffer.from(buffer)

        logger.info(
          `[sendPhotoWithFallback] Downloaded ${imageBuffer.length} bytes, attempting buffer upload`
        )

        // Отправляем через Buffer
        await ctx.replyWithPhoto({ source: imageBuffer }, options)

        logger.info(
          `[sendPhotoWithFallback] Successfully sent photo via buffer upload: ${photoUrl}`
        )
        return true
      } catch (bufferError) {
        logger.error(
          `[sendPhotoWithFallback] Buffer upload also failed: ${
            bufferError instanceof Error ? bufferError.message : 'Unknown error'
          }`
        )
        return false
      }
    }
  } catch (error) {
    logger.error(
      `[sendPhotoWithFallback] Unexpected error: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
    return false
  }
}
