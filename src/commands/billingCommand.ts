import { MyContext } from '@/interfaces'
import { ADMIN_IDS_ARRAY } from '@/config'
import { supabaseAdmin } from '@/core/supabase'
import { logger } from '@/utils/logger'
import {
  BillingPaymentRow,
  aiCostStars,
  incomeToStars,
  isRealClientIncome,
} from '@/utils/billingFilters'

const STAR_USD = 0.016
const USD_RUB = 91

const INCOME_COLUMNS =
  'telegram_id, amount, stars, currency, payment_method, status, category, is_system_payment'
const OUTCOME_COLUMNS =
  'stars, cost, service_type, status, category, is_system_payment, metadata'

interface BotReport {
  bot_name: string
  income_stars: number
  income_rub: number
  cost_stars: number
  cost_by_svc: Record<string, number>
  clients: Set<string>
}

/** Supabase отдаёт максимум 1000 строк за запрос — читаем страницами. */
async function fetchPayments(
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
      logger.error('Billing query failed', {
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

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('ru-RU')
}

async function getOwnerReport(ownerTelegramId: number): Promise<string> {
  const avatars = await supabaseAdmin
    .from('avatars')
    .select('bot_name')
    .eq('telegram_id', ownerTelegramId)

  if (!avatars.data || avatars.data.length === 0) {
    return '❌ Вы не являетесь владельцем ни одного бота'
  }

  const botNames = avatars.data.map((a: any) => a.bot_name)
  const reports: BotReport[] = []

  for (const bn of botNames) {
    const incData = await fetchPayments(bn, 'MONEY_INCOME', INCOME_COLUMNS)
    const outData = await fetchPayments(bn, 'MONEY_OUTCOME', OUTCOME_COLUMNS)

    let income_stars = 0
    let income_rub = 0
    const clients = new Set<string>()

    for (const r of incData) {
      if (!isRealClientIncome(r)) continue
      const stars = incomeToStars(r)
      if (stars <= 0) continue
      if ((r.currency || 'XTR').toUpperCase() === 'RUB') {
        income_rub += Number(r.amount) || 0
      } else {
        income_stars += stars
      }
      const tid = (r as { telegram_id?: string | number }).telegram_id
      if (tid) clients.add(String(tid))
    }

    let cost_stars = 0
    const cost_by_svc: Record<string, number> = {}
    for (const r of outData) {
      const cost = aiCostStars(r)
      if (cost <= 0) continue
      cost_stars += cost
      const svc = r.service_type || 'other'
      cost_by_svc[svc] = (cost_by_svc[svc] || 0) + cost
    }

    reports.push({
      bot_name: bn,
      income_stars,
      income_rub,
      cost_stars,
      cost_by_svc,
      clients,
    })
  }

  let total_inc_rub = 0
  let total_cost_rub = 0
  let msg = `📊 <b>Финансовый отчёт</b>\n\n`

  for (const r of reports) {
    const inc_rub = r.income_rub + r.income_stars * STAR_USD * USD_RUB
    const inc_usd = inc_rub / USD_RUB
    const cost_rub = r.cost_stars * STAR_USD * USD_RUB
    const cost_usd = r.cost_stars * STAR_USD
    const profit_rub = inc_rub - cost_rub
    const margin = inc_rub > 0 ? Math.round((profit_rub / inc_rub) * 100) : 0

    total_inc_rub += inc_rub
    total_cost_rub += cost_rub

    msg += `🤖 <b>@${r.bot_name}</b> (${r.clients.size} клиентов)\n\n`
    msg += `💰 <b>Доход от клиентов:</b>\n`
    if (r.income_stars > 0) {
      msg += `   Stars: ${fmtNum(r.income_stars)}⭐ = ${fmtNum(r.income_stars * STAR_USD * USD_RUB)}₽\n`
    }
    if (r.income_rub > 0) {
      msg += `   Robokassa: ${fmtNum(r.income_rub)}₽\n`
    }
    msg += `   <b>Итого: ${fmtNum(inc_rub)}₽ ($${fmtNum(inc_usd)})</b>\n\n`

    msg += `💸 <b>Себестоимость AI:</b>\n`
    const sorted = Object.entries(r.cost_by_svc).sort((a, b) => b[1] - a[1])
    for (const [svc, cost] of sorted.slice(0, 5)) {
      if (cost > 1) {
        msg += `   ${svc}: ${fmtNum(cost)}⭐ = ${fmtNum(cost * STAR_USD * USD_RUB)}₽\n`
      }
    }
    msg += `   <b>Итого: ${fmtNum(cost_rub)}₽ ($${fmtNum(cost_usd)})</b>\n\n`

    const st = margin > 50 ? '✅' : margin > 0 ? '⚠️' : '🔴'
    msg += `${st} Прибыль: <b>${fmtNum(profit_rub)}₽</b> (${margin}%)\n`
    msg += `⚠️ Долг платформе: <b>${fmtNum(cost_rub)}₽ ($${fmtNum(cost_usd)})</b>\n`
    msg += `─────────────────────\n\n`
  }

  const total_profit = total_inc_rub - total_cost_rub
  msg += `📋 <b>ИТОГО:</b>\n`
  msg += `💰 Доход: ${fmtNum(total_inc_rub)}₽ ($${fmtNum(total_inc_rub / USD_RUB)})\n`
  msg += `💸 Расход AI: ${fmtNum(total_cost_rub)}₽ ($${fmtNum(total_cost_rub / USD_RUB)})\n`
  msg += `📈 Прибыль: ${fmtNum(total_profit)}₽\n`
  msg += `⚠️ Задолженность: <b>${fmtNum(total_cost_rub)}₽</b>\n`
  msg += `\n🏢 <b>White-label:</b> настройте бот на /api/whitelabel/{botName}\n`

  return msg
}

async function getAllOwnersReport(): Promise<string> {
  const { data: avatars } = await supabaseAdmin
    .from('avatars')
    .select('telegram_id,bot_name')

  if (!avatars) return '❌ Нет данных'

  const owners = new Map<number, string[]>()
  for (const a of avatars) {
    const oid = Number(a.telegram_id)
    if (!owners.has(oid)) owners.set(oid, [])
    owners.get(oid)!.push(a.bot_name)
  }

  let msg = `📊 <b>Биллинг всех владельцев</b>\n\n`
  let total_debt = 0

  for (const [oid, bots] of owners) {
    let owner_debt = 0
    let owner_income_rub = 0

    for (const bn of bots) {
      const outData = await fetchPayments(bn, 'MONEY_OUTCOME', OUTCOME_COLUMNS)
      const cost = outData.reduce((s, r) => s + aiCostStars(r), 0)
      owner_debt += cost * STAR_USD * USD_RUB

      const incData = await fetchPayments(bn, 'MONEY_INCOME', INCOME_COLUMNS)
      for (const r of incData) {
        if (!isRealClientIncome(r)) continue
        const stars = incomeToStars(r)
        if (stars <= 0) continue
        if ((r.currency || 'XTR').toUpperCase() === 'RUB') {
          owner_income_rub += Number(r.amount) || 0
        } else {
          owner_income_rub += stars * STAR_USD * USD_RUB
        }
      }
    }

    total_debt += owner_debt
    const profit = owner_income_rub - owner_debt
    const st = profit > 0 ? '✅' : '🔴'

    msg += `${st} <b>${oid}</b> (${bots.join(', ')})\n`
    msg += `   Доход: ${fmtNum(owner_income_rub)}₽ | Долг: ${fmtNum(owner_debt)}₽ | Чист: ${fmtNum(profit)}₽\n\n`
  }

  msg += `\n⚠️ <b>Общий долг: ${fmtNum(total_debt)}₽ ($${fmtNum(total_debt / USD_RUB)})</b>`
  return msg
}

export async function handleBillingCommand(ctx: MyContext) {
  const userId = ctx.from?.id
  if (!userId) return

  try {
    await ctx.reply('📊 Загружаю финансовый отчёт...')

    const isAdmin = ADMIN_IDS_ARRAY.includes(userId)

    if (isAdmin) {
      const report = await getAllOwnersReport()
      const parts = report.match(/[\s\S]{1,4000}/g) || [report]
      for (const part of parts) {
        await ctx.reply(part, { parse_mode: 'HTML' })
      }
    } else {
      const report = await getOwnerReport(userId)
      const parts = report.match(/[\s\S]{1,4000}/g) || [report]
      for (const part of parts) {
        await ctx.reply(part, { parse_mode: 'HTML' })
      }
    }
  } catch (error) {
    logger.error('Billing command error', { error, userId })
    await ctx.reply('❌ Ошибка при формировании отчёта')
  }
}
