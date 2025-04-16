import { errorMessageAdmin } from '@/helpers'

import { logger } from '@/utils/logger'
import { inngest } from '@/inngest-functions/clients'

export class PaymentService {
  // Новый метод для обработки платежа через Inngest
  public async processPaymentWithInngest(
    roundedIncSum: number,
    inv_id: string
  ): Promise<void> {
    try {
      console.log(
        '🚀 PaymentService: запуск фоновой задачи для платежа',
        roundedIncSum
      )

      // Отправляем событие в Inngest для асинхронной обработки
      await inngest.send({
        name: 'payment/process-ai-server',
        data: {
          IncSum: Math.round(Number(roundedIncSum)),
          inv_id,
        },
      })

      logger.info('🔄 Платеж отправлен на обработку', {
        description: 'Payment sent for background processing',
        inv_id,
        amount: roundedIncSum,
      })
    } catch (error) {
      console.log('❌ Ошибка при отправке платежа на обработку:', error)
      errorMessageAdmin(error as Error)
      throw error
    }
  }
}
