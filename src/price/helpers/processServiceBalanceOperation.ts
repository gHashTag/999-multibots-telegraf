/**
 * @deprecated Используйте BalanceOperationProcessor напрямую
 * Этот файл сохранен для обратной совместимости
 *
 * Миграция:
 * Было:
 * ```
 * await processServiceBalanceOperation({
 *   telegram_id, paymentAmount, is_ru, bot, bot_name, description, service_type, metadata
 * })
 * ```
 *
 * Стало:
 * ```
 * import { BalanceOperationProcessor } from '@/price/helpers/BalanceOperationProcessor'
 * await BalanceOperationProcessor.processOperation({
 *   telegram_id, paymentAmount, is_ru, bot_name, description, service_type, metadata, bot
 * })
 * ```
 */

import { BalanceOperationResult } from '@/interfaces/payments.interface'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import logger from '@/utils/enhancedLogger'
import { ModeEnum } from '@/interfaces'
import {
  BalanceOperationProcessor,
  type BalanceOperationParams,
} from './BalanceOperationProcessor'

// Сохраняем старый интерфейс для совместимости
export interface ServiceBalanceOperationResult {
  newBalance?: number
  success: boolean
  error?: string
  paymentAmount: number
  currentBalance: number
}

interface ServiceBalanceOperationProps {
  telegram_id: string
  paymentAmount: number
  is_ru: boolean
  bot: Telegraf<MyContext>
  bot_name: string
  description: string
  service_type: ModeEnum
  metadata?: Record<string, any>
}

/**
 * @deprecated Используйте BalanceOperationProcessor.processOperation
 */
export const processServiceBalanceOperation = async ({
  telegram_id,
  paymentAmount,
  is_ru,
  bot,
  bot_name,
  description,
  service_type,
  metadata,
}: ServiceBalanceOperationProps): Promise<ServiceBalanceOperationResult> => {
  logger.info('🔍 [processServiceBalanceOperation] Вызов функции (совместимость):', {
    telegram_id,
    service_type,
  })

  // Подготовка параметров для нового процессора
  const params: BalanceOperationParams = {
    telegram_id,
    paymentAmount,
    is_ru,
    bot_name,
    description,
    service_type,
    metadata,
    bot,
  }

  // Используем новый унифицированный обработчик
  const result = await BalanceOperationProcessor.processOperation(params)

  // Преобразуем результат к старому формату для совместимости
  return {
    newBalance: result.newBalance,
    success: result.success,
    error: result.error,
    paymentAmount: result.paymentAmount,
    currentBalance: result.currentBalance,
  }
}
