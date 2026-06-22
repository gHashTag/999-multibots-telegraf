/**
 * Bot Owner Billing Service
 * Tracks AI costs per bot, calculates owner debt, generates reports,
 * sends notifications, and auto-disables bots when debt is too high.
 */
import { logger } from '@/utils/logger'
import { supabaseAdmin } from '@/core/supabase'

// -- Types --

interface CostBreakdown { service_type: string; total_cost: number; count: number }

export interface DebtSummary {
  bot_name: string
  total_ai_costs: number
  total_owner_payments: number
  total_user_income: number
  debt: number
  breakdown: CostBreakdown[]
  incomeByMethod: Record<string, number>
}

type NotificationLevel = 'soft' | 'warning' | 'critical'

// -- Constants & state --

const notifHistory: Record<string, { level: NotificationLevel; ts: number }> = {}
const DAY = 86_400_000
const THREE_DAYS = 3 * DAY
const WEEK = 7 * DAY
let firstRunSkipped = false

// -- Helpers --

function fmt(n: number): string { return Math.round(n).toLocaleString('ru-RU') + '⭐' }

function toStars(amount: number, currency?: string): number {
  if (!currency || currency === 'XTR') return amount
  if (currency === 'RUB') return Math.round(amount / 2.3) // ~2.3₽ per star
  if (currency === 'USDC' || currency === 'USDT_TON') return Math.round(amount / 0.016) // $0.016 per star
  if (currency === 'TON') return Math.round(amount * 3.5 / 0.016) // ~$3.5 per TON
  return amount
}

function fmtMultiCurrency(amount: number, currency?: string): string {
  if (!currency || currency === 'XTR') return fmt(amount)
  if (currency === 'RUB') return `${Math.round(amount).toLocaleString('ru-RU')}₽ (≈${fmt(toStars(amount, 'RUB'))})`
  if (currency === 'USDC' || currency === 'USDT_TON') return `$${amount.toFixed(2)} (≈${fmt(toStars(amount, currency))})`
  if (currency === 'TON') return `${amount.toFixed(2)} TON (≈${fmt(toStars(amount, 'TON'))})`
  return fmt(amount)
}

async function getOwnerTelegramIds(botName: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('avatars').select('telegram_id').eq('bot_name', botName)
  if (error || !data) return []
  return data.map((r: { telegram_id: string }) => r.telegram_id).filter(Boolean)
}

async function tgSend(chatId: string, text: string, markup?: object): Promise<void> {
  const token = process.env.BOT_TOKEN_1
  if (!token) return
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' }
  if (markup) body.reply_markup = markup
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    logger.error('[Billing] tg send failed', {
      chatId, error: err instanceof Error ? err.message : String(err),
    })
  }
}

// -- 1. calculateOwnerDebt --

