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

  console.log('📸 [sendPhotoWithFallback] STARTED', {
    telegramId,
    photoUrl,
    hasCaption: !!options.caption,
    captionLength: options.caption?.length,
    parseMode: options.parse_mode,
  })

  try {
    logger.info(`[sendPhotoWithFallback] Attempting to send photo: ${photoUrl}`)

    // Check if this is a Telegram file URL - these must be uploaded via buffer
    if (photoUrl.includes("api.telegram.org/file/bot")) {
      console.log('🔍 [sendPhotoWithFallback] Detected Telegram file URL, using buffer method directly', {
        telegramId,
        url: photoUrl.substring(0, 100) + '...'
      })

      // Try to download and upload as buffer
      try {
        console.log('⬇️ [sendPhotoWithFallback] Downloading Telegram file for buffer upload...', { telegramId })

        const response = await fetch(photoUrl)
        if (!response.ok) {
          console.error('❌ [sendPhotoWithFallback] Failed to download Telegram file:', {
            telegramId,
            status: response.status,
            statusText: response.statusText
          })
          return false
        }

        const buffer = await response.arrayBuffer()
        const imageBuffer = Buffer.from(buffer)

        console.log('📦 [sendPhotoWithFallback] Downloaded buffer, attempting upload...', {
          telegramId,
          bufferSize: imageBuffer.length
        })

        // Отправляем через Buffer
        await ctx.replyWithPhoto({ source: imageBuffer }, options)

        console.log('✅ [sendPhotoWithFallback] Successfully sent Telegram photo via buffer upload!', {
          telegramId,
          bufferSize: imageBuffer.length
        })
        return true
      } catch (telegramError) {
        console.error('❌ [sendPhotoWithFallback] Telegram file buffer upload failed:', {
          telegramId,
          error: telegramError instanceof Error ? telegramError.message : 'Unknown error',
          errorDetails: telegramError
        })
        return false
      }
    }

    // Сначала пробуем валидацию (пропускаем для Telegram URLs - они всегда валидны)
    let validation: { isValid: boolean; size?: number; contentType?: string; reason?: string } = { isValid: true, size: undefined, contentType: 'image/jpeg' }
    if (!photoUrl.includes('api.telegram.org/file/bot')) {
      console.log('🔍 [sendPhotoWithFallback] Validating non-Telegram URL...', { telegramId })
      validation = await validateImageUrl(photoUrl)
      if (!validation.isValid) {
        console.warn('⚠️ [sendPhotoWithFallback] Image validation failed:', {
          telegramId,
          reason: validation.reason
        })
        return false
      }
    } else {
      console.log('⏩ [sendPhotoWithFallback] Skipping validation for Telegram URL', { telegramId })
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
      console.log('📤 [sendPhotoWithFallback] Attempting to send via URL...', {
        telegramId,
        url: photoUrl,
      })
      
      await ctx.replyWithPhoto(photoUrl, options)
      
      console.log('✅ [sendPhotoWithFallback] Photo sent via URL successfully!', {
        telegramId,
        url: photoUrl,
      })
      
      logger.info(
        `[sendPhotoWithFallback] Successfully sent photo via URL: ${photoUrl}`
      )
      return true
    } catch (urlError) {
      console.error('❌ [sendPhotoWithFallback] URL send failed:', {
        telegramId,
        error: urlError instanceof Error ? urlError.message : 'Unknown',
        errorDetails: urlError,
      })
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
        console.log('📤 [sendPhotoWithFallback] Attempting buffer upload...', {
          telegramId,
          bufferSize: imageBuffer.length,
        })
        
        await ctx.replyWithPhoto({ source: imageBuffer }, options)
        
        console.log('✅ [sendPhotoWithFallback] Photo sent via buffer successfully!', {
          telegramId,
          bufferSize: imageBuffer.length,
        })

        logger.info(
          `[sendPhotoWithFallback] Successfully sent photo via buffer upload: ${photoUrl}`
        )
        return true
      } catch (bufferError) {
        console.error('❌ [sendPhotoWithFallback] Buffer upload FAILED:', {
          telegramId,
          error: bufferError instanceof Error ? bufferError.message : 'Unknown',
          errorDetails: bufferError,
        })
        
        logger.error(
          `[sendPhotoWithFallback] Buffer upload also failed: ${
            bufferError instanceof Error ? bufferError.message : 'Unknown error'
          }`
        )
        return false
      }
    }
  } catch (error) {
    console.error('💥 [sendPhotoWithFallback] UNEXPECTED ERROR:', {
      telegramId,
      error: error instanceof Error ? error.message : 'Unknown',
      errorStack: error instanceof Error ? error.stack : undefined,
    })
    
    logger.error(
      `[sendPhotoWithFallback] Unexpected error: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
    return false
  }
}
