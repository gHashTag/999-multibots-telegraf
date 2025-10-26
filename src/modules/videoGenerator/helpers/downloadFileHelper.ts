/**
 * @deprecated Используйте downloadFile из @/helpers/downloadFile
 * Этот файл сохранен для обратной совместимости
 *
 * Миграция:
 * Было:
 * ```
 * import { downloadFileHelper } from '@/modules/videoGenerator/helpers/downloadFileHelper'
 * const buffer = await downloadFileHelper(url)
 * ```
 *
 * Стало:
 * ```
 * import { downloadFile } from '@/helpers/downloadFile'
 * const buffer = await downloadFile(url)
 * ```
 */

import { downloadFile } from '@/helpers/downloadFile'
import { logger } from '@/utils/enhancedLogger'

/**
 * @deprecated Используйте downloadFile из @/helpers/downloadFile напрямую
 */
export async function downloadFileHelper(url: string): Promise<Buffer> {
  logger.info('🔍 [downloadFileHelper] Вызов функции (совместимость):', { url })

  // Перенаправляем на основную функцию
  return downloadFile(url)
}
