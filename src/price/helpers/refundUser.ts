import { MyContext } from '@/interfaces'
import { getUserBalance, getReferalsCountAndUserData } from '@/core/supabase'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { createMainMenuKeyboard } from '@/navigation'
import { PaymentType } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

/**
 * Почему деньги вернули. Раньше этого не записывалось, и по данным нельзя было
 * отличить «человек передумал» от «у нас не получилось».
 *
 * Цена незнания: 171 возврат у 126 человек, из них 89 за один декабрь 2025 —
 * месяц, когда возвращаемость упала с 25% до 12%. Что это было — всплеск
 * отказов генерации или всплеск нажатий «Отмена» — установить УЖЕ НЕЛЬЗЯ.
 * Обе дороги писали одну и ту же строку «Refund for cancelled generation».
 *
 * Отдельно: у возвратов в реестре `service_type` всегда пуст — updateUserBalance
 * заполняет его только для списаний. Поэтому услуга кладётся в metadata.
 */
export type RefundReason =
  /** Человек нажал «Отмена». */
  | 'user_cancelled'
  /** Генерация не удалась целиком. */
  | 'generation_failed'
  /** Часть картинок из пачки не получилась. */
  | 'partial_failure'

export interface RefundOptions {
  /** Не писать человеку сообщение о возврате. */
  silent?: boolean
  /** Обязателен: без него возврат снова станет неотличимым. */
  reason: RefundReason
  /** Что именно генерировали — в реестр попадёт через metadata. */
  service?: string
}

export async function refundUser(
  ctx: MyContext,
  paymentAmount: number,
  options: RefundOptions
) {
  const { silent = false, reason, service } = options
  if (!ctx.from) {
    console.error('refundUser: ctx.from is undefined')
    return
  }
  const telegramIdStr = ctx.from.id.toString()
  const amountToRefund = Number(paymentAmount)

  const initialBalance = await getUserBalance(telegramIdStr)

  if (initialBalance === null) {
    console.error(
      `refundUser: Failed to get initial balance for ${telegramIdStr}`
    )
    return
  }

  // Добавляем bot_name
  const bot_name = ctx.botInfo?.username || 'unknown_bot'

  const transactionResult = await updateUserBalance(
    telegramIdStr,
    amountToRefund,
    PaymentType.MONEY_INCOME,
    `Refund (${reason})`,
    {
      bot_name: bot_name,
      refund_reason: reason,
      refund_service: service ?? ctx.session?.mode ?? null,
    } as any
  )

  // Проверяем булевый результат напрямую
  if (!transactionResult) {
    console.error(
      `refundUser: Failed to update balance for ${telegramIdStr}. Update function returned false.`
    )

    // ✅ Only send error message if NOT in silent mode
    if (!silent) {
      await ctx.reply(
        isRussianFromState(ctx)
          ? 'Не удалось вернуть средства. Обратитесь в поддержку.'
          : 'Failed to refund. Please contact support.'
      )
    }
    return
  }

  const newBalance = await getUserBalance(telegramIdStr)

  if (newBalance === null) {
    console.error(
      `refundUser: Failed to get new balance for ${telegramIdStr} after refund`
    )
  }

  const { count, subscriptionType, level } = await getReferalsCountAndUserData(
    telegramIdStr
  )

  const isRu = isRussianFromState(ctx)

  const displayBalance =
    newBalance !== null ? newBalance : initialBalance + amountToRefund

  // ✅ Only send success message if NOT in silent mode
  if (!silent) {
    // Человеку важно знать, вернули ли деньги потому, что ОН отменил, или
    // потому, что у НАС не вышло. Второе — повод извиниться, а не отчитаться.
    const headline =
      reason === 'user_cancelled'
        ? isRu
          ? 'Возвращено звёзд за отменённую генерацию'
          : 'Stars refunded for the cancelled generation'
        : isRu
          ? 'Генерация не удалась, звёзды возвращены'
          : 'Generation failed, stars refunded'

    await ctx.reply(
      `${headline}: ${amountToRefund.toFixed(2)} ⭐️\n${
        isRu ? 'Текущий баланс' : 'Current balance'
      }: ${displayBalance.toFixed(2)} ⭐️`,
      createMainMenuKeyboard(ctx)
    )
  }
}
