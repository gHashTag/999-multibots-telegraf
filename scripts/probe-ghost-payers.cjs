#!/usr/bin/env node
/**
 * READ-ONLY. Откуда берутся плательщики без строки в `users`.
 *
 * 277 из 629 плательщиков не имеют профиля: баланс им считается (он живёт в
 * payments_v2), а язык, бот и голос — нет. Вопрос не «сколько их», а «как они
 * появились»: от этого зависит, чинить код или чистить данные.
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
const tally = (rows, f) => {
  const m = new Map()
  for (const r of rows) {
    const k = String(f(r))
    m.set(k, (m.get(k) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}
const show = (title, pairs, lim = 12) => {
  console.log(`\n  ${title}`)
  for (const [k, c] of pairs.slice(0, lim))
    console.log(`    ${String(c).padStart(6)}  ${k}`)
  if (pairs.length > lim) console.log(`    ... ещё ${pairs.length - lim}`)
}

/**
 * Both matchers are pure functions, so an invented sample checks them with no
 * credential and no production row.
 *
 * This one is in the owner's queue: its output answers "how many payers have no
 * profile", and a decision gets made from that number. A finder whose grouping
 * silently broke would report a smaller, calmer figure -- and nothing about the
 * output would look wrong.
 */
function selfCheck() {
  const rows = [
    { bot_name: 'a' },
    { bot_name: 'a' },
    { bot_name: 'b' },
    { bot_name: null },
  ]
  const byBot = tally(rows, r => r.bot_name)
  // Sorted by count, descending: two of 'a', then one each of 'b' and null.
  if (byBot.length !== 3 || byBot[0][0] !== 'a' || byBot[0][1] !== 2) {
    console.error(
      'самопроверка не прошла: группировка дала ' +
        JSON.stringify(byBot) +
        '.\n' +
        'счёт плательщиков без профиля ниже читать нельзя.'
    )
    process.exit(2)
  }
  // null must land in its own bucket rather than joining a real bot's count --
  // otherwise rows with no bot inflate whichever name sorts first.
  if (!byBot.some(([k, c]) => k === 'null' && c === 1)) {
    console.error(
      'самопроверка не прошла: строка без bot_name слилась с чужой группой.'
    )
    process.exit(2)
  }
  if (!looksLikeTelegramId('144022504') || looksLikeTelegramId('1234')) {
    console.error(
      'самопроверка не прошла: распознавание идентификатора сломано.'
    )
    process.exit(2)
  }
  if (looksLikeTelegramId('123456789012345')) {
    console.error(
      'самопроверка не прошла: слишком длинное число принято за идентификатор.'
    )
    process.exit(2)
  }
  console.log(
    'самопроверка: группировка считает верно, идентификаторы различаются'
  )
}

// Telegram выдаёт идентификаторы возрастающе; на сегодня это меньше 11 знаков.
// Всё длиннее — не идентификатор пользователя.
const looksLikeTelegramId = id => /^\d{5,10}$/.test(String(id))

selfCheck()

