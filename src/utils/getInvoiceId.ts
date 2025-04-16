import { generateShortInvId } from '@/scenes/getRuBillWizard/helper'
import { generateRobokassaUrl } from '@/utils/generateRobokassaUrl'
import { logger } from '@/utils/logger'

/**
 * Генерирует идентификатор счета для платежа
 */
export async function getInvoiceId(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): Promise<string> {
  logger.info('🚀 Запуск getInvoiceId', {
    description: 'Starting getInvoiceId',
    merchantLogin,
    outSum,
    invId,
  })

  try {
    const response = await generateRobokassaUrl(
      merchantLogin,
      outSum,
      invId,
      description,
      password1
    )

    return response
  } catch (error) {
    logger.error('❌ Ошибка в getInvoiceId:', {
      description: 'Error in getInvoiceId',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
