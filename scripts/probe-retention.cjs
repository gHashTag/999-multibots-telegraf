#!/usr/bin/env node
/**
 * READ-ONLY. На каком шаге люди перестают возвращаться.
 *
 * Зачем. Приток разобран (docs/audit/why-idle.md): воронка цела, приходить
 * стало некому. Но возвращаемость упала независимо — с 62-64% летом 2025 до
 * 12-25% зимой. Это второй множитель того же числа.
 *
 * Проверяем четыре версии того, где обрывается возвращение:
 *   1. кончились звёзды и не пополнил — уход по исчерпании
 *   2. начал пополнять и не довёл — обрыв на оплате
 *   3. ушёл сразу после первой попытки — не понравился результат
 *   4. ушёл, имея деньги на счету — значит, дело не в деньгах
 *
 * Четвёртая версия — самая важная: если у ушедших остаются звёзды, никакая
 * работа с ценой и пополнением не поможет.
 *
 * Ничего не пишет.
 */
const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
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

const n = x => Number(x ?? 0)
const day = ts => String(ts || '').slice(0, 10)

/**
 * Days between a recorded day and NOW, or null when the day cannot be read.
 *
 * Named and lifted here so a control can call it with no credentials. The third
 * outcome is explicit on purpose: every comparison with NaN is false, so an
 * unreadable date used to slide past `daysSince < 60` and be reported as a
 * churned user.
 */
// `now` is passed in rather than defaulted: NOW lives inside main(), and a
// default parameter resolves in THIS function's scope, so defaulting to it
// would throw at the first call.
function daysBetween(lastDay, now) {
  const a = Date.parse(now)
  const b = Date.parse(lastDay)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((a - b) / 86400000)
}

/** Баланс по измеренной формуле: сумма COMPLETED, OUTCOME со знаком минус. */
function balance(rows) {
  return rows.reduce(
    (s, r) =>
      r.status !== 'COMPLETED'
        ? s
        : r.type === 'MONEY_OUTCOME'
          ? s - n(r.stars)
          : s + n(r.stars),
    0
  )
}

/**
 * The churn rule, checked without credentials.
 *
 * The number this section reports is "people who stopped spending", and an
 * unreadable last-spend date used to land in it: NaN fails every comparison, so
 * `daysSince < 60` was false and the person fell through into the churned list
 * carrying daysSince: NaN. The failure mode manufactures the finding.
 */
function selfCheck() {
  const NOW_T = '2026-08-20'
  if (daysBetween('2026-06-21', NOW_T) !== 60) {
    console.error(
      `самопроверка не прошла: расстояние в днях посчитано неверно ` +
        `(${daysBetween('2026-06-21', NOW_T)} вместо 60).`
    )
    process.exit(2)
  }
  if (daysBetween('2026-08-19', NOW_T) !== 1) {
    console.error('самопроверка не прошла: вчерашняя дата дала не 1 день.')
    process.exit(2)
  }
  // The defect: unreadable must be its own answer, never a number.
  for (const bad of ['not a date', '', null, undefined]) {
    if (daysBetween(bad, NOW_T) !== null) {
      console.error(
        `самопроверка не прошла: нечитаемая дата ${JSON.stringify(bad)} дала ` +
          `${daysBetween(bad, NOW_T)} вместо null — такой человек попадёт в «ушедшие».`
      )
      process.exit(2)
    }
  }
  // The half that lives inside main(): the caller must skip on null rather than
  // compare it. A behavioural control cannot reach it, so the source is asserted.
  const src = require('fs').readFileSync(__filename, 'utf8')
  if (!/daysSince === null\s*\)\s*\{\s*undatable\.push/.test(src)) {
    console.error(
      'самопроверка не прошла: нечитаемая дата снова падает в сравнение\n' +
        'вместо отдельного счёта — число ушедших завышается.'
    )
    process.exit(2)
  }
  console.log(
    'самопроверка: дни считаются верно, нечитаемая дата не выдаётся за ушедшего'
  )
}

selfCheck()

