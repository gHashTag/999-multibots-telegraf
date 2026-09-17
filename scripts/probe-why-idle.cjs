#!/usr/bin/env node
/**
 * READ-ONLY. Где обрывается путь человека.
 *
 * Зачем. Продукт почти не используется: последний промпт 7 августа, последний
 * ассет 18 июня, последнее обучение 19 марта. Прежде чем что-то чинить, надо
 * понять, ЧТО именно произошло: люди перестали приходить, приходят но не
 * доходят до генерации, или доходят но генерация не срабатывает.
 *
 * Это три разные болезни с тремя разными лекарствами.
 *
 * Считаем по месяцам, по ЛЮДЯМ (не по строкам):
 *   1. сколько новых профилей заводилось
 *   2. сколько людей платило (доход) и сколько тратило (расход)
 *   3. сколько людей доходило до генерации (промпты)
 *   4. доля тех, кто завёл профиль и ни разу ничего не сделал
 *   5. по ботам — какой умер, какой жив
 *
 * Ничего не пишет.
 */
const url = process.env.SUPABASE_URL.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: key, Authorization: `Bearer ${key}` }

async function fetchAll(table, select) {
  const out = []
  let from = 0
  for (;;) {
    const res = await fetch(`${url}/rest/v1/${table}?select=${select}`, {
      headers: { ...H, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
    })
    if (!res.ok) {
      console.log(`  (${table} недоступна: ${res.status})`)
      return out
    }
    const rows = await res.json()
    if (!Array.isArray(rows) || !rows.length) break
    out.push(...rows)
    if (rows.length < 1000) break
    from += 1000
  }
  return out
}

const month = ts => (ts ? String(ts).slice(0, 7) : null)
const n = x => Number(x ?? 0)

/** Уникальные значения по месяцам: Map<месяц, Set<кто>> */
function byMonth(rows, tsField, idField, filter = () => true) {
  const m = new Map()
  for (const r of rows) {
    if (!filter(r)) continue
    const k = month(r[tsField])
    if (!k) continue
    if (!m.has(k)) m.set(k, new Set())
    m.get(k).add(String(r[idField]))
  }
  return m
}

const get = (m, k) => (m.get(k) ? m.get(k).size : 0)

async function main() {
  const users = await fetchAll('users', 'telegram_id,created_at,bot_name')
  const pay = await fetchAll(
    'payments_v2',
    'telegram_id,payment_date,type,status,stars,bot_name,service_type'
  )
  const prompts = await fetchAll(
    'prompts_history',
    'telegram_id,created_at,bot_name,status'
  )

  console.log(
    `профилей ${users.length}, платежей ${pay.length}, промптов ${prompts.length}\n`
  )

  const newUsers = byMonth(users, 'created_at', 'telegram_id')
  const payers = byMonth(
    pay,
    'payment_date',
    'telegram_id',
    r =>
      r.status === 'COMPLETED' && r.type !== 'MONEY_OUTCOME' && n(r.stars) > 0
  )
  const spenders = byMonth(
    pay,
    'payment_date',
    'telegram_id',
    r => r.status === 'COMPLETED' && r.type === 'MONEY_OUTCOME'
  )
  const creators = byMonth(prompts, 'created_at', 'telegram_id')

  const months = [
    ...new Set([
      ...newUsers.keys(),
      ...payers.keys(),
      ...spenders.keys(),
      ...creators.keys(),
    ]),
  ]
    .filter(Boolean)
    .sort()

  console.log('=== По месяцам: ЛЮДИ, а не строки ===')
  console.log(
    'месяц'.padEnd(9) +
      'новых'.padStart(7) +
      'платили'.padStart(9) +
      'тратили'.padStart(9) +
      'творили'.padStart(9)
  )
  for (const mo of months) {
    console.log(
      mo.padEnd(9) +
        String(get(newUsers, mo)).padStart(7) +
        String(get(payers, mo)).padStart(9) +
        String(get(spenders, mo)).padStart(9) +
        String(get(creators, mo)).padStart(9)
    )
  }

  // --- Сколько людей завели профиль и ничего не сделали -----------------
  console.log('\n=== Доходят ли до дела ===')
  const everSpent = new Set(
    pay
      .filter(p => p.status === 'COMPLETED' && p.type === 'MONEY_OUTCOME')
      .map(p => String(p.telegram_id))
  )
  const everCreated = new Set(prompts.map(p => String(p.telegram_id)))
  const silent = users.filter(
    u =>
      !everSpent.has(String(u.telegram_id)) &&
      !everCreated.has(String(u.telegram_id))
  )
  console.log(`  профилей всего:        ${users.length}`)
  console.log(`  хоть раз тратили:      ${everSpent.size}`)
  console.log(`  хоть раз генерировали: ${everCreated.size}`)
  console.log(
    `  завели и НИЧЕГО:       ${silent.length} (${Math.round((silent.length / users.length) * 100)}%)`
  )

  // --- Кто из ботов ещё жив --------------------------------------------
  console.log('\n=== Последняя активность по ботам (по списаниям) ===')
  const lastByBot = new Map()
  for (const p of pay) {
    if (p.status !== 'COMPLETED' || p.type !== 'MONEY_OUTCOME') continue
    const b = String(p.bot_name || '—')
    const d = String(p.payment_date || '')
    if (!lastByBot.has(b) || lastByBot.get(b).last < d) {
      lastByBot.set(b, { last: d, n: 0 })
    }
    lastByBot.get(b).n++
  }
  for (const [b, v] of [...lastByBot.entries()].sort((a, b2) =>
    b2[1].last.localeCompare(a[1].last)
  )) {
    console.log(
      `  ${b.padEnd(28)} последнее ${v.last.slice(0, 10)}  всего ${v.n}`
    )
  }

  // --- Что именно генерировали в последний живой период -----------------
  console.log('\n=== Что заказывали за последние 12 месяцев (списания) ===')
  const cut = '2025-09'
  const svc = {}
  for (const p of pay) {
    if (p.status !== 'COMPLETED' || p.type !== 'MONEY_OUTCOME') continue
    if (month(p.payment_date) < cut) continue
    const k = String(p.service_type || '—')
    svc[k] = svc[k] || { n: 0, stars: 0, people: new Set() }
    svc[k].n++
    svc[k].stars += n(p.stars)
    svc[k].people.add(String(p.telegram_id))
  }
  const rows = Object.entries(svc).sort((a, b) => b[1].stars - a[1].stars)
  console.log(
    '  услуга'.padEnd(28) +
      'раз'.padStart(6) +
      'людей'.padStart(7) +
      'звёзд'.padStart(10)
  )
  for (const [k, v] of rows.slice(0, 12)) {
    console.log(
      `  ${k.padEnd(26)}${String(v.n).padStart(6)}${String(v.people.size).padStart(7)}${String(Math.round(v.stars)).padStart(10)}`
    )
  }
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
