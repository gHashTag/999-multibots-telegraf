#!/usr/bin/env node
/**
 * READ-ONLY. Трек C аудита: аномалии в users и model_trainings.
 *
 * Ищем то, что видно только в данных и не ловится типами:
 *  - дубли telegram_id (баланс считается по telegram_id — дубль ломает всё)
 *  - платящие без записи в users
 *  - обучения, застрявшие в processing навсегда
 *  - обучения без результата, но со статусом успеха
 *  - оплаченные обучения без строки в model_trainings
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
    if (!res.ok) throw new Error(`${table} ${res.status}: ${await res.text()}`)
    const rows = await res.json()
    if (!rows.length) break
    out.push(...rows)
    if (rows.length < 1000) break
    from += 1000
  }
  return out
}

const tally = (rows, f) => {
  const m = new Map()
  for (const r of rows) {
    const k = String(f(r))
    m.set(k, (m.get(k) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

const DAY = 86400000
const ageDays = iso => {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : Math.floor((NOW - t) / DAY)
}
// Точку отсчёта берём из самой свежей строки в базе: Date.now() в скрипте
// сделал бы результат невоспроизводимым между прогонами.
let NOW = 0

async function main() {
  const users = await fetchAll(
    'users',
    'telegram_id,username,bot_name,created_at,updated_at,level,vip,voice_id'
  )
  const mt = await fetchAll(
    'model_trainings',
    'id,telegram_id,model_name,status,created_at,updated_at,model_url,replicate_training_id,error,steps,bot_name'
  )
  const pay = await fetchAll(
    'payments_v2',
    'telegram_id,stars,type,status,service_type,description,payment_date'
  )

  NOW = Math.max(
    ...users.map(u => Date.parse(u.created_at) || 0),
    ...mt.map(m => Date.parse(m.created_at) || 0),
    ...pay.map(p => Date.parse(p.payment_date) || 0)
  )
  console.log(
    `самая свежая запись в базе: ${new Date(NOW).toISOString().slice(0, 10)}`
  )
  console.log(
    `users ${users.length}, model_trainings ${mt.length}, payments ${pay.length}\n`
  )

  // --- 1. Дубли telegram_id в users -------------------------------------
  console.log('=== users: дубли telegram_id ===')
  const dups = tally(users, u => u.telegram_id).filter(([, c]) => c > 1)
  console.log(`  telegram_id, встречающихся больше одного раза: ${dups.length}`)
  for (const [id, c] of dups.slice(0, 15)) {
    const rows = users.filter(u => String(u.telegram_id) === id)
    console.log(
      `    ${id} x${c}  боты: ${[...new Set(rows.map(r => r.bot_name))].join(', ')}`
    )
  }
  if (dups.length > 15) console.log(`    ... ещё ${dups.length - 15}`)
  const dupRows = dups.reduce((s, [, c]) => s + c, 0)
  console.log(`  строк в дублях: ${dupRows} (уникальных id: ${dups.length})`)

  // --- 2. Пустые telegram_id --------------------------------------------
  const noId = users.filter(
    u =>
      u.telegram_id === null ||
      u.telegram_id === undefined ||
      String(u.telegram_id) === ''
  )
  console.log(`\n=== users: без telegram_id: ${noId.length} ===`)

  // --- 3. Платящие, которых нет в users ---------------------------------
  const known = new Set(users.map(u => String(u.telegram_id)))
  const payers = new Map()
  for (const p of pay) {
    if (p.status !== 'COMPLETED') continue
    const k = String(p.telegram_id)
    payers.set(
      k,
      (payers.get(k) || 0) +
        (p.type === 'MONEY_OUTCOME'
          ? -Number(p.stars || 0)
          : Number(p.stars || 0))
    )
  }
  const ghosts = [...payers.keys()].filter(k => !known.has(k))
  console.log(`\n=== платящие без записи в users: ${ghosts.length} ===`)
  console.log(
    '   (баланс у них считается, а профиля нет — бот не знает языка, бота, голоса)'
  )
  for (const g of ghosts.slice(0, 20)) {
    const rows = pay.filter(p => String(p.telegram_id) === g)
    console.log(
      `    ${g.padEnd(14)} операций ${String(rows.length).padStart(4)}  баланс ${Math.round(payers.get(g) * 100) / 100}`
    )
  }
  if (ghosts.length > 20) console.log(`    ... ещё ${ghosts.length - 20}`)

  // --- 4. model_trainings: статусы --------------------------------------
  console.log('\n=== model_trainings: статусы ===')
  for (const [s, c] of tally(mt, m => m.status))
    console.log(`    ${String(c).padStart(5)}  ${s}`)

  const stuck = mt.filter(m => {
    const s = String(m.status || '').toLowerCase()
    if (
      [
        'succeeded',
        'success',
        'completed',
        'failed',
        'canceled',
        'cancelled',
      ].includes(s)
    )
      return false
    const d = ageDays(m.updated_at || m.created_at)
    return d !== null && d > 1
  })
  console.log(`\n=== обучения, зависшие дольше суток: ${stuck.length} ===`)
  for (const m of stuck.slice(0, 20)) {
    console.log(
      `    id=${String(m.id).padStart(5)}  uid=${String(m.telegram_id).padEnd(12)} ${String(m.status).padEnd(12)} ` +
        `${String(ageDays(m.updated_at || m.created_at)).padStart(5)} дн  ${m.model_name || '—'}`
    )
  }
  if (stuck.length > 20) console.log(`    ... ещё ${stuck.length - 20}`)

  // --- 5. Успех без результата ------------------------------------------
  const okNoUrl = mt.filter(m => {
    const s = String(m.status || '').toLowerCase()
    return ['succeeded', 'success', 'completed'].includes(s) && !m.model_url
  })
  console.log(`\n=== статус успеха, но model_url пустой: ${okNoUrl.length} ===`)
  for (const m of okNoUrl.slice(0, 15)) {
    console.log(
      `    id=${String(m.id).padStart(5)}  uid=${String(m.telegram_id).padEnd(12)} ${m.model_name || '—'}  ${String(m.created_at).slice(0, 10)}`
    )
  }
  if (okNoUrl.length > 15) console.log(`    ... ещё ${okNoUrl.length - 15}`)

  // --- 6. Оплачено обучение, а строки нет -------------------------------
  const trainPays = pay.filter(
    p =>
      p.status === 'COMPLETED' &&
      p.type === 'MONEY_OUTCOME' &&
      /train/i.test(
        String(p.service_type || '') + ' ' + String(p.description || '')
      )
  )
  const trained = new Set(mt.map(m => String(m.telegram_id)))
  const paidNoRow = [
    ...new Set(trainPays.map(p => String(p.telegram_id))),
  ].filter(id => !trained.has(id))
  console.log(
    `\n=== заплатили за обучение, но строки в model_trainings нет: ${paidNoRow.length} человек ===`
  )
  for (const id of paidNoRow.slice(0, 20)) {
    const rows = trainPays.filter(p => String(p.telegram_id) === id)
    const sum = rows.reduce((s, r) => s + Number(r.stars || 0), 0)
    console.log(
      `    ${id.padEnd(14)} платежей ${String(rows.length).padStart(3)}  на ${Math.round(sum * 100) / 100} звёзд`
    )
  }
  if (paidNoRow.length > 20) console.log(`    ... ещё ${paidNoRow.length - 20}`)
  console.log(
    `  всего оплат за обучение: ${trainPays.length} на ${Math.round(trainPays.reduce((s, r) => s + Number(r.stars || 0), 0) * 100) / 100} звёзд`
  )
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
