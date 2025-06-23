import logger from '@/utils/logger'

export interface ImageValidationResult {
  isValid: boolean
  reason?: string
  size?: number
  contentType?: string
}

export async function validateImageUrl(
  url: string
): Promise<ImageValidationResult> {
  try {
    const response = await fetch(url, { method: 'HEAD' })

    if (!response.ok) {
      return {
        isValid: false,
        reason: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    const contentType = response.headers.get('content-type')
    const contentLength = response.headers.get('content-length')

    // Проверяем, что это изображение
    if (!contentType || !contentType.startsWith('image/')) {
      return {
        isValid: false,
        reason: `Invalid content type: ${contentType}`,
        contentType,
      }
    }

    // Проверяем размер (максимум 5MB для оптимальной работы с Telegram)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (contentLength) {
      const size = parseInt(contentLength, 10)
      if (size > maxSize) {
        return {
          isValid: false,
          reason: `Image too large: ${(size / 1024 / 1024).toFixed(2)}MB (max: 5MB)`,
          size,
          contentType,
        }
      }
    }

    return {
      isValid: true,
      size: contentLength ? parseInt(contentLength, 10) : undefined,
      contentType,
    }
  } catch (error) {
    logger.error('Error validating image URL', {
      url,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return {
      isValid: false,
      reason: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
