/**
 * Bot Owner Billing Service
 * Tracks AI costs per bot, calculates owner debt, generates reports,
 * sends notifications, and auto-disables bots when debt is too high.
 */
import { logger } from '@/utils/logger'
import { supabaseAdmin } from '@/core/supabase'
import { telegramApiFor } from '@/services/telegramApi'
import {
  BillingPaymentRow,
  aiCostStars,
  incomeNativeAmount,
  incomeToStars,
  isRealClientIncome,
  toStars,
} from '@/utils/billingFilters'

// -- Types --

interface CostBreakdown {
  service_type: string
  total_cost: number
  count: number
}

export interface DebtSummary {
  bot_name: string
  total_ai_costs: number
  total_owner_payments: number
  /**
   * False when the owner_payments query did not answer -- the table is absent,
   * the request errored, or it threw. Payments are then UNKNOWN, not zero, and
   * `debt` below is an upper bound rather than a figure worth telling an owner.
   */
  payments_known: boolean
  total_user_income: number
  net_profit: number
  platform_share: number
  debt: number
  breakdown: CostBreakdown[]
  incomeByMethod: Record<string, number>
}

type NotificationLevel = 'soft' | 'warning' | 'critical'

// -- Constants & state --

const notifHistory: Record<string, { level: NotificationLevel; ts: number }> =
  {}
const DAY = 86_400_000
const THREE_DAYS = 3 * DAY
const WEEK = 7 * DAY
let firstRunSkipped = false

// -- Helpers --

const RUB_PER_STAR = 2.3

function fmt(n: number): string {
  return Math.round(n).toLocaleString('ru-RU') + '⭐'
}

/** Звёзды + эквивалент в рублях — владельцы считают в рублях. */
function fmtWithRub(n: number): string {
  return `${fmt(n)} (≈${Math.round(n * RUB_PER_STAR).toLocaleString('ru-RU')}₽)`
}

function fmtMultiCurrency(amount: number, currency?: string): string {
  if (!currency || currency === 'XTR' || currency === 'STARS')
    return fmt(amount)
  if (currency === 'RUB')
    return `${Math.round(amount).toLocaleString('ru-RU')}₽ (≈${fmt(toStars(amount, 'RUB'))})`
  if (currency === 'USDC' || currency === 'USDT_TON')
    return `$${amount.toFixed(2)} (≈${fmt(toStars(amount, currency))})`
  if (currency === 'TON')
    return `${amount.toFixed(2)} TON (≈${fmt(toStars(amount, 'TON'))})`
  return fmt(amount)
}

function currencyLabel(currency: string): string {
  if (currency === 'XTR' || currency === 'STARS') return 'Telegram Stars'
  if (currency === 'RUB') return 'Рубли'
  return currency
}

/**
 * Supabase отдаёт максимум 1000 строк за запрос — без пагинации отчёт
 * молча обрезается, как только у бота набирается больше тысячи транзакций.
 */
async function fetchAllRows(
  botName: string,
  type: 'MONEY_INCOME' | 'MONEY_OUTCOME',
  columns: string
): Promise<BillingPaymentRow[]> {
  const PAGE = 1000
  const rows: BillingPaymentRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('payments_v2')
      .select(columns)
      .eq('bot_name', botName)
      .eq('type', type)
      .range(offset, offset + PAGE - 1)
    if (error) {
      logger.error('[Billing] query fail', {
        botName,
        type,
        error: error.message,
      })
      break
    }
    if (!data || data.length === 0) break
    rows.push(...(data as unknown as BillingPaymentRow[]))
    if (data.length < PAGE) break
  }
  return rows
}

async function getOwnerTelegramIds(botName: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('avatars')
    .select('telegram_id')
    .eq('bot_name', botName)
  // A query failure and an owner-less bot are different facts, and the caller
  // logs the second one ("No owners found") for both. That message is false
  // when we simply could not look, and it is the only trace this path leaves.
  // Control flow is deliberately unchanged -- this is observability only.
  if (error) {
    logger.error('[Billing] owners query failed, treating as no owners', {
      botName,
      error: error.message,
    })
    return []
  }
  if (!data) return []
  return data.map((r: { telegram_id: string }) => r.telegram_id).filter(Boolean)
}

