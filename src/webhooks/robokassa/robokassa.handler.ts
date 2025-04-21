import { Request, Response } from 'express'

import { logger } from '@/utils/logger'
import { supabase, updateUserBalance } from '@/core/supabase'
import { validateRobokassaSignature } from './utils/validateSignature'
import { createBotByName } from '@/core/bot'

interface RobokassaRequestBody {
  InvId: string
  OutSum: string
  SignatureValue: string
  [key: string]: string
}

/**
 * Обрабатывает уведомления об успешном платеже от Robokassa (Result URL).
 */
export const handleRobokassaResult = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    logger.info('[Robokassa Result] Received request:', req.body)

    // Получаем параметры из тела запроса
    const { InvId, OutSum, SignatureValue } = req.body as {
      InvId?: string
      OutSum?: string
      SignatureValue?: string
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
    // --- DEBUG LOG --- Добавляем лог для проверки наличия PASSWORD2
    console.log(
      '[DEBUG] Checking process.env.PASSWORD2:',
      process.env.PASSWORD2
    )
    // --- END DEBUG LOG ---
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
        calculatedSignature: req.body, // Передаем все параметры для расчета
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
      res.status(200).send(`OK${invId}`)
      return
    }

    // ... остальная часть функции ...
  } catch (error) {
    logger.error('[Robokassa Result] Error:', error)
    res.status(500).send('Internal Server Error')
  }
}
