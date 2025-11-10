import { Markup } from 'telegraf'
import type { ReplyKeyboardMarkup } from 'telegraf/types'
import { CancelButtonService } from '@/services/CancelButtonService'

/**
 * ⚠️ DEPRECATED - использовать CancelButtonService
 * Этот файл оставлен для обратной совместимости
 */
export const cancelMenu = (isRu: boolean): Markup.Markup<ReplyKeyboardMarkup> =>
  Markup.keyboard([CancelButtonService.createCancelButton(isRu)]).resize()