async function tgSend(
  chatId: string,
  text: string,
  markup?: object
): Promise<void> {
  const token = process.env.BOT_TOKEN_1
  if (!token) return
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  }
  if (markup) body.reply_markup = markup
  try {
    await fetch(`${telegramApiFor(token)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    logger.error('[Billing] tg send failed', {
      chatId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// -- 1. calculateOwnerDebt --

export async function calculateOwnerDebt(
  botName: string
): Promise<DebtSummary> {
  // AI costs (MONEY_OUTCOME) — считаем по колонке `cost` (себестоимость),
  // а НЕ по `amount`/`stars` (это цена для пользователя, а не наши затраты).
  const costs = await fetchAllRows(
    botName,
    'MONEY_OUTCOME',
    'stars, cost, service_type, status, category, is_system_payment, metadata'
  )

  const bm: Record<string, { total_cost: number; count: number }> = {}
  let total_ai_costs = 0
  for (const row of costs) {
    const cost = aiCostStars(row)
    if (cost <= 0) continue // служебные операции и незавершённые списания
    total_ai_costs += cost
    const st = row.service_type || 'other'
    if (!bm[st]) bm[st] = { total_cost: 0, count: 0 }
    bm[st].total_cost += cost
    bm[st].count += 1
  }
  const breakdown = Object.entries(bm).map(([service_type, v]) => ({
    service_type,
    ...v,
  }))

  // Owner payments (table may not exist yet).
  //
  // A failure here used to leave this at 0, which does not mean "the owner paid
  // nothing" -- it means we do not know what they paid. The difference reaches a
  // real person: debt is platform_share minus this, so a single failed query
  // bills the owner for the entire share, and above 500 that message repeats
  // every three days. Someone who has paid in full would be dunned by a bot,
  // unattended, on the strength of a network error.
  let total_owner_payments = 0
  let payments_known = false
  try {
    const { data, error } = await supabaseAdmin
      .from('owner_payments')
      .select('amount_stars')
      .eq('bot_name', botName)
    if (!error && data) {
      payments_known = true
      total_owner_payments = data.reduce(
        (s: number, r: { amount_stars: number }) =>
          s + (Number(r.amount_stars) || 0),
        0
      )
    } else if (error) {
      logger.warn(
        '[Billing] owner_payments unreadable — debt is an upper bound',
        {
          botName,
          error: error.message,
        }
      )
    }
  } catch (e) {
    logger.warn('[Billing] owner_payments threw — debt is an upper bound', {
      botName,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  // User income (MONEY_INCOME) — только реальные клиентские платежи.
  // Админские начисления, бонусы и системные корректировки доходом НЕ являются.
  const incomeRows = await fetchAllRows(
    botName,
    'MONEY_INCOME',
    'stars, amount, currency, payment_method, status, category, is_system_payment'
  )
  let total_user_income = 0
  const incomeByMethod: Record<string, number> = {}
  for (const r of incomeRows) {
    if (!isRealClientIncome(r)) continue
    const starsValue = incomeToStars(r)
    if (starsValue <= 0) continue
    total_user_income += starsValue
    const cur = (r.currency || 'XTR').toUpperCase()
    incomeByMethod[cur] = (incomeByMethod[cur] || 0) + incomeNativeAmount(r)
  }

  // Формула: доход - себестоимость = чистая прибыль. 50% прибыли → платформе.
  const net_profit = Math.max(0, total_user_income - total_ai_costs)
  const platform_share = Math.round(net_profit * 0.5)
  const debt = Math.max(0, platform_share - total_owner_payments)

  return {
    payments_known,
    bot_name: botName,
    total_ai_costs,
    total_owner_payments,
    total_user_income,
    debt,
    net_profit,
    platform_share,
    breakdown,
    incomeByMethod,
  }
}

// -- 2. generateDebtReport --

export async function generateDebtReport(botName: string): Promise<string> {
  const s = await calculateOwnerDebt(botName)
  const costLines = s.breakdown
    .sort((a, b) => b.total_cost - a.total_cost)
    .map(b => `  • ${b.service_type}: ${fmt(b.total_cost)} (${b.count} генер.)`)
    .join('\n')

  const incomeLines = Object.entries(s.incomeByMethod)
    .filter(([, v]) => v > 0)
    .map(([cur, v]) => `  • ${currencyLabel(cur)}: ${fmtMultiCurrency(v, cur)}`)
    .join('\n')

  let r = `📊 <b>Отчёт по боту @${s.bot_name}</b>\n\n`

  r += `━━━ <b>КАК СЧИТАЕМ</b> ━━━\n`
  r += `Доход − Себестоимость = Чистая прибыль\n`
  r += `Чистая прибыль делится 50/50\n`
  r += `50% вам, 50% платформе\n\n`

  r += `💰 <b>1. Доход от клиентов:</b> ${fmtWithRub(s.total_user_income)}\n`
  if (incomeLines) r += incomeLines + '\n'
  else r += `  • пока нет оплаченных заказов\n`

  r += `\n💸 <b>2. Себестоимость AI:</b> ${fmtWithRub(s.total_ai_costs)}\n`
  if (costLines) r += costLines + '\n'

  r += `\n📈 <b>3. Чистая прибыль:</b> ${fmtWithRub(s.net_profit)}\n`
  r += `   (${fmt(s.total_user_income)} − ${fmt(s.total_ai_costs)})\n`

  r += `\n━━━ <b>РАСПРЕДЕЛЕНИЕ 50/50</b> ━━━\n`
  r += `👤 Ваша доля (50%): <b>${fmtWithRub(s.net_profit - s.platform_share)}</b>\n`
  r += `🏢 Платформе (50%): <b>${fmtWithRub(s.platform_share)}</b>\n`

  if (s.total_owner_payments > 0)
    r += `\n✅ Уже оплачено: ${fmt(s.total_owner_payments)}\n`

  if (s.debt > 0) {
    r += `\n⚠️ <b>К оплате: ${fmtWithRub(s.debt)}</b>\n`
    r += `(${fmt(s.platform_share)} − ${fmt(s.total_owner_payments)} оплачено)`
  } else {
    r += '\n✅ Всё оплачено!'
  }
  return r
}

// -- 3. notifyOwnerAboutDebt --

export async function notifyOwnerAboutDebt(
  botName: string,
  debt: number,
  level: NotificationLevel
): Promise<void> {
  const owners = await getOwnerTelegramIds(botName)
  if (owners.length === 0) {
    logger.warn('[Billing] No owners found', { botName })
    return
  }

  const report = await generateDebtReport(botName)
  let suffix = ''
  let markup: object | undefined

  if (level === 'soft') {
    suffix = '\n\n💡 Рекомендуем оплатить задолженность заблаговременно.'
  } else if (level === 'warning') {
    suffix =
      '\n\n⚠️ <b>Внимание!</b> Оплатите задолженность чтобы избежать отключения бота.'
    markup = {
      inline_keyboard: [
        [{ text: '💳 Оплатить', callback_data: `billing_pay_${botName}` }],
      ],
    }
  } else {
    // Бот НЕ останавливается (см. disableBot) — не обещаем владельцу отключение.
    suffix =
      '\n\n🛑 <b>Просроченная задолженность.</b> Бот продолжает работать, но просим погасить долг платформе.'
    markup = {
      inline_keyboard: [
        [
          {
            text: '💳 Оплатить сейчас',
            callback_data: `billing_pay_${botName}`,
          },
        ],
      ],
    }
  }

  for (const oid of owners) await tgSend(oid, report + suffix, markup)
  notifHistory[botName] = { level, ts: Date.now() }
  logger.info('[Billing] Owner notified', { botName, level, debt })
}

// -- 4. disableBot --

// Bots are not stopped by billing anymore — owners receive warnings and reports,
// but service continues running. Disabling would stop all users from using the bot.
export async function disableBot(botName: string): Promise<boolean> {
  try {
    const { getBotInstances } = await import('@/index')
    const target = getBotInstances().find(b => b.botInfo?.username === botName)
    if (!target) {
      logger.warn('[Billing] Bot instance not found for disable', { botName })
      return false
    }
    // Keep the bot running — do NOT call target.stop(). Just notify owners.
    logger.warn('[Billing] Bot has debt but kept running', { botName })

    const owners = await getOwnerTelegramIds(botName)
    for (const oid of owners) {
      await tgSend(
        oid,
        `⚠️ <b>Бот @${botName} продолжает работать</b>\n\nОбнаружена неоплаченная задолженность платформе. Пожалуйста, погасите задолженность, чтобы избежать приостановки услуг.`
      )
    }
    return true
  } catch (err) {
    logger.error('[Billing] Failed to process debt bot', {
      botName,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

// -- 5. runBillingCheck --

export async function runBillingCheck(): Promise<void> {
  // Skip first run after restart to avoid spamming owners
  if (!firstRunSkipped) {
    firstRunSkipped = true
    logger.info('[Billing] Skipping first run after restart (anti-spam)')
    return
  }

  logger.info('[Billing] Running billing check...')

  const { data: bots, error } = await supabaseAdmin
    .from('avatars')
    .select('bot_name')
  if (error || !bots) {
    logger.error('[Billing] Failed to fetch bots', { error: error?.message })
    return
  }

  const botNames = [
    ...new Set(
      bots.map((b: { bot_name: string }) => b.bot_name).filter(Boolean)
    ),
  ]

  for (const botName of botNames) {
    try {
      const { debt, payments_known } = await calculateOwnerDebt(botName)
      const prev = notifHistory[botName]
      const now = Date.now()

      // Silence beats a false accusation. Without the payments figure `debt` is
      // an upper bound -- it assumes the owner paid nothing -- and every branch
      // below tells a person they owe money. Skipping costs at most a delayed
      // reminder; sending costs the trust of someone who already paid.
      if (!payments_known) {
        logger.warn('[Billing] skipping debt notice: payments unknown', {
          botName,
          debtUpperBound: debt,
        })
        continue
      }

      if (debt > 500) {
        const shouldNotify =
          !prev || prev.level !== 'critical' || now - prev.ts > THREE_DAYS
        if (shouldNotify) await notifyOwnerAboutDebt(botName, debt, 'critical')
        if (prev?.level === 'critical' && now - prev.ts > THREE_DAYS)
          await disableBot(botName)
      } else if (debt > 300) {
        if (!prev || now - prev.ts > THREE_DAYS)
          await notifyOwnerAboutDebt(botName, debt, 'warning')
      } else if (debt > 100) {
        if (!prev || now - prev.ts > WEEK)
          await notifyOwnerAboutDebt(botName, debt, 'soft')
      }
    } catch (err) {
      logger.error('[Billing] Error checking bot', {
        botName,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  logger.info('[Billing] Check complete', { botsChecked: botNames.length })
}

// -- 6. startBillingMonitor --

let billingInterval: ReturnType<typeof setInterval> | null = null

export function startBillingMonitor(intervalMs = DAY): void {
  logger.info('[Billing] Starting billing monitor', { intervalMs })
  runBillingCheck().catch(err =>
    logger.error('[Billing] Initial check failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  )
  billingInterval = setInterval(() => {
    runBillingCheck().catch(err =>
      logger.error('[Billing] Scheduled check failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    )
  }, intervalMs)
}

export function stopBillingMonitor(): void {
  if (billingInterval) {
    clearInterval(billingInterval)
    billingInterval = null
    logger.info('[Billing] Monitor stopped')
  }
}
