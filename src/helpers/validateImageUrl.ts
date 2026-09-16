import logger from '@/utils/logger'

export interface ImageValidationResult {
  isValid: boolean
  reason?: string
  size?: number
  contentType?: string
  status?: number
  headers?: any
}

export async function validateImageUrl(
  url: string
): Promise<ImageValidationResult> {
  try {
    logger.info(`[validateImageUrl] Validating URL: ${url}`)

    const response = await fetch(url, { method: 'HEAD' })

    logger.info(`[validateImageUrl] Response status: ${response.status}`)

    if (!response.ok) {
      return {
        isValid: false,
        reason: `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
      }
    }

    const contentType = response.headers.get('content-type')
    const contentLength = response.headers.get('content-length')

    logger.info(
      `[validateImageUrl] Content-Type: ${contentType}, Content-Length: ${contentLength}`
    )

    // Проверяем, что это изображение
    // Telegram API может возвращать application/octet-stream для изображений,
    // поэтому полагаемся на проверку магических байтов дальше в коде
    if (
      !contentType ||
      (!contentType.startsWith('image/') &&
        contentType !== 'application/octet-stream')
    ) {
      return {
        isValid: false,
        reason: `Invalid content type: ${contentType}`,
        contentType,
        status: response.status,
      }
    }

    const size = contentLength ? parseInt(contentLength, 10) : 0

    // Проверяем размер файла (Telegram лимит ~50MB для фото, но лучше держать разумные пределы)
    const MAX_SIZE = 20 * 1024 * 1024 // 20MB
    if (size > MAX_SIZE) {
      return {
        isValid: false,
        reason: `File too large: ${(size / 1024 / 1024).toFixed(2)}MB (max: ${
          MAX_SIZE / 1024 / 1024
        }MB)`,
        size,
        contentType,
        status: response.status,
      }
    }

    // Дополнительная проверка - пытаемся получить несколько байт изображения
    try {
      const partialResponse = await fetch(url, {
        method: 'GET',
        headers: {
          Range: 'bytes=0-1023', // Получаем первые 1KB
        },
      })

      if (partialResponse.ok || partialResponse.status === 206) {
        const buffer = await partialResponse.arrayBuffer()
        logger.info(
          `[validateImageUrl] Successfully downloaded ${buffer.byteLength} bytes for validation`
        )

        // Проверяем сигнатуру файла (магические байты)
        const bytes = new Uint8Array(buffer)
        const isPNG =
          bytes[0] === 0x89 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x4e &&
          bytes[3] === 0x47
        const isJPEG =
          bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        const isGIF =
          bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46
        const isWebP =
          bytes[8] === 0x57 &&
          bytes[9] === 0x45 &&
          bytes[10] === 0x42 &&
          bytes[11] === 0x50

        if (!isPNG && !isJPEG && !isGIF && !isWebP) {
          return {
            isValid: false,
            reason: `Invalid image signature. First 16 bytes: ${Array.from(
              bytes.slice(0, 16)
            )
              .map(b => b.toString(16).padStart(2, '0'))
              .join(' ')}`,
            size,
            contentType,
            status: response.status,
          }
        }

        logger.info(
          `[validateImageUrl] Image signature validation passed. Type detected: ${
            isPNG ? 'PNG' : isJPEG ? 'JPEG' : isGIF ? 'GIF' : 'WebP'
          }`
        )
      } else {
        logger.warn(
          `[validateImageUrl] Could not download partial content for validation. Status: ${partialResponse.status}`
        )
      }
    } catch (partialError) {
      logger.warn(
        `[validateImageUrl] Could not perform partial download validation: ${partialError}`
      )
      // Не считаем это критической ошибкой, если основная проверка прошла
    }

    logger.info(`[validateImageUrl] Validation successful for ${url}`)

    return {
      isValid: true,
      size,
      contentType,
      status: response.status,
    }
  } catch (error) {
    logger.warn(`[validateImageUrl] Validation error for ${url}:`, error)
    return {
      isValid: false,
      reason: `Network error: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    }
  }
}
