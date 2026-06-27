import { handleBuy } from '@/handlers'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { PaymentMethod } from '@/interfaces/payments.interface'
import { generateUuidV4 } from '@/utils'
import { SubscriptionType } from '@/interfaces/subscription.interface'

import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { Markup } from 'telegraf'

export async function handleTopUp(ctx: MyContext) {
  await ctx.answerCbQuery()
  const telegramId = ctx.from?.id?.toString() || 'unknown'

  try {
    logger.info(
      '🌟 [handleTopUp] Начало обработки колбэка пополнения звездами',
      {
        telegramId,
        callbackData: (ctx.callbackQuery as any)?.data,
        currentScene: ctx.scene?.current?.id,
        sessionMode: ctx.session?.mode,
      }
    )

    const data = (ctx.callbackQuery as any)?.data
    logger.info('🌟 [handleTopUp] Полученные данные колбэка', {
      telegramId,
      data,
      callbackQuery: ctx.callbackQuery,
    })

    const isRu = isRussianFromState(ctx)
    logger.info('🌟 [handleTopUp] Вызываем handleBuy', {
      telegramId,
      data,
      isRu,
    })

    await handleBuy(ctx)

    logger.info(
      '🌟 [handleTopUp] handleBuy завершен успешно, выходим из сцены',
      {
        telegramId,
      }
    )

    await ctx.scene.leave()

    logger.info('✅ [handleTopUp] Успешно завершено', {
      telegramId,
    })
  } catch (error) {
    logger.error('❌ [handleTopUp] Ошибка обработки', {
      telegramId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Отправляем пользователю сообщение об ошибке
    const isRuError = isRussianFromState(ctx)
    await ctx.reply(
      isRuError
        ? 'Произошла ошибка при обработке платежа. Пожалуйста, попробуйте позже.'
        : 'An error occurred while processing the payment. Please try again later.'
    )
  }
}

export const handleTopUpWithAmount = async (
  ctx: MyContext,
  amount: number,
  subscription: SubscriptionType,
  provider: PaymentMethod
): Promise<boolean> => {
  try {
    const isRu = isRussianFromState(ctx)
    const paymentId = generateUuidV4()

    if (provider === PaymentMethod.CRYPTOBOT) {
      const response = await fetch('https://pay.crypt.bot/api/createInvoice', {
        method: 'POST',
        headers: {
          'Crypto-Pay-API-Token': process.env.CRYPTOBOT_API_TOKEN || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          asset: 'USDT',
          amount: amount.toString(),
          description: isRu
            ? `Пополнение баланса (${amount} звезд)`
            : `Top up balance (${amount} stars)`,
          paid_btn_name: 'callback',
          paid_btn_url: process.env.WEBHOOK_URL + '/payment-success',
          payload: JSON.stringify({
            paymentId,
            telegramId: ctx.from?.id?.toString(),
            subscription,
            provider,
            amount,
          }),
        }),
      })

      if (!response.ok) {
        logger.error('CryptoBot API error:', {
          status: response.status,
          statusText: response.statusText,
        })
        throw new Error('CryptoBot API error')
      }

      const data = await response.json()

      if (!data.ok) {
        logger.error('CryptoBot response error:', data)
        throw new Error('CryptoBot response error')
      }

      const paymentUrl = data.result.pay_url

      await ctx.reply(
        isRu
          ? `💳 Счет для оплаты создан!\n\n💰 Сумма: ${amount} USDT\n🆔 ID платежа: ${paymentId}`
          : `💳 Payment invoice created!\n\n💰 Amount: ${amount} USDT\n🆔 Payment ID: ${paymentId}`,
        Markup.inlineKeyboard([
          [Markup.button.url(isRu ? '💳 Оплатить' : '💳 Pay', paymentUrl)],
        ])
      )

      return true
    }

    return false
  } catch (error) {
    logger.error('Error in handleTopUp:', error)
    return false
  }
}
