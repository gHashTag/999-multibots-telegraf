/**
 * @deprecated Используйте ErrorMessageService напрямую
 * Этот файл сохранен для обратной совместимости
 *
 * Миграция:
 * Было:
 * ```
 * await sendGenericErrorMessage(ctx, isRu, error)
 * ```
 *
 * Стало:
 * ```
 * import { ErrorMessageService } from '@/helpers/error/ErrorMessageService'
 * await ErrorMessageService.sendGenericError(ctx, isRu, error)
 * ```
 */

import { MyContext } from '../interfaces'
import { ErrorMessageService } from '@/helpers/error/ErrorMessageService'

/**
 * @deprecated Используйте ErrorMessageService.sendGenericError
 */
export async function sendGenericErrorMessage(
  ctx: MyContext,
  isRu: boolean,
  error?: Error
): Promise<void> {
  return ErrorMessageService.sendGenericError(ctx, isRu, error)
}
