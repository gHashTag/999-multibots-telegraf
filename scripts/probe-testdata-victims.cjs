#!/usr/bin/env node
/**
 * READ-ONLY. Поимённый список тех, кого затронет удаление TEST_DATA.
 *
 * Считаем баланс ТОЙ ЖЕ формулой, что и настоящая get_user_balance:
 *   income + refund + bonus − outcome, только COMPLETED.
 * Формула восстановлена опытным путём (scripts/probe-balance-formula.cjs) —
 * определения функции нет в репозитории, она живёт внутри базы.
 *
 * Мерим ВЕСЬ набор, а не выборку. Прошлый раз оценка по LIMIT 4 занизила
 * ущерб в 80 раз.
 *
 * Ничего не пишет.
 */
// `|| ''` so the file LOADS without credentials: the matcher control below
// must be runnable with no production access at all. Without it the module
// dies on this line and the control never runs.
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
const r2 = x => Math.round(x * 100) / 100

// Та самая формула. Знак задаёт тип.
const balance = rows =>
  rows.reduce((s, r) => {
    if (r.status !== 'COMPLETED') return s
    return r.type === 'MONEY_OUTCOME' ? s - n(r.stars) : s + n(r.stars)
  }, 0)

const isTestData = r => /TEST_DATA/i.test(String(r.description || ''))

/**
 * Both matchers are pure functions of rows, so an invented sample controls them
 * with no credential and no production row -- the answer to "a live-data probe
 * cannot have a stable sample" (#1730).
 *
 * It matters most here: `balance` reproduces get_user_balance, whose definition
 * exists nowhere in this repository and lives only inside the database. If that
 * reduce quietly stopped subtracting outcomes, every person listed below would
 * come out RICHER than they are, and the output would read as reassuring rather
 * than broken.
 */
function selfCheck() {
  const sample = [
    { status: 'COMPLETED', type: 'MONEY_INCOME', stars: 100 },
    { status: 'COMPLETED', type: 'MONEY_OUTCOME', stars: 30 },
    { status: 'COMPLETED', type: 'MONEY_REFUND', stars: 5 },
    // Not COMPLETED: must not move the balance at all.
    { status: 'PENDING', type: 'MONEY_INCOME', stars: 999 },
  ]
  const got = balance(sample)
  if (got !== 75) {
    console.error(
      `самопроверка не прошла: формула баланса дала ${got}, ожидалось 75.\n` +
        'список ниже показывал бы неверные суммы у живых людей.'
    )
    process.exit(2)
  }
  // Each negative is rejected by a DIFFERENT clause of the formula.
  if (
    balance([{ status: 'PENDING', type: 'MONEY_OUTCOME', stars: 50 }]) !== 0
  ) {
    console.error(
      'самопроверка не прошла: незавершённая операция изменила баланс.'
    )
    process.exit(2)
  }
  if (balance([{ status: 'COMPLETED', type: 'MONEY_BONUS', stars: 7 }]) !== 7) {
    console.error('самопроверка не прошла: бонус не прибавился.')
    process.exit(2)
  }
  if (
    !isTestData({ description: 'seeded TEST_DATA row' }) ||
    !isTestData({ description: 'lowercase test_data' })
  ) {
    console.error('самопроверка не прошла: пометка TEST_DATA не распознана.')
    process.exit(2)
  }
  if (isTestData({ description: 'ordinary payment' }) || isTestData({})) {
    console.error('самопроверка не прошла: обычная строка принята за тестовую.')
    process.exit(2)
  }
  console.log(
    'самопроверка: формула баланса верна на образце, пометка TEST_DATA различается'
  )
}

selfCheck()

async function main() {
  const pay = await fetchAll(
    'payments_v2',
    'telegram_id,stars,type,status,description,payment_date'
  )
  const users = await fetchAll(
    'users',
    'telegram_id,username,first_name,last_name,bot_name'
  )
  const byId = new Map(users.map(u => [String(u.telegram_id), u]))

  const groups = new Map()
  for (const r of pay) {
    const k = String(r.telegram_id)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }

  const td = pay.filter(isTestData)
  console.log(`строк TEST_DATA: ${td.length}`)
  console.log(
    `затронутых пользователей: ${new Set(td.map(r => String(r.telegram_id))).size}`
  )
  console.log(
    `звёзд в TEST_DATA: ${r2(td.reduce((s, r) => s + n(r.stars), 0))}\n`
  )

  const victims = []
  for (const [uid, rows] of groups) {
    if (!rows.some(isTestData)) continue
    const now = balance(rows)
    const after = balance(rows.filter(r => !isTestData(r)))
    if (after < 0)
      victims.push({
        uid,
        now: r2(now),
        after: r2(after),
        debt: r2(-after),
        rows: rows.length,
      })
  }

  victims.sort((a, b) => b.debt - a.debt)

  console.log(`=== УЙДУТ В МИНУС: ${victims.length} человек ===`)
  console.log(
    `Суммарный минус: ${r2(victims.reduce((s, v) => s + v.debt, 0))} звёзд`
  )
  console.log(
    `(это услуги, которыми люди уже воспользовались за тестовые звёзды)\n`
  )
  console.log(
    'telegram_id'.padEnd(14) +
      'кто'.padEnd(26) +
      'сейчас'.padStart(14) +
      'станет'.padStart(14) +
      'долг'.padStart(12)
  )
  console.log('-'.repeat(80))
  for (const v of victims) {
    const u = byId.get(v.uid)
    const who = u
      ? u.username
        ? '@' + u.username
        : [u.first_name, u.last_name].filter(Boolean).join(' ') || '—'
      : 'НЕТ В users'
    console.log(
      v.uid.padEnd(14) +
        String(who).slice(0, 24).padEnd(26) +
        String(v.now).padStart(14) +
        String(v.after).padStart(14) +
        String(v.debt).padStart(12)
    )
  }

  // Кому TEST_DATA досталась, но в минус не уйдёт — важно для оценки радиуса.
  const touched = [...groups.entries()].filter(([, rows]) =>
    rows.some(isTestData)
  )
  console.log(
    `\nвсего с TEST_DATA: ${touched.length}, из них в минус уйдут ${victims.length}`
  )
  console.log(`остальные ${touched.length - victims.length} останутся в плюсе`)
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
