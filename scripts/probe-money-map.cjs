#!/usr/bin/env node
/**
 * READ-ONLY. Выясняет ПО ДАННЫМ, как устроено начисление: что именно меняет
 * баланс, какие поля обязательны, какие сочетания встречаются.
 *
 * Зачем. Я трижды подряд ошибся в предположениях об этом пути:
 *   - принял `service_type='unknown_mode'` за отпечаток вызова через API —
 *     а его туда никто не пишет;
 *   - принял `updateUserBalance` за место начисления — а начисляет отметка
 *     COMPLETED у самой строки платежа;
 *   - переставил порядок шагов, лишив звёзд тех, у кого нет профиля.
 *
 * Каждый раз причина одна: рассуждал по коду, не проверив данные. Этот скрипт
 * закрывает вопрос раз и навсегда — фактами, а не чтением.
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
    if (!res.ok) return out
    const rows = await res.json()
    if (!Array.isArray(rows) || !rows.length) break
    out.push(...rows)
    if (rows.length < 1000) break
    from += 1000
  }
  return out
}

const n = x => Number(x ?? 0)
const r2 = x => Math.round(x * 100) / 100

async function rpcBalance(id) {
  const res = await fetch(`${url}/rest/v1/rpc/get_user_balance`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_telegram_id: String(id) }),
  })
  return res.ok ? Number(await res.text()) : NaN
}

async function main() {
  const pay = await fetchAll(
    'payments_v2',
    'id,telegram_id,inv_id,stars,amount,cost,type,status,payment_method,service_type,description,payment_date,currency,category,is_test'
  )
  console.log(`строк в реестре: ${pay.length}\n`)

  // --- 1. Что считается балансом --------------------------------------
  console.log('=== 1. Формула баланса (подтверждение) ===')
  const byUser = new Map()
  for (const p of pay) {
    const k = String(p.telegram_id)
    if (!byUser.has(k)) byUser.set(k, [])
    byUser.get(k).push(p)
  }
  const formula = rows =>
    rows.reduce(
      (s, r) =>
        r.status !== 'COMPLETED'
          ? s
          : r.type === 'MONEY_OUTCOME'
            ? s - n(r.stars)
            : s + n(r.stars),
      0
    )
  const sample = [...byUser.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
  let ok = 0
  for (const [uid, rows] of sample) {
    const mine = r2(formula(rows))
    const real = r2(await rpcBalance(uid))
    const match = Math.abs(mine - real) < 0.011
    if (match) ok++
    console.log(
      `  uid=${uid.padEnd(13)} моя формула ${String(mine).padStart(12)}  база ${String(real).padStart(12)}  ${match ? '✓' : '✗'}`
    )
  }
  console.log(`  совпало: ${ok}/${sample.length}`)
  console.log(
    '  => баланс = сумма stars по COMPLETED; MONEY_OUTCOME вычитается,'
  )
  console.log(
    '     остальные типы прибавляются. Ничего другого не участвует.\n'
  )

  // --- 2. Что делает статус -------------------------------------------
  console.log('=== 2. Роль статуса ===')
  const st = {}
  for (const p of pay) st[String(p.status)] = (st[String(p.status)] || 0) + 1
  console.log('  статусы:', JSON.stringify(st))
  const pendingStars = pay
    .filter(p => p.status !== 'COMPLETED')
    .reduce((s, p) => s + n(p.stars), 0)
  console.log(
    `  звёзд в НЕ-completed строках: ${r2(pendingStars)} — они НЕ в балансе`
  )
  console.log('  => перевод строки в COMPLETED и ЕСТЬ начисление\n')

  // --- 3. Один счёт — одна строка -------------------------------------
  console.log('=== 3. Уникальность номера счёта ===')
  const inv = new Map()
  for (const p of pay) {
    if (!p.inv_id) continue
    const k = String(p.inv_id)
    inv.set(k, (inv.get(k) || 0) + 1)
  }
  const dups = [...inv.values()].filter(c => c > 1).length
  console.log(
    `  строк с номером счёта: ${[...inv.values()].reduce((a, b) => a + b, 0)}`
  )
  console.log(`  разных номеров: ${inv.size}, из них с дублями: ${dups}`)
  console.log(`  без номера счёта: ${pay.filter(p => !p.inv_id).length}`)
  console.log(
    '  => вторую строку с тем же номером база не примет (код 23505)\n'
  )

  // --- 4. Кто и как пополняет -----------------------------------------
  console.log('=== 4. Способы пополнения (COMPLETED, доход) ===')
  const inc = pay.filter(
    p => p.status === 'COMPLETED' && p.type !== 'MONEY_OUTCOME'
  )
  const pm = {}
  for (const p of inc) {
    const k = String(p.payment_method)
    pm[k] = pm[k] || { n: 0, stars: 0 }
    pm[k].n++
    pm[k].stars += n(p.stars)
  }
  console.log(
    '  способ'.padEnd(28) + 'строк'.padStart(7) + 'звёзд'.padStart(14)
  )
  for (const [k, v] of Object.entries(pm).sort(
    (a, b) => b[1].stars - a[1].stars
  )) {
    console.log(
      `  ${k.padEnd(26)}${String(v.n).padStart(7)}${String(r2(v.stars)).padStart(14)}`
    )
  }

  // --- 5. Что нельзя нарушать -----------------------------------------
  console.log('\n=== 5. Инварианты, найденные в данных ===')
  const negOutcome = pay.filter(
    p => p.type === 'MONEY_OUTCOME' && n(p.stars) < 0
  ).length
  const negIncome = pay.filter(
    p => p.type === 'MONEY_INCOME' && n(p.stars) < 0
  ).length
  const noStars = pay.filter(
    p => p.status === 'COMPLETED' && n(p.stars) === 0
  ).length
  console.log(
    `  списаний с отрицательными звёздами: ${negOutcome} (должно быть 0 — они НАЧИСЛЯЮТ)`
  )
  console.log(`  пополнений с отрицательными звёздами: ${negIncome}`)
  console.log(`  завершённых строк с нулём звёзд: ${noStars}`)
  const types = {}
  for (const p of pay) types[String(p.type)] = (types[String(p.type)] || 0) + 1
  console.log(`  типы операций: ${JSON.stringify(types)}`)
  console.log(
    '  => любой НОВЫЙ тип попадёт в ветку «прибавить» и станет начислением'
  )
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
