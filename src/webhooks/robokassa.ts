import { Request, Response } from 'express'
import {
  getPendingPayment,
  getPaymentByInvId,
  updatePaymentStatus,
  updateUserBalance,
} from '@/core/supabase'
import { PASSWORD2 } from '@/config'
import { validateRobokassaSignature } from '@/core/robokassa'
import { sendPaymentSuccessMessage } from '@/helpers/notifications'

import { logger } from '@/utils/logger'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { PaymentStatus } from '@/interfaces'
import { ParsedQs } from 'qs'

// Интерфейс для параметров запроса Robokassa
interface RobokassaQuery extends ParsedQs {
  OutSum?: string
  InvId?: string
  SignatureValue?: string
  shp_user_id?: string
  shp_payment_uuid?: string
  [key: string]: string | string[] | ParsedQs | ParsedQs[] | undefined
}

/**
 * Обработчик вебхуков Robokassa
 * Получает уведомления об успешных платежах.
 * @param bot - Инстанс Telegraf бота для отправки уведомлений
 */
export const handleRobokassaWebhook =
  (bot: Telegraf<MyContext>) =>
  // Явно типизируем req и res
  async (req: Request<{}, {}, {}, RobokassaQuery>, res: Response) => {
    // Тип query теперь известен из дженерика Request
    const { OutSum, InvId, SignatureValue, ...otherParams } = req.query

    logger.info('🤖 Robokassa Webhook Received', {
      InvId,
      OutSum,
      hasSignature: !!SignatureValue,
      otherParams:
        Object.keys(otherParams).length > 0 ? otherParams : undefined,
    })

    // Проверка стандартных параметров
    if (!OutSum || !InvId || !SignatureValue) {
      logger.warn('⚠️ Robokassa Webhook: Missing required parameters', {
        query: req.query,
      })
      // Тип res известен
      return res.status(400).send('Bad Request: Missing parameters')
    }

    // Добавляем проверку shp_ параметров
    const { shp_user_id, shp_payment_uuid } = otherParams // Типы уже есть из RobokassaQuery
    if (!shp_user_id || !shp_payment_uuid) {
      logger.warn('⚠️ Robokassa Webhook: Missing required shp_ parameters', {
        query: req.query,
        shp_user_id,
        shp_payment_uuid,
      })
      // Тип res известен
      return res.status(400).send('Bad Request: Missing shp_ parameters')
    }
    // Конец проверки shp_

    // 1. Валидация подписи
    const isValidSignature = validateRobokassaSignature(
      OutSum as string,
      InvId as string,
      PASSWORD2,
      SignatureValue as string
    )

    if (!isValidSignature) {
      logger.error('❌ Robokassa Webhook: Invalid signature', { InvId })
      // Тип res известен
      return res.status(400).send('Bad Request: Invalid signature')
    }
    logger.info(`✅ Robokassa Webhook: Signature valid for InvId ${InvId}`)

    try {
      // 2. Поиск PENDING платежа
      const { data: payment, error: paymentError } = await getPendingPayment(
        InvId as string
      )

      if (paymentError) {
        logger.error(
          `❌ Robokassa Webhook: DB Error getting payment for InvId ${InvId}`,
          {
            error: paymentError.message,
          }
        )
        // Тип res известен
        return res.status(500).send('Internal Server Error')
      }

      if (!payment) {
        const { data: successPayment } = await getPaymentByInvId(
          InvId as string
        )

        if (
          successPayment &&
          successPayment.status === PaymentStatus.COMPLETED
        ) {
          logger.warn(
            `⚠️ Robokassa Webhook: Payment ${InvId} already processed (COMPLETED). Ignoring.`,
            { InvId }
          )
          // Тип res известен
          return res.status(200).send(`OK${InvId}`)
        } else {
          logger.warn(
            `⚠️ Robokassa Webhook: PENDING payment not found for InvId ${InvId}. It might be FAILED or non-existent.`,
            { InvId }
          )
          // Тип res известен
          return res.status(200).send(`OK${InvId}`)
        }
      }

      if (Number(payment.amount) !== Number(OutSum)) {
        logger.error(
          `❌ Robokassa Webhook: Amount mismatch for InvId ${InvId}`,
          {
            dbAmount: payment.amount,
            webhookAmount: OutSum,
            telegram_id: payment.telegram_id,
          }
        )
        // Тип res известен
        return res.status(400).send('Bad Request: Amount mismatch')
      }

      logger.info(`🅿️ Robokassa Webhook: Found PENDING payment ${InvId}`, {
        telegram_id: payment.telegram_id,
        amount: payment.amount,
        stars: payment.stars,
      })

      // 3. Обновление статуса платежа на SUCCESS
      const { error: updateError } = await updatePaymentStatus(
        InvId as string,
        PaymentStatus.COMPLETED
      )
      if (updateError) {
        logger.error(
          `❌ Robokassa Webhook: DB Error updating payment status for InvId ${InvId}`,
          {
            error: updateError.message,
            telegram_id: payment.telegram_id,
          }
        )
        // Тип res известен
        return res.status(500).send('Internal Server Error')
      }

      logger.info(
        `✅ Robokassa Webhook: Payment ${InvId} status updated to SUCCESS`
      )

      // 4. Обновление баланса пользователя (зачисление звезд)
      const balanceUpdated = await updateUserBalance(
        payment.telegram_id,
        payment.stars ?? 0,
        'money_income',
        `Пополнение звезд по Robokassa (InvId: ${InvId})`,
        {
          payment_method: 'Robokassa',
          inv_id: InvId as string,
        }
      )

      if (!balanceUpdated) {
        logger.error(
          `🆘 CRITICAL: Robokassa Webhook: Failed to update user balance for InvId ${InvId} AFTER payment success!`,
          {
            telegram_id: payment.telegram_id,
            stars_to_add: payment.stars,
            inv_id: InvId as string,
          }
        )
        // Тип res известен
        return res.status(200).send(`OK${InvId}`)
      }

      logger.info(
        `👤 Robokassa Webhook: User ${payment.telegram_id} balance updated`
      )

      // 5. Отправка уведомления пользователю
      sendPaymentSuccessMessage(
        bot,
        payment.telegram_id,
        payment.stars ?? 0,
        'ru' // TODO: Получать язык пользователя?
      ).catch(err => {
        logger.error(
          `❌ Robokassa Webhook: Failed to send success notification to user ${payment.telegram_id} for InvId ${InvId}`,
          { error: err instanceof Error ? err.message : String(err) }
        )
      })

      // 6. Ответ Robokassa об успехе
      logger.info(`👍 Robokassa Webhook: Successfully processed InvId ${InvId}`)
      // Тип res известен
      return res.status(200).send(`OK${InvId}`)
    } catch (error: any) {
      logger.error(
        `💥 Robokassa Webhook: Uncaught error processing InvId ${InvId}`,
        {
          error: error.message,
          stack: error.stack,
        }
      )
      // Тип res известен
      return res.status(500).send('Internal Server Error')
    }
  }
