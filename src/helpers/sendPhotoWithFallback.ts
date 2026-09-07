import { MyContext } from '@/interfaces'
import { validateImageUrl } from './validateImageUrl'
import logger from '@/utils/logger'

interface SendPhotoOptions {
  caption?: string
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
  reply_markup?: any
}

/**
 * Extract structured error info from Telegram API errors
 */
function extractTelegramError(err: unknown): {
  code: number | undefined
  description: string
  raw: string
} {
  const e = err as any
  return {
    code: e?.response?.error_code,
    description: e?.response?.description || '',
    raw: err instanceof Error ? err.message : String(err),
  }
}

export async function sendPhotoWithFallback(
  ctx: MyContext,
  photoUrl: string,
  options: SendPhotoOptions = {}
): Promise<boolean> {
  const telegramId = ctx.from?.id?.toString() || 'unknown'

  logger.info('[sendPhotoWithFallback] START', {
    telegramId,
    photoUrl,
    hasCaption: !!options.caption,
    captionLength: options.caption?.length,
  })

  try {
    if (!photoUrl || typeof photoUrl !== 'string') {
      logger.error('[sendPhotoWithFallback] FAIL: Invalid photoUrl', {
        telegramId,
        photoUrl,
        typeOfPhotoUrl: typeof photoUrl,
        failReason: 'INVALID_URL',
      })
      return false
    }

    // === Telegram file URL -> direct buffer upload ===
    // Matches an incoming URL, never builds one: telegram-api-root-ok
    if (photoUrl.includes('api.telegram.org/file/bot')) {
      logger.info(
        '[sendPhotoWithFallback] Detected Telegram file URL, using buffer',
        { telegramId }
      )

      try {
        const response = await fetch(photoUrl)
        if (!response.ok) {
          logger.error(
            '[sendPhotoWithFallback] FAIL: Cannot download Telegram file',
            {
              telegramId,
              status: response.status,
              statusText: response.statusText,
              failReason: 'TELEGRAM_FILE_DOWNLOAD_FAILED',
            }
          )
          return false
        }

        const imageBuffer = Buffer.from(await response.arrayBuffer())
        logger.info('[sendPhotoWithFallback] Telegram file downloaded', {
          telegramId,
          bufferSize: imageBuffer.length,
        })

        await ctx.replyWithPhoto({ source: imageBuffer }, options)
        logger.info('[sendPhotoWithFallback] SUCCESS via Telegram buffer', {
          telegramId,
          bufferSize: imageBuffer.length,
        })
        return true
      } catch (err) {
        const tgErr = extractTelegramError(err)
        logger.error(
          '[sendPhotoWithFallback] FAIL: Telegram file buffer upload',
          {
            telegramId,
            errorCode: tgErr.code,
            errorDesc: tgErr.description,
            error: tgErr.raw,
            failReason: 'TELEGRAM_FILE_BUFFER_UPLOAD_FAILED',
          }
        )
        return false
      }
    }

    // === Step 1: Validate image URL ===
    const validation = await validateImageUrl(photoUrl)
    if (!validation.isValid) {
      logger.error('[sendPhotoWithFallback] FAIL: Image validation failed', {
        telegramId,
        photoUrl,
        validationReason: validation.reason,
        validationStatus: validation.status,
        validationContentType: validation.contentType,
        validationSize: validation.size,
        failReason: 'VALIDATION_FAILED',
      })
      return false
    }

    logger.info('[sendPhotoWithFallback] Validation passed', {
      telegramId,
      size: validation.size
        ? `${(validation.size / 1024 / 1024).toFixed(2)}MB`
        : 'unknown',
      contentType: validation.contentType,
    })

    // === Step 2: Try sending by URL ===
    try {
      await ctx.replyWithPhoto(photoUrl, options)
      logger.info('[sendPhotoWithFallback] SUCCESS via URL', {
        telegramId,
        photoUrl,
      })
      return true
    } catch (urlError) {
      const tgErr = extractTelegramError(urlError)
      logger.warn(
        '[sendPhotoWithFallback] URL send failed, trying buffer fallback',
        {
          telegramId,
          photoUrl,
          errorCode: tgErr.code,
          errorDesc: tgErr.description,
          error: tgErr.raw,
        }
      )

      // === Step 3: Buffer fallback ===
      try {
        const response = await fetch(photoUrl)
        if (!response.ok) {
          logger.error(
            '[sendPhotoWithFallback] FAIL: Cannot download image for buffer',
            {
              telegramId,
              photoUrl,
              httpStatus: response.status,
              httpStatusText: response.statusText,
              failReason: 'BUFFER_DOWNLOAD_FAILED',
            }
          )
          return false
        }

        const imageBuffer = Buffer.from(await response.arrayBuffer())
        logger.info('[sendPhotoWithFallback] Downloaded for buffer upload', {
          telegramId,
          bufferSize: imageBuffer.length,
        })

        await ctx.replyWithPhoto({ source: imageBuffer }, options)
        logger.info('[sendPhotoWithFallback] SUCCESS via buffer fallback', {
          telegramId,
          bufferSize: imageBuffer.length,
        })
        return true
      } catch (bufferError) {
        const bufErr = extractTelegramError(bufferError)
        logger.error(
          '[sendPhotoWithFallback] FAIL: Both URL and buffer failed',
          {
            telegramId,
            photoUrl,
            urlErrorCode: tgErr.code,
            urlErrorDesc: tgErr.description,
            bufferErrorCode: bufErr.code,
            bufferErrorDesc: bufErr.description,
            bufferError: bufErr.raw,
            failReason: 'ALL_METHODS_FAILED',
          }
        )
        return false
      }
    }
  } catch (error) {
    logger.error('[sendPhotoWithFallback] FAIL: Unexpected error', {
      telegramId,
      photoUrl,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      failReason: 'UNEXPECTED_ERROR',
    })
    return false
  }
}
