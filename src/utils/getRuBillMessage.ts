import { LocalSubscription } from '@/types/subscription'
import { subscriptionTitles } from '@/scenes/getRuBillWizard/helper'

interface RuBillMessageParams {
  stars: number
  subscription?: LocalSubscription
  isRu: boolean
  invoiceURL: string
}

/**
 * Генерирует сообщение для оплаты в рублях
 */
export function getRuBillMessage({
  stars,
  subscription,
  isRu,
  invoiceURL,
}: RuBillMessageParams): {
  messageText: string
  inlineKeyboard: Array<Array<{ text: string; url: string }>>
} {
  const subscriptionTitle = subscription
    ? subscriptionTitles(subscription, isRu)
    : ''

  const messageText = isRu
    ? `<b>💳 ${subscription ? `Подписка ${subscriptionTitle}` : 'Пополнение баланса'}</b>\n` +
      `<b>💰 Сумма:</b> ${stars} ₽\n` +
      `<i>При проблемах с оплатой: @neuro_sage</i>`
    : `<b>💳 ${subscription ? `Subscription ${subscriptionTitle}` : 'Balance top-up'}</b>\n` +
      `<b>💰 Amount:</b> ${stars} RUB\n` +
      `<i>Payment support: @neuro_sage</i>`

  const inlineKeyboard = [
    [
      {
        text: isRu ? 'Оплатить' : 'Pay',
        url: invoiceURL,
      },
    ],
  ]

  return {
    messageText,
    inlineKeyboard,
  }
}
