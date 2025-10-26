/**
 * @deprecated Используйте ErrorMessageService напрямую
 * Этот файл сохранен для обратной совместимости
 *
 * Миграция:
 * Было:
 * ```
 * await sendGenerationErrorMessage(ctx, isRu)
 * ```
 *
 * Стало:
 * ```
 * import { ErrorMessageService } from '@/helpers/error/ErrorMessageService'
 * await ErrorMessageService.sendGenerationError(ctx, isRu)
 * ```
 */

import { MyContext } from '../interfaces'
import { ErrorMessageService } from '@/helpers/error/ErrorMessageService'

/**
 * @deprecated Используйте ErrorMessageService.sendGenerationError
 */
export async function sendGenerationErrorMessage(
  ctx: MyContext,
  isRu: boolean
): Promise<void> {
  return ErrorMessageService.sendGenerationError(ctx, isRu)
}
