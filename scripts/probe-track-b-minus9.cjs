#!/usr/bin/env node
/**
 * READ-ONLY. Разбирает трек B аудита: строки с ровно -9 звёздами.
 *
 * Правило, выученное дорого: сначала МЕРЯЕМ ВЕСЬ НАБОР, потом делаем выводы.
 * Никаких LIMIT-выборок с последующей экстраполяцией — на этом я уже ошибся
 * в 80 раз (см. .claude/skills/vibee-stack-hard-won).
 *
 * Ничего не пишет. Только SELECT.
 */
const url = process.env.SUPABASE_URL.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

const COLS = [
  'id',
  'telegram_id',
  'payment_date',
  'amount',
  'stars',
  'cost',
  'currency',
  'type',
  'status',
  'service_type',
  'description',
  'category',
  'bot_name',
  'model_name',
  'is_system_payment',
  'is_test',
  'payment_method',
].join(',')

async function fetchAll(table, select, filter = '') {
  const out = []
  let from = 0
  for (;;) {
    const res = await fetch(
      `${url}/rest/v1/${table}?select=${select}${filter}`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Range: `${from}-${from + 999}`,
          'Range-Unit': 'items',
        },
      }
    )
    if (!res.ok) throw new Error(`${table} ${res.status}: ${await res.text()}`)
    const rows = await res.json()
    if (!rows.length) break
    out.push(...rows)
    if (rows.length < 1000) break
    from += 1000
  }
  return out
}

const n = x => Number(x ?? 0)

function tally(rows, keyFn) {
  const m = new Map()
  for (const r of rows) {
    const k = String(keyFn(r))
    m.set(k, (m.get(k) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

function show(title, pairs, limit = 12) {
  console.log(`\n  ${title}`)
  for (const [k, c] of pairs.slice(0, limit)) {
    console.log(`    ${String(c).padStart(6)}  ${k}`)
  }
  if (pairs.length > limit)
    console.log(`    ... ещё ${pairs.length - limit} значений`)
}

async function main() {
  console.log('Загружаю payments_v2 целиком...')
  const all = await fetchAll('payments_v2', COLS)
  console.log(`Всего строк: ${all.length}`)

  // --- Распределение отрицательных звёзд ---------------------------------
  const neg = all.filter(r => n(r.stars) < 0)
  console.log(`\nСтрок с отрицательными stars: ${neg.length}`)
  show(
    'топ значений stars (отрицательные)',
    tally(neg, r => n(r.stars)),
    15
  )

  // --- Трек B: ровно -9 --------------------------------------------------
  const m9 = all.filter(r => n(r.stars) === -9)
  console.log(`\n=== ТРЕК B: stars = -9 ровно ===`)
  console.log(`  строк: ${m9.length}`)
  if (!m9.length) return

  const users = new Set(m9.map(r => r.telegram_id))
  console.log(`  уникальных пользователей: ${users.size}`)
  console.log(`  сумма звёзд: ${m9.reduce((s, r) => s + n(r.stars), 0)}`)
  console.log(`  сумма amount: ${m9.reduce((s, r) => s + n(r.amount), 0)}`)
  console.log(`  сумма cost:   ${m9.reduce((s, r) => s + n(r.cost), 0)}`)

  show(
    'type',
    tally(m9, r => r.type)
  )
  show(
    'status',
    tally(m9, r => r.status)
  )
  show(
    'service_type',
    tally(m9, r => r.service_type)
  )
  show(
    'category',
    tally(m9, r => r.category)
  )
  show(
    'currency',
    tally(m9, r => r.currency)
  )
  show(
    'description',
    tally(m9, r => r.description)
  )
  show(
    'bot_name',
    tally(m9, r => r.bot_name)
  )
  show(
    'model_name',
    tally(m9, r => r.model_name)
  )
  show(
    'is_test',
    tally(m9, r => r.is_test)
  )
  show(
    'is_system_payment',
    tally(m9, r => r.is_system_payment)
  )
  show(
    'amount',
    tally(m9, r => r.amount)
  )
  show(
    'cost',
    tally(m9, r => r.cost)
  )

  const dates = m9.map(r => String(r.payment_date).slice(0, 10)).sort()
  console.log(`\n  диапазон дат: ${dates[0]} … ${dates[dates.length - 1]}`)
  show(
    'по месяцам',
    tally(m9, r => String(r.payment_date).slice(0, 7)).sort((a, b) =>
      a[0] < b[0] ? -1 : 1
    ),
    24
  )

  show(
    'на пользователя (сколько раз)',
    tally(m9, r => r.telegram_id),
    10
  )

  console.log('\n  пример строки:')
  console.log('   ', JSON.stringify(m9[0]))

  // --- Сравнение: как выглядит НОРМАЛЬНОЕ списание за ту же услугу -------
  const svc = tally(m9, r => r.service_type)[0]?.[0]
  if (svc && svc !== 'null' && svc !== 'undefined') {
    const same = all.filter(r => String(r.service_type) === svc)
    console.log(`\n=== Контроль: все строки service_type='${svc}' ===`)
    console.log(`  строк: ${same.length}`)
    show(
      '  stars',
      tally(same, r => n(r.stars)),
      15
    )
  }
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
