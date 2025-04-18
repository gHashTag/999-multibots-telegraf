import { Request, Response } from 'express'
import { Telegraf } from 'telegraf'
import { logger } from '@/utils/logger'
import {
  supabase,
  incrementBalance,
  updateUserSubscription,
  updateUserBalance,
} from '../../core/supabase'
import { validateRobokassaSignature } from './utils/validateSignature'
import { createBotByName } from '../../core/bot'
import { MyContext } from '@/interfaces'

/**
 * Обрабатывает уведомления об успешном платеже от Robokassa (Result URL).
 */
export async function handleRobokassaResult(
  req: Request,
  res: Response
): Promise<void> {
  logger.info('[Robokassa Result] Received request:', req.body)

  // 1. Извлекаем параметры
  const { InvId, OutSum, SignatureValue } = req.body as {
    InvId?: string
    OutSum?: string
    SignatureValue?: string
    // ... другие параметры Robokassa
  }

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
  const robokassaPassword2 = process.env.ROBOKASSA_PASSWORD_2
  if (!robokassaPassword2) {
    logger.error('[Robokassa Result] Robokassa Password #2 is not configured!')
    res.status(500).send('Internal Server Error: Configuration missing')
    return
  }

  // 3. Валидируем подпись
  if (!validateRobokassaSignature(req.body, robokassaPassword2)) {
    logger.warn('[Robokassa Result] Invalid signature received', {
      InvId,
      SignatureValue,
      calculatedSignature: req.body, // Передаем все параметры для расчета
    })
    res.status(400).send('Bad Request: Invalid signature')
    return
  }

  logger.info(
    `[Robokassa Result] Signature validated successfully for InvId: ${invId}`
  )

  try {
    // 4. Ищем платеж в БД
    const { data: payment, error: paymentError } = await supabase
      .from('payments_v2')
      .select('*, users(telegram_id, username, language_code)') // Загружаем данные пользователя сразу
      .eq('inv_id', invId)
      .maybeSingle()

    if (paymentError) {
      logger.error(
        `[Robokassa Result] Error fetching payment for InvId: ${invId}`,
        paymentError
      )
      // Отвечаем OK, чтобы Robokassa не повторяла запрос
      res.status(200).send(`OK${invId}`)
      return
    }

    if (!payment) {
      logger.warn(`[Robokassa Result] Payment not found for InvId: ${invId}`)
      // Отвечаем OK, чтобы Robokassa не повторяла запрос
      res.status(200).send(`OK${invId}`)
      return
    }

    // Извлекаем данные для отправки уведомления
    const telegramId = payment.users?.telegram_id
    const botName = payment.bot_name
    const languageCode = payment.users?.language_code || 'ru' // Язык по умолчанию - русский

    // Проверяем наличие telegram_id и bot_name
    if (!telegramId || !botName) {
      logger.error(
        `[Robokassa Result] Missing telegram_id or bot_name in payment record for InvId: ${invId}`,
        { telegramId, botName }
      )
      // Отвечаем OK, чтобы Robokassa не повторяла запрос
      res.status(200).send(`OK${invId}`)
      return
    }

    logger.info(`[Robokassa Result] Found payment for InvId: ${invId}`, payment)

    // 5. Проверяем статус и сумму платежа
    if (payment.status === 'COMPLETED') {
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
      // Отвечаем OK, возможно, стоит обновить статус на FAILED или PENDING_VERIFICATION?
      res.status(200).send(`OK${invId}`)
      return
    }

    // 6. Обновляем статус платежа в БД
    const { error: updatePaymentError } = await supabase
      .from('payments_v2')
      .update({ status: 'COMPLETED' })
      .eq('inv_id', invId)

    if (updatePaymentError) {
      logger.error(
        `[Robokassa Result] Error updating payment status for InvId: ${invId}`,
        updatePaymentError
      )
      // Платеж прошел, но статус не обновился. Критично. Возможно, нужна очередь.
      // Пока отвечаем OK, но логируем ошибку.
      res.status(200).send(`OK${invId}`)
      return
    }

    logger.info(
      `[Robokassa Result] Payment status updated to COMPLETED for InvId: ${invId}`
    )

    // 7. Обновляем данные пользователя (баланс, подписка и т.д.)
    let notificationMessage = 'Платеж успешно обработан!' // Базовое сообщение
    try {
      if (payment.type === 'BALANCE_TOPUP') {
        await updateUserBalance(
          telegramId,
          payment.stars || payment.amount,
          'money_income',
          `Пополнение баланса через Robokassa (ID: ${payment.id})`,
          { payment_id: payment.id }
        )
        notificationMessage = `✅ Баланс пополнен на ${
          payment.stars || payment.amount
        } звезд.
Спасибо за покупку!`
      } else if (payment.type === 'SUBSCRIPTION_PURCHASE') {
        // Логика обновления подписки
        // await updateUserSubscription(telegramId, payment.subscription_details)
        logger.info(
          `[Robokassa Result] Subscription purchase logic placeholder for InvId: ${invId}`
        )
        notificationMessage = `✅ Подписка успешно оформлена/продлена.
Спасибо за покупку!`
      } else {
        logger.warn(
          `[Robokassa Result] Unknown payment type: ${payment.type} for InvId: ${invId}`
        )
      }

      // 8. Отправляем уведомление пользователю
      const botData = await createBotByName(botName)
      if (botData) {
        const { bot: tempBot } = botData
        try {
          await tempBot.telegram.sendMessage(telegramId, notificationMessage)
          logger.info(
            `[Robokassa Result] Notification sent to user ${telegramId} via bot ${botName} for InvId: ${invId}`
          )
        } catch (notifyError) {
          logger.error(
            `[Robokassa Result] Failed to send notification to ${telegramId} via bot ${botName} for InvId: ${invId}`,
            notifyError
          )
          // Ошибка отправки не критична для ответа Robokassa
        }
      } else {
        logger.error(
          `[Robokassa Result] Could not create bot instance for bot ${botName} to send notification for InvId: ${invId}`
        )
        // Ошибка создания бота не критична для ответа Robokassa
      }
    } catch (userDataUpdateError) {
      logger.error(
        `[Robokassa Result] Error updating user data for InvId: ${invId}`,
        userDataUpdateError
      )
      // Платеж зачислен, но данные пользователя не обновились! Нужна система ретраев.
      // Отвечаем OK, но логируем.
    }

    // 9. Отвечаем Robokassa
    logger.info(`[Robokassa Result] Sending OK response for InvId: ${invId}`)
    res.status(200).send(`OK${invId}`)
  } catch (error) {
    logger.error(
      `[Robokassa Result] Unhandled error processing InvId: ${invId}`,
      error
    )
    // Отвечаем OK, чтобы Robokassa не повторяла запрос
    res.status(200).send(`OK${invId}`)
  }
}
