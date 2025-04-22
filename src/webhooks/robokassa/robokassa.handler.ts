import { Request as ExpressRequest, Response as ExpressResponse } from 'express'

import { logger } from '@/utils/logger'
import {
  supabase,
  updateUserBalance,
  updatePaymentStatus,
} from '@/core/supabase'
import { validateRobokassaSignature } from './utils/validateSignature'
import { createBotByName } from '@/core/bot'
import { sendPaymentSuccessMessage } from '@/helpers/notifications'
import { PaymentStatus } from '@/interfaces'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'

interface RobokassaRequestBody {
  InvId?: string
  OutSum?: string
  SignatureValue?: string
  [key: string]: string | undefined
}

/**
 * Обрабатывает уведомления об успешном платеже от Robokassa (Result URL).
 */
export const handleRobokassaResult = async (
  req: ExpressRequest<{}, {}, RobokassaRequestBody>,
  res: ExpressResponse
): Promise<void> => {
  try {
    logger.info('[Robokassa Result] Received request:', req.body)

    // Получаем параметры из тела запроса
    const { InvId, OutSum, SignatureValue } = req.body

    // Проверка наличия обязательных параметров
    if (!InvId || !OutSum || !SignatureValue) {
      logger.error('[Robokassa Result] Missing required parameters', {
        InvId,
        OutSum,
        SignatureValue,
      })
      res.status(400).send('Bad Request: Missing parameters')
      return
    }

    const invId = parseInt(InvId, 10)
    const outSum = parseFloat(OutSum)

    // 2. Проверяем пароль Robokassa (Password #2)
    const robokassaPassword2 = process.env.PASSWORD2
    if (!robokassaPassword2) {
      logger.error(
        '[Robokassa Result] Robokassa Password #2 is not configured!'
      )
      res.status(500).send('Internal Server Error: Configuration missing')
      return
    }

    // 3. Валидируем подпись
    if (!validateRobokassaSignature(req.body, robokassaPassword2)) {
      logger.warn('[Robokassa Result] Invalid signature received', {
        InvId,
        SignatureValue,
      })
      res.status(400).send('Bad Request: Invalid signature')
      return
    }

    logger.info(
      `[Robokassa Result] Signature validated successfully for InvId: ${invId}`
    )

    // 4. Ищем платеж в БД
    const { data: payment, error: paymentError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('inv_id', invId)
      .maybeSingle()

    if (paymentError) {
      logger.error(
        `[Robokassa Result] Error fetching payment for InvId: ${invId}`,
        paymentError
      )
      res.status(200).send(`OK${invId}`)
      return
    }

    if (!payment) {
      logger.warn(`[Robokassa Result] Payment not found for InvId: ${invId}`)
      res.status(200).send(`OK${invId}`)
      return
    }

    // Получаем telegram_id и bot_name напрямую из записи payment
    const telegramId = payment.telegram_id
    const botName = payment.bot_name
    // languageCode пока уберем или получим отдельно позже, если нужен

    // Проверяем наличие telegram_id и bot_name
    if (!telegramId || !botName) {
      logger.error(
        `[Robokassa Result] Missing telegram_id or bot_name in payment record for InvId: ${invId}`,
        { telegramId, botName }
      )
      res.status(200).send(`OK${invId}`)
      return
    }

    logger.info(`[Robokassa Result] Found payment for InvId: ${invId}`, payment)

    // 5. Проверяем статус и сумму платежа
    if (payment.status === PaymentStatus.COMPLETED) {
      logger.warn(
        `[Robokassa Result] Payment InvId: ${invId} already processed.`
      )
      res.status(200).send(`OK${invId}`)
      return
    }

    // Сверяем сумму (OutSum - это сумма, зачисленная магазину, с учетом комиссии)
    // Допустим, нас интересует именно эта сумма
    if (payment.amount !== outSum) {
      logger.warn(
        `[Robokassa Result] Amount mismatch for InvId: ${invId}. Expected: ${payment.amount}, Received: ${outSum}`
      )
      res.status(200).send(`OK${invId}`)
      return
    }

    // 6. Обновление статуса платежа на SUCCESS
    const { error: updateError } = await updatePaymentStatus(
      InvId as string,
      PaymentStatus.COMPLETED
    )
    if (updateError) {
      logger.error(
        `❌ [Robokassa Result] DB Error updating payment status for InvId ${invId}`,
        {
          error: updateError.message,
          telegram_id: payment.telegram_id,
        }
      )
      res.status(500).send('Internal Server Error')
      return
    }
    logger.info(
      `✅ [Robokassa Result] Payment ${invId} status updated to SUCCESS`
    )

    // 7. Обновление баланса пользователя (зачисление звезд)
    const balanceUpdated = await updateUserBalance(
      payment.telegram_id,
      payment.stars ?? 0,
      'money_income',
      `Пополнение звезд по Robokassa (InvId: ${invId})`,
      {
        payment_method: 'Robokassa',
        inv_id: InvId as string,
      }
    )

    if (!balanceUpdated) {
      logger.error(
        `🆘 CRITICAL: [Robokassa Result] Failed to update user balance for InvId ${invId} AFTER payment success!`,
        {
          telegram_id: payment.telegram_id,
          stars_to_add: payment.stars,
          inv_id: InvId as string,
        }
      )
      res.status(200).send(`OK${invId}`)
      return
    }

    logger.info(
      `👤 [Robokassa Result] User ${payment.telegram_id} balance updated`
    )

    // 8. Отправка уведомления пользователю
    try {
      // Создаем бота для отправки уведомления
      const botData = await createBotByName(botName)
      if (botData && botData.bot) {
        await sendPaymentSuccessMessage(
          botData.bot,
          telegramId,
          payment.stars ?? 0,
          'ru' // TODO: Получать язык пользователя?
        )
      } else {
        logger.error(
          `[Robokassa Result] Could not find bot instance for botName: ${botName} to send notification.`
        )
      }
    } catch (err) {
      logger.error(
        `❌ [Robokassa Result] Failed to send success notification to user ${telegramId} for InvId ${invId}`,
        { error: err instanceof Error ? err.message : String(err) }
      )
    }

    // 9. Отправляем ответ Robokassa
    logger.info(`[Robokassa Result] Successfully processed InvId: ${invId}`)
    res.status(200).send(`OK${invId}`)
  } catch (error) {
    logger.error('[Robokassa Result] Uncaught Error:', error)
    res.status(500).send('Internal Server Error')
  }
}
