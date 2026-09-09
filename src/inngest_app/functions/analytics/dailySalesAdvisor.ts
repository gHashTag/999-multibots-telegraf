import { inngest } from '../../inngestClient'
import { createInngestFailureHandler } from '@/inngest_app/client'
import { safeRecipient, skippedInSafeMode } from '@/inngest_app/safeMode'
import { supabaseAdmin } from '@/core/supabase'
import { logger } from '@/utils/logger'

const STAR_USD = 0.016
const USD_RUB = 91
const REAL_METHODS = [
  'Telegram',
  'Robokassa',
  'TON_NATIVE',
  'X402',
  'CryptoBot',
]

async function sendTelegram(chatId: string, text: string) {
  const token = process.env.BOT_TOKEN_1
  if (!token || !chatId) return
  const parts = text.match(/[\s\S]{1,4000}/g) || [text]
  for (const part of parts) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: part, parse_mode: 'HTML' }),
    }).catch(() => {})
  }
}

async function getRecentPayments(daysBack: number) {
  const since = new Date(Date.now() - daysBack * 86400000).toISOString()
  const all: any[] = []
  let offset = 0
  while (true) {
    const { data } = await supabaseAdmin
      .from('payments_v2')
      .select(
        'telegram_id,bot_name,type,amount,stars,currency,payment_method,service_type,created_at'
      )
      .gte('created_at', since)
      .range(offset, offset + 999)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

function toRub(r: any): number {
  const cur = r.currency || 'XTR'
  if (cur === 'RUB') return Number(r.amount) || 0
  return (Number(r.stars) || 0) * STAR_USD * USD_RUB
}

export const dailySalesAdvisor = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was 'daily-sales-advisor'.
    id: 'analytics-sales-advise',
    retries: 1,
    // Messages every bot owner → admin visibility on failure.
    onFailure: createInngestFailureHandler('analytics-sales-advise'),
  },
  { cron: '0 9 * * *' },
  async ({ event, step }) => {
    const avatars = await step.run('load-owners', async () => {
      const { data } = await supabaseAdmin
        .from('avatars')
        .select('telegram_id,bot_name')
      return data || []
    })

    const ownerBots = new Map<string, string[]>()
    for (const a of avatars) {
      const oid = String(a.telegram_id)
      if (!ownerBots.has(oid)) ownerBots.set(oid, [])
      ownerBots.get(oid)!.push(a.bot_name)
    }

    const payments7d = await step.run('load-payments-7d', () =>
      getRecentPayments(7)
    )
    const payments1d = await step.run('load-payments-1d', () =>
      getRecentPayments(1)
    )
    const payments2d = await step.run('load-payments-2d', () =>
      getRecentPayments(2)
    )

    for (const [ownerId, bots] of ownerBots) {
      await step.run(`report-${ownerId}`, async () => {
        let report = `📈 <b>Ежедневный отчёт</b>\n${new Date().toLocaleDateString('ru-RU')}\n\n`

        let totalRevToday = 0
        let totalRevYesterday = 0
        let totalCostWeek = 0
        const svcUsage: Record<string, number> = {}
        const uniqueUsersWeek = new Set<string>()
        const payingUsersWeek = new Set<string>()

        for (const bn of bots) {
          const inc1d = payments1d.filter(
            (p: any) =>
              p.bot_name === bn &&
              p.type === 'MONEY_INCOME' &&
              REAL_METHODS.includes(p.payment_method || '')
          )
          const inc_prev = payments2d.filter(
            (p: any) =>
              p.bot_name === bn &&
              p.type === 'MONEY_INCOME' &&
              REAL_METHODS.includes(p.payment_method || '') &&
              !payments1d.includes(p)
          )
          const out7d = payments7d.filter(
            (p: any) => p.bot_name === bn && p.type === 'MONEY_OUTCOME'
          )

          const rev1d = inc1d.reduce((s: number, r: any) => s + toRub(r), 0)
          const revPrev = inc_prev.reduce(
            (s: number, r: any) => s + toRub(r),
            0
          )
          const cost7d = out7d.reduce(
            (s: number, r: any) =>
              s + (Number(r.stars) || 0) * STAR_USD * USD_RUB,
            0
          )

          totalRevToday += rev1d
          totalRevYesterday += revPrev
          totalCostWeek += cost7d

          for (const r of out7d) {
            const svc = r.service_type || 'other'
            svcUsage[svc] = (svcUsage[svc] || 0) + 1
            if (r.telegram_id) uniqueUsersWeek.add(String(r.telegram_id))
          }
          for (const r of inc1d) {
            if (r.telegram_id) payingUsersWeek.add(String(r.telegram_id))
          }

          if (rev1d > 0 || cost7d > 100) {
            report += `🤖 <b>@${bn}</b>\n`
            report += `  💰 Сегодня: ${Math.round(rev1d).toLocaleString('ru-RU')}₽\n`
            report += `  💸 Расход AI (7дн): ${Math.round(cost7d).toLocaleString('ru-RU')}₽\n\n`
          }
        }

        const trend =
          totalRevYesterday > 0
            ? ((totalRevToday - totalRevYesterday) / totalRevYesterday) * 100
            : 0
        const trendIcon = trend > 5 ? '↑' : trend < -5 ? '↓' : '→'
        const avgCheck =
          payingUsersWeek.size > 0 ? totalRevToday / payingUsersWeek.size : 0
        const conversion =
          uniqueUsersWeek.size > 0
            ? (payingUsersWeek.size / uniqueUsersWeek.size) * 100
            : 0

        report += `💰 <b>ИТОГО:</b>\n`
        report += `  Выручка 24ч: ${Math.round(totalRevToday).toLocaleString('ru-RU')}₽ (${trendIcon}${Math.abs(trend).toFixed(0)}%)\n`
        report += `  Средний чек: ${Math.round(avgCheck).toLocaleString('ru-RU')}₽\n`
        report += `  Конверсия: ${conversion.toFixed(0)}% (${payingUsersWeek.size}/${uniqueUsersWeek.size})\n`
        report += `  Себестоимость 7дн: ${Math.round(totalCostWeek).toLocaleString('ru-RU')}₽\n\n`

        // Топ сервисы
        const topSvcs = Object.entries(svcUsage)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
        if (topSvcs.length > 0) {
          report += `📊 <b>Топ сервисы:</b>\n`
          for (const [svc, cnt] of topSvcs) {
            report += `  ${svc}: ${cnt} операций\n`
          }
          report += '\n'
        }

        // Неиспользуемые сервисы
        const allSvcs = [
          'neuro_photo',
          'image_to_video',
          'text_to_video',
          'text_to_image',
          'digital_avatar_body',
          'face_swap',
          'lip_sync',
          'text_to_speech',
          'image_to_prompt',
        ]
        const unused = allSvcs.filter(s => !svcUsage[s])
        if (unused.length > 0) {
          report += `⚠️ <b>Не используются:</b> ${unused.join(', ')}\n\n`
        }

        // Рекомендации
        report += `📋 <b>РЕКОМЕНДАЦИИ:</b>\n`
        const todos: string[] = []

        if (totalRevToday === 0) {
          todos.push(
            '🔴 Нет продаж за 24ч — проверьте работоспособность бота и отправьте рассылку клиентам'
          )
        }
        if (conversion < 30 && uniqueUsersWeek.size > 5) {
          todos.push(
            `🔴 Конверсия ${conversion.toFixed(0)}% — слишком низкая. Добавьте промо-предложение или бесплатный пробник`
          )
        }
        if (totalCostWeek > totalRevToday * 7) {
          todos.push(
            '🟡 Себестоимость выше выручки — пересмотрите цены или ограничьте бесплатные генерации'
          )
        }
        if (unused.length >= 3) {
          todos.push(
            `🟡 ${unused.length} сервисов не используются — сделайте рассылку с примерами: ${unused.slice(0, 2).join(', ')}`
          )
        }
        if (trend < -20) {
          todos.push(
            '🟡 Выручка падает — запустите акцию или скидку для возврата клиентов'
          )
        }
        if (payingUsersWeek.size < 3) {
          todos.push(
            '🟢 Мало платящих клиентов — добавьте реферальную программу или бонус за первую оплату'
          )
        }
        todos.push(
          '🟢 Отправьте рассылку клиентам с новыми функциями бота (используйте /broadcast)'
        )

        if (todos.length === 0) {
          todos.push('✅ Всё хорошо! Продолжайте в том же духе')
        }

        for (let i = 0; i < Math.min(todos.length, 5); i++) {
          report += `${i + 1}. ${todos[i]}\n`
        }

        report += `\n💡 <i>Для рассылки клиентам используйте Inngest broadcast</i>`

        // Safe mode (manual invoke with {e2e_test:true} or INNGEST_SAFE_MODE=1):
        // never message real owners — redirect to ADMIN_CHAT_ID or skip.
        // Probe evidence: a manual invoke of this cron messaged 13 owners.
        const recipient = safeRecipient(event, ownerId)
        if (!recipient) {
          const skipped = skippedInSafeMode(`report-${ownerId}`)
          logger.warn('[DailySalesAdvisor] 🛡️ safe mode — send skipped', {
            ownerId,
            ...skipped,
          })
          return skipped
        }
        await sendTelegram(recipient, report)
        logger.info('[DailySalesAdvisor] Report sent', {
          ownerId,
          recipient,
          redirected: recipient !== ownerId,
          bots: bots.length,
        })
      })
    }

    return { success: true, owners: ownerBots.size }
  }
)
