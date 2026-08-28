import { PaymentType } from '@/interfaces/payments.interface'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { logger } from '@/utils/logger'

/**
 * Вернуть звёзды и сказать человеку ПРАВДУ о том, вернулись ли они.
 *
 * ЗАЧЕМ. Пять мест в визардах делали так:
 *
 *     await updateUserBalance(telegramId, cost, MONEY_INCOME, '...refund...')
 *     await ctx.reply('❌ Ошибка. Средства возвращены.')
 *
 * Результат начисления не проверялся. А `updateUserBalance` возвращает false
 * в трёх случаях: не прошла проверка схемы, не удалась вставка и — измерено —
 * у человека нет строки в `users` (таких плательщиков 44,
 * docs/audit/ghost-payers.md). То есть бот сообщал «средства возвращены», не
 * зная этого, и никто бы не заметил: в журнале только обычная ошибка выше.
 *
 * Это тот же класс, что и возврат без списания (docs/audit/first-touch.md),
 * только зеркальный: там действовали, не проверив предыдущий шаг, здесь —
 * рассказывали о шаге, не проверив его.
 *
 * Отдельная функция, а не пять копий: копии расходятся молча — уже проверено
 * на зеркалировании файлов.
 */
export async function refundAndTell(params: {
  ctx: {
    reply: (text: string) => Promise<unknown>
    botInfo?: { username?: string }
  }
  telegramId: string
  amount: number
  /** Описание для реестра платежей. */
  description: string
  /** Что именно сорвалось — попадёт человеку в сообщение. */
  reason: { ru: string; en: string }
  isRu: boolean
  type?: PaymentType
}): Promise<boolean> {
  const { ctx, telegramId, amount, description, reason, isRu } = params
  const type = params.type ?? PaymentType.MONEY_INCOME

  const refunded = await updateUserBalance(
    telegramId,
    amount,
    type,
    description,
    {
      bot_name: ctx.botInfo?.username || 'unknown_bot',
    } as any
  )

  if (!refunded) {
    // Отдельная формулировка, чтобы поиск по журналу находил именно этот
    // случай, а не общую ошибку генерации выше.
    logger.error('💸❌ REFUND FAILED — деньги НЕ возвращены', {
      alert: 'ЧЕЛОВЕКУ НЕ ВЕРНУЛИ ЗВЁЗДЫ ПОСЛЕ НЕУДАЧНОЙ ГЕНЕРАЦИИ',
      telegram_id: telegramId,
      amount,
      description,
    })
  }

  const head = isRu ? reason.ru : reason.en
  await ctx.reply(
    refunded
      ? isRu
        ? `❌ ${head}. Средства возвращены.`
        : `❌ ${head}. Funds refunded.`
      : isRu
        ? `❌ ${head}. Вернуть звёзды автоматически не удалось — напишите в поддержку, приложив это сообщение.`
        : `❌ ${head}. Automatic refund failed — please contact support and quote this message.`
  )

  return refunded
}