async function main() {
  const pay = await fetchAll(
    'payments_v2',
    'telegram_id,stars,type,status,payment_date,payment_method,bot_name,description,service_type,inv_id,subscription_type'
  )
  const users = await fetchAll(
    'users',
    'telegram_id,username,bot_name,created_at'
  )
  const known = new Set(users.map(u => String(u.telegram_id)))

  const byUser = new Map()
  for (const p of pay) {
    const k = String(p.telegram_id)
    if (!byUser.has(k)) byUser.set(k, [])
    byUser.get(k).push(p)
  }

  const ghosts = [...byUser.entries()].filter(([id]) => !known.has(id))
  console.log(`плательщиков всего: ${byUser.size}`)
  console.log(`без строки в users: ${ghosts.length}`)

  const gRows = ghosts.flatMap(([, rows]) => rows)
  console.log(`их операций: ${gRows.length} из ${pay.length}`)

  const balance = rows =>
    rows.reduce(
      (s, r) =>
        r.status !== 'COMPLETED'
          ? s
          : r.type === 'MONEY_OUTCOME'
            ? s - n(r.stars)
            : s + n(r.stars),
      0
    )

  const withMoney = ghosts.filter(([, rows]) => balance(rows) > 0)
  const totalStars = r2(ghosts.reduce((s, [, rows]) => s + balance(rows), 0))
  console.log(
    `из них с положительным балансом: ${withMoney.length}, суммарно ${totalStars} звёзд`
  )

  // --- Откуда они? -------------------------------------------------------
  show(
    'способ оплаты',
    tally(gRows, r => r.payment_method)
  )
  show(
    'бот',
    tally(gRows, r => r.bot_name)
  )
  show(
    'тип операции',
    tally(gRows, r => r.type)
  )
  show(
    'описание',
    tally(gRows, r => String(r.description || '').slice(0, 60)),
    15
  )
  show(
    'по месяцам',
    tally(gRows, r => String(r.payment_date).slice(0, 7)).sort((a, b) =>
      a[0] < b[0] ? -1 : 1
    ),
    30
  )

  // --- Форма идентификатора ---------------------------------------------
  const weird = ghosts.filter(([id]) => !looksLikeTelegramId(id))
  console.log(
    `\n=== идентификаторы неправдоподобной формы: ${weird.length} ===`
  )
  for (const [id, rows] of weird) {
    console.log(
      `  ${id.padEnd(16)} знаков ${String(id).length}  операций ${rows.length}  баланс ${r2(balance(rows))}`
    )
    console.log(
      `      ${String(rows[0].payment_date).slice(0, 10)}  ${rows[0].payment_method}  "${String(rows[0].description || '').slice(0, 50)}"`
    )
  }

  // --- Есть ли они в users под ДРУГИМ регистром/типом? -------------------
  // telegram_id в users может быть числом, а в payments строкой — тогда
  // расхождение не настоящее, а следствие сравнения типов.
  const knownNum = new Set(
    users.map(u => Number(u.telegram_id)).filter(x => !Number.isNaN(x))
  )
  const falseGhosts = ghosts.filter(([id]) => knownNum.has(Number(id)))
  console.log(
    `\n=== мнимые «призраки» (совпадают при сравнении числом): ${falseGhosts.length} ===`
  )
  console.log('  если тут не ноль — расхождение в типах, а не в данных')

  // --- Топ по деньгам ----------------------------------------------------
  const top = ghosts
    .map(([id, rows]) => ({
      id,
      bal: r2(balance(rows)),
      ops: rows.length,
      first: String(rows[0].payment_date).slice(0, 10),
    }))
    .sort((a, b) => b.bal - a.bal)
    .slice(0, 20)
  console.log('\n=== 20 самых «богатых» без профиля ===')
  console.log(
    '  id'.padEnd(18) +
      'баланс'.padStart(12) +
      'операций'.padStart(10) +
      '  первая'
  )
  for (const t of top) {
    console.log(
      `  ${t.id.padEnd(16)}${String(t.bal).padStart(12)}${String(t.ops).padStart(10)}  ${t.first}`
    )
  }

  // --- Сравнение с теми, у кого профиль ЕСТЬ -----------------------------
  const withProfile = [...byUser.entries()].filter(([id]) => known.has(id))
  const avg = arr =>
    arr.length ? r2(arr.reduce((s, x) => s + x, 0) / arr.length) : 0
  console.log('\n=== призраки против обычных ===')
  console.log(
    `  операций на человека:  призраки ${avg(ghosts.map(([, r]) => r.length))}  vs  с профилем ${avg(withProfile.map(([, r]) => r.length))}`
  )
  console.log(
    `  баланс на человека:    призраки ${avg(ghosts.map(([, r]) => balance(r)))}  vs  с профилем ${avg(withProfile.map(([, r]) => balance(r)))}`
  )
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
