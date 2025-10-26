/**
 * @deprecated Используйте BalanceOperationProcessor напрямую
 * Этот файл сохранен для обратной совместимости
 *
 * Миграция:
 * Было:
 * ```
 * await processBalanceOperation({ ctx, telegram_id, paymentAmount, is_ru, bot_name })
 * ```
 *
 * Стало:
 * ```
 * import { BalanceOperationProcessor } from '@/price/helpers/BalanceOperationProcessor'
 * await BalanceOperationProcessor.processOperation({
 *   telegram_id, paymentAmount, is_ru, bot_name, ctx
 * })
 * ```
 */

import { BalanceOperationResult, MyContext } from '@/interfaces'
import {
  BalanceOperationProcessor,
  type BalanceOperationParams,
} from './BalanceOperationProcessor'

type BalanceOperationProps = {
  ctx?: MyContext
  model?: string
  telegram_id: number
  paymentAmount: number
  is_ru: boolean
  bot_name?: string
}

/**
 * @deprecated Используйте BalanceOperationProcessor.processOperation
 */
export const processBalanceOperation = async ({
  ctx,
  telegram_id,
  paymentAmount,
  is_ru,
  bot_name,
}: BalanceOperationProps): Promise<BalanceOperationResult> => {
  // Подготовка параметров для нового процессора
  const params: BalanceOperationParams = {
    telegram_id,
    paymentAmount,
    is_ru,
    bot_name: bot_name || ctx?.botInfo?.username || 'unknown_bot',
    ctx,
    bypass_payment_check: ctx?.session?.bypass_payment_check,
  }

  // Используем новый унифицированный обработчик
  return BalanceOperationProcessor.processOperation(params)
}
