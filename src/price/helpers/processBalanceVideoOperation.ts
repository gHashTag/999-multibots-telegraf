// import type { MyContext } from '@/interfaces/context.interface' // <-- Закомментировано
// import type { TelegramId } from '@/interfaces' // Проверим прямой импорт
import type { TelegramId } from '@/interfaces/telegram.interface'
import {
  PaymentStatus,
  PaymentType,
  //  ServiceType, // <-- Закомментировано
} from '@/interfaces/payments.interface'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { VIDEO_MODELS_CONFIG } from '@/config/models.config'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'

import { logger } from '@/utils/logger'
import { invalidateBalanceCache } from '@/core/supabase/getUserBalance'

// export type BalanceOperationResult = { // <-- Закомментировано
//   success: boolean
//   newBalance?: number
//   errorMessage?: string
// }

/**
 * Обрабатывает операцию с балансом для видео
 */
// export const processBalanceVideoOperation = async (
// ...
// ): Promise</*BalanceOperationResult*/ any> => { // <-- Закомментировано
// ...
