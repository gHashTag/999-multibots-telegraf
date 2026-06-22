import { MyContext } from '@/interfaces'
import { ADMIN_IDS_ARRAY } from '@/config'
import { supabaseAdmin } from '@/core/supabase'
import { logger } from '@/utils/logger'

const STAR_USD = 0.016
const USD_RUB = 91
const REAL_METHODS = new Set(['Telegram', 'Robokassa', 'TON_NATIVE', 'X402', 'CryptoBot'])

interface BotReport {
  bot_name: string
  income_stars: number
  income_rub: number
  cost_stars: number
  cost_by_svc: Record<string, number>
  clients: Set<string>
}

async function fetchAll(table: string, params: string): Promise<any[]> {
  const all: any[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(params)
      .range(offset, offset + 999)
    if (error || !data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  return all
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
    const income = await fetchAll('payments_v2',
      'telegram_id,amount,stars,currency,payment_method')
    const filteredIncome = income.filter((r: any) => r.bot_name === bn && REAL_METHODS.has(r.payment_method || ''))

    // Simpler: query per bot
    const { data: incData } = await supabaseAdmin
      .from('payments_v2')
      .select('telegram_id,amount,stars,currency,payment_method')
      .eq('bot_name', bn)
      .eq('type', 'MONEY_INCOME')

    const { data: outData } = await supabaseAdmin
      .from('payments_v2')
      .select('stars,service_type')
      .eq('bot_name', bn)
      .eq('type', 'MONEY_OUTCOME')

    let income_stars = 0
    let income_rub = 0
    const clients = new Set<string>()

    for (const r of (incData || [])) {
      const m = r.payment_method || ''
      if (!REAL_METHODS.has(m)) continue
      const cur = r.currency || 'XTR'
      if (cur === 'RUB') {
        income_rub += Number(r.amount) || 0
      } else {
        income_stars += Number(r.stars) || 0
      }
      if (r.telegram_id) clients.add(String(r.telegram_id))
    }

    let cost_stars = 0
    const cost_by_svc: Record<string, number> = {}
    for (const r of (outData || [])) {
      const s = Number(r.stars) || 0
      cost_stars += s
      const svc = r.service_type || 'other'
      cost_by_svc[svc] = (cost_by_svc[svc] || 0) + s
    }

    reports.push({ bot_name: bn, income_stars, income_rub, cost_stars, cost_by_svc, clients })
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
    const margin = inc_rub > 0 ? Math.round(profit_rub / inc_rub * 100) : 0

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
      const { data: outData } = await supabaseAdmin
        .from('payments_v2')
        .select('stars')
        .eq('bot_name', bn)
        .eq('type', 'MONEY_OUTCOME')

      const cost = (outData || []).reduce((s: number, r: any) => s + (Number(r.stars) || 0), 0)
      owner_debt += cost * STAR_USD * USD_RUB

      const { data: incData } = await supabaseAdmin
        .from('payments_v2')
        .select('amount,stars,currency,payment_method')
        .eq('bot_name', bn)
        .eq('type', 'MONEY_INCOME')

      for (const r of (incData || [])) {
        if (!REAL_METHODS.has(r.payment_method || '')) continue
        if ((r.currency || 'XTR') === 'RUB') {
          owner_income_rub += Number(r.amount) || 0
        } else {
          owner_income_rub += (Number(r.stars) || 0) * STAR_USD * USD_RUB
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