async function main() {
  const pay = await fetchAll(
    'payments_v2',
    'telegram_id,payment_date,type,status,stars,payment_method,service_type,description'
  )

  const byUser = new Map()
  for (const p of pay) {
    const k = String(p.telegram_id)
    if (!byUser.has(k)) byUser.set(k, [])
    byUser.get(k).push(p)
  }

  // Только настоящие пользователи: те, кто хоть раз что-то потратил.
  const spenders = [...byUser.entries()].filter(([, rows]) =>
    rows.some(r => r.status === 'COMPLETED' && r.type === 'MONEY_OUTCOME')
  )
  console.log(`людей, которые хоть раз тратили: ${spenders.length}\n`)

  // --- 1. С чем человек остался в момент ухода -------------------------
  console.log('=== Ушедшие: остались ли у них звёзды ===')
  const NOW = '2026-08-20'
  const gone = []
  const undatable = []
  for (const [uid, rows] of spenders) {
    const spends = rows
      .filter(r => r.status === 'COMPLETED' && r.type === 'MONEY_OUTCOME')
      .sort((a, b) =>
        String(a.payment_date).localeCompare(String(b.payment_date))
      )
    const last = spends[spends.length - 1]
    const lastDay = day(last.payment_date)
    // «Ушёл» — не тратил больше 60 дней.
    const daysSince = daysBetween(lastDay, NOW)
    // A last-spend date that will not parse yields NaN, and `NaN < 60` is
    // false -- so the person fell straight through into "churned", carrying
    // daysSince: NaN with them. That is "cannot tell", not sixty days of
    // silence, and it inflates the one number this section reports.
    if (daysSince === null) {
      undatable.push({ uid, lastDay })
      continue
    }
    if (daysSince < 60) continue
    gone.push({
      uid,
      lastDay,
      daysSince,
      balance: Math.round(balance(rows) * 100) / 100,
      spends: spends.length,
      lastService: String(last.service_type || '—'),
    })
  }
  console.log(
    `  ушедших (не тратят 60+ дней): ${gone.length} из ${spenders.length}`
  )
  if (undatable.length) {
    console.log(
      `  не поддаются оценке (дата последней траты не читается): ${undatable.length}` +
        ' — в число ушедших НЕ входят'
    )
  }

  const withMoney = gone.filter(g => g.balance >= 10)
  const broke = gone.filter(g => g.balance < 10)
  console.log(
    `  ушли, имея на счету 10+ звёзд:  ${withMoney.length} (${Math.round((withMoney.length / gone.length) * 100)}%)`
  )
  console.log(
    `  ушли почти без звёзд (<10):     ${broke.length} (${Math.round((broke.length / gone.length) * 100)}%)`
  )
  const sumLeft = withMoney.reduce((s, g) => s + g.balance, 0)
  console.log(`  всего звёзд осталось у ушедших: ${Math.round(sumLeft)}`)

  // --- 2. Сколько раз человек успевал попробовать -----------------------
  console.log('\n=== Сколько списаний человек сделал за всю жизнь ===')
  const buckets = { 1: 0, '2-3': 0, '4-10': 0, '11-50': 0, '51+': 0 }
  for (const [, rows] of spenders) {
    const c = rows.filter(
      r => r.status === 'COMPLETED' && r.type === 'MONEY_OUTCOME'
    ).length
    if (c === 1) buckets['1']++
    else if (c <= 3) buckets['2-3']++
    else if (c <= 10) buckets['4-10']++
    else if (c <= 50) buckets['11-50']++
    else buckets['51+']++
  }
  for (const [k, v] of Object.entries(buckets)) {
    console.log(
      `  ${k.padEnd(7)} ${String(v).padStart(4)} человек (${Math.round((v / spenders.length) * 100)}%)`
    )
  }

  // --- 3. Обрыв на оплате ----------------------------------------------
  console.log('\n=== Начал пополнять и не довёл ===')
  const pending = pay.filter(p => p.status !== 'COMPLETED')
  const pendingUsers = new Map()
  for (const p of pending) {
    const k = String(p.telegram_id)
    if (!pendingUsers.has(k)) pendingUsers.set(k, [])
    pendingUsers.get(k).push(p)
  }
  console.log(
    `  незавершённых попыток: ${pending.length} у ${pendingUsers.size} человек`
  )

  let neverPaid = 0
  let paidLater = 0
  for (const [uid, tries] of pendingUsers) {
    const rows = byUser.get(uid) || []
    const firstTry = tries.map(t => String(t.payment_date)).sort()[0]
    const completedAfter = rows.some(
      r =>
        r.status === 'COMPLETED' &&
        r.type !== 'MONEY_OUTCOME' &&
        String(r.payment_date) > firstTry
    )
    if (completedAfter) paidLater++
    else neverPaid++
  }
  console.log(`  из них потом всё же пополнили:  ${paidLater}`)
  console.log(`  так и не пополнили НИКОГДА:     ${neverPaid}`)

  const pmPend = {}
  for (const p of pending) {
    const k = String(p.payment_method)
    pmPend[k] = (pmPend[k] || 0) + 1
  }
  console.log(`  по способу оплаты: ${JSON.stringify(pmPend)}`)

  // --- 4. Что человек делал последним ----------------------------------
  console.log('\n=== Последняя услуга перед уходом (топ-10) ===')
  const lastSvc = {}
  for (const g of gone) {
    lastSvc[g.lastService] = (lastSvc[g.lastService] || 0) + 1
  }
  for (const [k, v] of Object.entries(lastSvc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)) {
    console.log(`  ${k.padEnd(24)} ${String(v).padStart(4)}`)
  }

  // --- 5. Кто ушёл с деньгами — крупнейшие ------------------------------
  console.log('\n=== Ушли с наибольшим остатком (10 человек) ===')
  for (const g of withMoney
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10)) {
    console.log(
      `  ${g.uid.padEnd(13)} остаток ${String(g.balance).padStart(9)}  последний раз ${g.lastDay} (${g.daysSince} дн назад), списаний ${g.spends}`
    )
  }
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
