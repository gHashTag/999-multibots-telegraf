import { Request, Response } from 'express'
import * as supabase from '@/core/supabase'
import { PASSWORD2 } from '@/config'
import { validateRobokassaSignature } from '@/core/robokassa'
import { sendPaymentSuccessMessage } from '@/helpers/notifications'

import { logger } from '@/utils/logger'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { PaymentStatus } from '@/interfaces'

/**
 * Обработчик вебхуков Robokassa
 * Получает уведомления об успешных платежах.
 * @param bot - Инстанс Telegraf бота для отправки уведомлений
 */
export const handleRobokassaWebhook =
  (bot: Telegraf<MyContext>) => async (req: Request, res: Response) => {
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
      return res.status(400).send('Bad Request: Missing parameters')
    }

    // Добавляем проверку shp_ параметров
    const { shp_user_id, shp_payment_uuid } = otherParams as {
      shp_user_id?: string
      shp_payment_uuid?: string
    } // Явное указание типов
    if (!shp_user_id || !shp_payment_uuid) {
      logger.warn('⚠️ Robokassa Webhook: Missing required shp_ parameters', {
        query: req.query, // Логируем все query для отладки
        shp_user_id,
        shp_payment_uuid,
      })
      return res.status(400).send('Bad Request: Missing shp_ parameters')
    }
    // Конец проверки shp_

    // 1. Валидация подписи
    const isValidSignature = validateRobokassaSignature(
      OutSum as string,
      InvId as string,
      PASSWORD2, // Используем второй пароль для вебхуков
      SignatureValue as string
    )

    if (!isValidSignature) {
      logger.error('❌ Robokassa Webhook: Invalid signature', { InvId })
      return res.status(400).send('Bad Request: Invalid signature')
    }
    logger.info(`✅ Robokassa Webhook: Signature valid for InvId ${InvId}`)

    try {
      // 2. Поиск PENDING платежа
      const { data: payment, error: paymentError } =
        await supabase.getPendingPayment(InvId as string)

      if (paymentError) {
        logger.error(
          `❌ Robokassa Webhook: DB Error getting payment for InvId ${InvId}`,
          {
            error: paymentError.message,
          }
        )
        return res.status(500).send('Internal Server Error')
      }

      if (!payment) {
        const { data: successPayment } = await supabase.getPaymentByInvId(
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
          return res.status(200).send(`OK${InvId}`)
        } else {
          logger.warn(
            `⚠️ Robokassa Webhook: PENDING payment not found for InvId ${InvId}. It might be FAILED or non-existent.`,
            { InvId }
          )
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
        return res.status(400).send('Bad Request: Amount mismatch')
      }

      logger.info(`🅿️ Robokassa Webhook: Found PENDING payment ${InvId}`, {
        telegram_id: payment.telegram_id,
        amount: payment.amount,
        stars: payment.stars,
      })

      // 3. Обновление статуса платежа на SUCCESS
      const { error: updateError } = await supabase.updatePaymentStatus(
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
        return res.status(500).send('Internal Server Error')
      }

      logger.info(
        `✅ Robokassa Webhook: Payment ${InvId} status updated to SUCCESS`
      )

      // 4. Обновление баланса пользователя (зачисление звезд)
      const operationDetails = {
        paymentSystem: 'Robokassa',
        amount: Number(OutSum),
        inv_id: InvId as string,
      }
      const updateResult = await supabase.updateUserBalance(
        payment.telegram_id,
        Number(OutSum) // Передаем положительное значение для пополнения
      )

      // Проверяем, что updateUserBalance вернул число (новый баланс), а не null (ошибка)
      if (updateResult === null) {
        logger.error(
          `🆘 CRITICAL: Robokassa Webhook: Failed to update user balance for InvId ${InvId} AFTER payment success! (updateUserBalance returned null)`,
          {
            telegram_id: payment.telegram_id,
            stars_to_add: payment.stars,
            inv_id: InvId as string,
          }
        )
        // Отвечаем OK, т.к. деньги получены, статус обновлен.
        return res.status(200).send(`OK${InvId}`)
      }

      logger.info(
        `👤 Robokassa Webhook: User ${payment.telegram_id} balance updated successfully. New balance: ${updateResult}`
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
      return res.status(200).send(`OK${InvId}`)
    } catch (error: any) {
      logger.error(
        `💥 Robokassa Webhook: Uncaught error processing InvId ${InvId}`,
        {
          error: error.message,
          stack: error.stack,
        }
      )
      return res.status(500).send('Internal Server Error')
    }
  }
