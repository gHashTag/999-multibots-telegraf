import { MyContext } from '@/interfaces'
import { getUserBalance, getReferalsCountAndUserData } from '@/core/supabase'
import { updateUserBalanceUnlocked } from '@/core/supabase/updateUserBalance'
import { withUserBalanceLock } from '@/core/supabase/balanceLock'
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

/** Сколько назад ищем списание, за которое возвращаем. */
const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Есть ли за что возвращать.
 *
 * ИЗМЕРЕНО: из 171 возврата в реестре у 126 (74%) НЕТ НИ ОДНОГО списания
 * перед ним. Возврат за то, чего не платили, — это создание звёзд из воздуха:
 * 974 штуки у людей, которые до этого не потратили ничего.
 *
 * Откуда берётся. Ветка отказа зовёт возврат, не спрашивая, состоялось ли
 * списание. Самый частый случай — «недостаточно звёзд»: списания не было,
 * генерации не было, а возврат есть. В generateFluxKontext это заметили и
 * закрыли проверкой ТЕКСТА сообщения об ошибке; в остальных двадцати местах —
 * нет. Проверять текст, показанный человеку, — ненадёжно: достаточно
 * переписать формулировку.
 *
 * Здесь проверка одна на всех и по данным: должно быть списание за последние
 * сутки, и суммарно вернуть нельзя больше, чем по нему заплатили.
 *
 * ОТКАЗ ОТКРЫТЫЙ — намеренно, в отличие от промо. Асимметрия обратная: не
 * вернуть человеку его же деньги хуже, чем ошибочно создать восемь звёзд.
 * Поэтому при сбое самой проверки возврат выполняется, но пишется в журнал.
 */
async function hasChargeToRefund(
  telegramId: string,
  amount: number
): Promise<{ allowed: boolean; reason: string }> {
  try {
    const { supabase } = await import('@/core/supabase')
    const since = new Date(Date.now() - REFUND_WINDOW_MS).toISOString()

    const { data, error } = await supabase
      .from('payments_v2')
      .select('id,stars,type,payment_date,description')
      .eq('telegram_id', telegramId)
      .eq('status', 'COMPLETED')
      .gte('payment_date', since)
      .order('payment_date', { ascending: false })
      .limit(50)

    if (error)
      return { allowed: true, reason: `проверка не удалась: ${error.message}` }
    if (!data)
      return { allowed: true, reason: 'проверка не удалась: пустой ответ' }

    const charge = data.find(r => r.type === 'MONEY_OUTCOME')
    if (!charge)
      return { allowed: false, reason: 'за сутки нет ни одного списания' }

    // A prior refund is recognised by its TYPE first and by its prose only as a
    // fallback. The description test alone missed four of the seven real refund
    // sites in this repository: voiceTrainingRVC writes "Voice training failed -
    // refund", aiCoverWizard writes "AI Cover refund - error", and
    // musicGenerationWizard writes the word in Russian. For those, this sum came
    // out zero and the guard permitted a SECOND refund of the same charge.
    //
    // PaymentType.REFUND exists precisely to mark a refund, so it counts
    // unconditionally. MONEY_INCOME still needs the prose test, because top-ups
    // share that type and must never be mistaken for money already returned --
    // counting a top-up here would block a refund the user is owed.
    const isRefundRow = (r: { type?: unknown; description?: unknown }) => {
      if (String(r.type) === 'REFUND') return true
      if (String(r.type) === 'MONEY_OUTCOME') return false
      // The second alternative is the Russian word for "refund", spelled with
      // escapes: musicGenerationWizard writes its description in Russian, so
      // the pattern must contain it, and the repo requires source outside
      // string literals to stay ASCII.
      return /refund|\u0432\u043e\u0437\u0432\u0440\u0430\u0442/i.test(
        String(r.description || '')
      )
    }

    const alreadyReturned = data
      .filter(
        r =>
          isRefundRow(r) && String(r.payment_date) > String(charge.payment_date)
      )
      .reduce((s, r) => s + Number(r.stars ?? 0), 0)

    if (alreadyReturned + amount > Number(charge.stars ?? 0) + 0.01) {
      return {
        allowed: false,
        reason: `вернуть ${amount} поверх уже возвращённых ${alreadyReturned} больше списания ${charge.stars}`,
      }
    }

    return { allowed: true, reason: 'ок' }
  } catch (e) {
    return {
      allowed: true,
      reason: `проверка упала: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
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

  // The eligibility check and the credit run under ONE per-user lock so a
  // concurrent refund cannot pass hasChargeToRefund before this one has
  // credited. hasChargeToRefund nets prior refunds out of the charge, so the
  // second refund — running after the first credited — sees it and is refused,
  // instead of both crediting (finding 4 of the money audit, #999). The
  // *Unlocked balance impl is used because updateUserBalance would re-acquire
  // the same lock and deadlock. `null` = check refused (stay silent, as before);
  // `false` = credit failed; `true` = credited.
  const transactionResult = await withUserBalanceLock(
    telegramIdStr,
    async (): Promise<boolean | null> => {
      const check = await hasChargeToRefund(telegramIdStr, amountToRefund)
      if (!check.allowed) {
        console.error(
          `refundUser: возврат ОТКЛОНЁН для ${telegramIdStr} на ${amountToRefund} — ${check.reason}`
        )
        return null
      }
      if (check.reason !== 'ок') {
        console.error(`refundUser: возврат разрешён вслепую (${check.reason})`)
      }
      return updateUserBalanceUnlocked(
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
    }
  )

  // Refused check: silent, exactly as before (no reply, no error path).
  if (transactionResult === null) {
    return
  }

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

  const { count, subscriptionType, level } =
    await getReferalsCountAndUserData(telegramIdStr)

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
