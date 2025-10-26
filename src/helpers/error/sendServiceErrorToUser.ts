/**
 * @deprecated Используйте ErrorMessageService напрямую
 * Этот файл сохранен для обратной совместимости
 *
 * Миграция:
 * Было:
 * ```
 * await sendServiceErrorToUser(ctx, telegramId, error, isRu)
 * ```
 *
 * Стало:
 * ```
 * import { ErrorMessageService } from '@/helpers/error/ErrorMessageService'
 * await ErrorMessageService.sendServiceError(ctx, telegramId, error, isRu)
 * ```
 */

import { MyContext } from '@/interfaces'
import { ErrorMessageService } from './ErrorMessageService'

/**
 * @deprecated Используйте ErrorMessageService.sendServiceError
 * Отправляет сообщение об ошибке пользователю напрямую через bot.telegram.
 * Используется в сервисах, где нет доступа к ctx.
 */
export const sendServiceErrorToUser = async (
  ctx: MyContext,
  telegramId: string,
  error: Error,
  isRu: boolean
): Promise<void> => {
  return ErrorMessageService.sendServiceError(ctx, telegramId, error, isRu)
}