export async function calculateOwnerDebt(botName: string): Promise<DebtSummary> {
  // AI costs (MONEY_OUTCOME)
  const { data: costsRaw, error: costsErr } = await supabaseAdmin
    .from('payments_v2').select('amount, service_type')
    .eq('bot_name', botName).eq('type', 'MONEY_OUTCOME')
  if (costsErr) logger.error('[Billing] costs query fail', { botName, error: costsErr.message })

  const costs = costsRaw ?? []
  const total_ai_costs = costs.reduce(
    (s: number, r: { amount: number }) => s + (Number(r.amount) || 0), 0,
  )

  // Breakdown by service_type
  const bm: Record<string, { total_cost: number; count: number }> = {}
  for (const row of costs) {
    const st = (row as { service_type?: string }).service_type || 'other'
    if (!bm[st]) bm[st] = { total_cost: 0, count: 0 }
    bm[st].total_cost += Number(row.amount) || 0
    bm[st].count += 1
  }
  const breakdown = Object.entries(bm).map(([service_type, v]) => ({ service_type, ...v }))

  // Owner payments (table may not exist yet)
  let total_owner_payments = 0
  try {
    const { data, error } = await supabaseAdmin
      .from('owner_payments').select('amount_stars').eq('bot_name', botName)
    if (!error && data) {
      total_owner_payments = data.reduce(
        (s: number, r: { amount_stars: number }) => s + (Number(r.amount_stars) || 0), 0,
      )
    }
  } catch { /* owner_payments table may not exist */ }

  // User income (MONEY_INCOME) — all currencies normalized to stars
  const { data: incRaw } = await supabaseAdmin
    .from('payments_v2').select('stars, currency, amount')
    .eq('bot_name', botName).eq('type', 'MONEY_INCOME')
  let total_user_income = 0
  const incomeByMethod: Record<string, number> = {}
  for (const r of (incRaw ?? []) as { stars: number; currency?: string; amount?: number }[]) {
    const cur = r.currency || 'XTR'
    const starsValue = cur === 'XTR'
      ? (Number(r.stars) || 0)
      : toStars(Number(r.amount || r.stars) || 0, cur)
    total_user_income += starsValue
    incomeByMethod[cur] = (incomeByMethod[cur] || 0) + (Number(r.amount || r.stars) || 0)
  }

  return {
    bot_name: botName, total_ai_costs, total_owner_payments,
    total_user_income, debt: total_ai_costs - total_owner_payments,
    breakdown, incomeByMethod,
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
    .map(([cur, v]) => `  • ${cur === 'XTR' ? 'Telegram Stars' : cur === 'RUB' ? 'Рубли' : cur}: ${fmtMultiCurrency(v, cur)}`)
    .join('\n')

  const profit = s.total_user_income - s.total_ai_costs
  const pct = s.total_user_income > 0 ? Math.round((profit / s.total_user_income) * 100) : 0

  let r = `📊 <b>Отчёт по боту @${s.bot_name}</b>\n\n`
  r += `💰 <b>Доходы от пользователей:</b> ${fmt(s.total_user_income)}\n`
  if (incomeLines) r += incomeLines + '\n'
  r += `\n💸 <b>Расходы на AI:</b> ${fmt(s.total_ai_costs)}\n`
  if (costLines) r += costLines + '\n'
  r += `\n📈 <b>Ваша прибыль:</b> ${fmt(profit)} (${pct}%)\n`
  if (s.total_owner_payments > 0) r += `✅ Оплачено платформе: ${fmt(s.total_owner_payments)}\n`
  if (s.debt > 0) {
    r += `\n⚠️ <b>Задолженность: ${fmt(s.debt)}</b>\n`
    r += '💳 Оплатите чтобы бот продолжал работать'
  } else {
    r += '\n✅ Задолженности нет — всё оплачено!'
  }
  return r
}

// -- 3. notifyOwnerAboutDebt --

export async function notifyOwnerAboutDebt(
  botName: string, debt: number, level: NotificationLevel,
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
    suffix = '\n\n⚠️ <b>Внимание!</b> Оплатите задолженность чтобы избежать отключения бота.'
    markup = { inline_keyboard: [[{ text: '💳 Оплатить', callback_data: `billing_pay_${botName}` }]] }
  } else {
    suffix = '\n\n🛑 <b>КРИТИЧЕСКИ!</b> Бот будет отключён через 24 часа если задолженность не будет оплачена.'
    markup = { inline_keyboard: [[{ text: '💳 Оплатить сейчас', callback_data: `billing_pay_${botName}` }]] }
  }

  for (const oid of owners) await tgSend(oid, report + suffix, markup)
  notifHistory[botName] = { level, ts: Date.now() }
  logger.info('[Billing] Owner notified', { botName, level, debt })
}

// -- 4. disableBot --

export async function disableBot(botName: string): Promise<boolean> {
  try {
    const { getBotInstances } = await import('@/index')
    const target = getBotInstances().find(b => b.botInfo?.username === botName)
    if (!target) {
      logger.warn('[Billing] Bot instance not found for disable', { botName })
      return false
    }
    await target.stop()
    logger.warn('[Billing] Bot disabled due to debt', { botName })

    const owners = await getOwnerTelegramIds(botName)
    for (const oid of owners) {
      await tgSend(oid, `🛑 <b>Бот @${botName} отключён</b>\n\nПричина: неоплаченная задолженность платформе.\nОплатите задолженность для возобновления работы.`)
    }
    return true
  } catch (err) {
    logger.error('[Billing] Failed to disable bot', {
      botName, error: err instanceof Error ? err.message : String(err),
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

  const { data: bots, error } = await supabaseAdmin.from('avatars').select('bot_name')
  if (error || !bots) {
    logger.error('[Billing] Failed to fetch bots', { error: error?.message })
    return
  }

  const botNames = [...new Set(bots.map((b: { bot_name: string }) => b.bot_name).filter(Boolean))]

  for (const botName of botNames) {
    try {
      const { debt } = await calculateOwnerDebt(botName)
      const prev = notifHistory[botName]
      const now = Date.now()

      if (debt > 500) {
        const shouldNotify = !prev || prev.level !== 'critical' || now - prev.ts > THREE_DAYS
        if (shouldNotify) await notifyOwnerAboutDebt(botName, debt, 'critical')
        if (prev?.level === 'critical' && now - prev.ts > THREE_DAYS) await disableBot(botName)
      } else if (debt > 300) {
        if (!prev || now - prev.ts > THREE_DAYS) await notifyOwnerAboutDebt(botName, debt, 'warning')
      } else if (debt > 100) {
        if (!prev || now - prev.ts > WEEK) await notifyOwnerAboutDebt(botName, debt, 'soft')
      }
    } catch (err) {
      logger.error('[Billing] Error checking bot', {
        botName, error: err instanceof Error ? err.message : String(err),
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
    logger.error('[Billing] Initial check failed', { error: err instanceof Error ? err.message : String(err) }),
  )
  billingInterval = setInterval(() => {
    runBillingCheck().catch(err =>
      logger.error('[Billing] Scheduled check failed', { error: err instanceof Error ? err.message : String(err) }),
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
