#!/usr/bin/env node
/**
 * READ-ONLY. Восстанавливает формулу get_user_balance опытным путём.
 *
 * Зачем: определения функции нет ни в sql/, ни в migrations/ — она живёт только
 * внутри базы. Чтобы понять, что делают 114 строк с отрицательными звёздами
 * (трек B), надо знать, как знак попадает в баланс. Гадать нельзя: от этого
 * зависит, начисляют они деньги или списывают.
 *
 * Метод: считаем несколько кандидатов-формул локально по всем строкам, зовём
 * настоящую RPC у выборки пользователей и оставляем ту формулу, что совпала
 * У ВСЕХ. Одно расхождение — формула отброшена.
 *
 * Ничего не пишет.
 */
// `|| ''` so the file LOADS without credentials: the matcher control below
// must be runnable with no production access at all. Without it the module
// dies on this line and the control never runs.
const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: key, Authorization: `Bearer ${key}` }

async function fetchAll(select) {
  const out = []
  let from = 0
  for (;;) {
    const res = await fetch(`${url}/rest/v1/payments_v2?select=${select}`, {
      headers: { ...H, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
    })
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
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

// Кандидаты. Каждый — как БД могла бы считать баланс.
const FORMULAS = {
  'income-outcome, только COMPLETED': rows =>
    rows.reduce(
      (s, r) =>
        r.status !== 'COMPLETED'
          ? s
          : r.type === 'MONEY_INCOME'
            ? s + n(r.stars)
            : r.type === 'MONEY_OUTCOME'
              ? s - n(r.stars)
              : s,
      0
    ),

  'income+refund+bonus - outcome, COMPLETED': rows =>
    rows.reduce(
      (s, r) =>
        r.status !== 'COMPLETED'
          ? s
          : r.type === 'MONEY_OUTCOME'
            ? s - n(r.stars)
            : s + n(r.stars),
      0
    ),

  'income+refund+bonus - outcome, любой статус': rows =>
    rows.reduce(
      (s, r) => (r.type === 'MONEY_OUTCOME' ? s - n(r.stars) : s + n(r.stars)),
      0
    ),

  'то же, но outcome берётся по ABS (COMPLETED)': rows =>
    rows.reduce(
      (s, r) =>
        r.status !== 'COMPLETED'
          ? s
          : r.type === 'MONEY_OUTCOME'
            ? s - Math.abs(n(r.stars))
            : s + n(r.stars),
      0
    ),

  'income+refund+bonus - outcome, COMPLETED, без is_test': rows =>
    rows.reduce(
      (s, r) =>
        r.status !== 'COMPLETED' || r.is_test
          ? s
          : r.type === 'MONEY_OUTCOME'
            ? s - n(r.stars)
            : s + n(r.stars),
      0
    ),
}

/**
 * This probe concludes "the database uses formula X", and it can only conclude
 * that if the candidates DISAGREE. Two that always return the same number are
 * indistinguishable by any volume of production data, and the verdict would then
 * follow from list order rather than from measurement.
 *
 * So the control is not "does a candidate compute correctly" but "does this set
 * still discriminate". The sample separates all five, each by a different
 * mechanism: a refund separates income-only from income+refund+bonus; a PENDING
 * row separates the status filter; a NEGATIVE outcome separates plain
 * subtraction from the ABS variant; an is_test row separates the variant that
 * excludes test rows.
 */
function selfCheck() {
  const sample = [
    { status: 'COMPLETED', type: 'MONEY_INCOME', stars: 100 },
    { status: 'COMPLETED', type: 'MONEY_OUTCOME', stars: -30 },
    { status: 'COMPLETED', type: 'MONEY_REFUND', stars: 5 },
    { status: 'PENDING', type: 'MONEY_INCOME', stars: 7 },
    { status: 'COMPLETED', type: 'MONEY_INCOME', stars: 11, is_test: true },
  ]
  const got = Object.fromEntries(
    Object.entries(FORMULAS).map(([k, f]) => [k, f(sample)])
  )
  const values = Object.values(got)
  if (new Set(values).size !== values.length) {
    console.error(
      'самопроверка не прошла: на образце кандидаты НЕ различаются ' +
        JSON.stringify(got) +
        '.\n' +
        'вердикт о формуле следовал бы из порядка в списке, а не из измерения.'
    )
    process.exit(2)
  }
  const expected = {
    'income-outcome, только COMPLETED': 141,
    'income+refund+bonus - outcome, COMPLETED': 146,
    'income+refund+bonus - outcome, любой статус': 153,
    'то же, но outcome берётся по ABS (COMPLETED)': 86,
    'income+refund+bonus - outcome, COMPLETED, без is_test': 135,
  }
  for (const [k, want] of Object.entries(expected)) {
    if (k in got && got[k] !== want) {
      console.error(
        `самопроверка не прошла: кандидат «${k}» дал ${got[k]}, ожидалось ${want}.`
      )
      process.exit(2)
    }
  }
  console.log(
    'самопроверка: пять кандидатов дают пять разных ответов на образце'
  )
}

selfCheck()

async function rpcBalance(id) {
  const res = await fetch(`${url}/rest/v1/rpc/get_user_balance`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_telegram_id: String(id) }),
  })
  if (!res.ok) throw new Error(`rpc ${res.status}: ${await res.text()}`)
  return Number(await res.text())
}

async function main() {
  const all = await fetchAll(
    'telegram_id,amount,stars,type,status,is_test,payment_date'
  )
  const byUser = new Map()
  for (const r of all) {
    const k = String(r.telegram_id)
    if (!byUser.has(k)) byUser.set(k, [])
    byUser.get(k).push(r)
  }
  console.log(`строк ${all.length}, пользователей ${byUser.size}`)

  // Выборка: разнообразная — самые активные, самые редкие, и из середины.
  const users = [...byUser.entries()].sort((a, b) => b[1].length - a[1].length)
  const sample = [
    ...users.slice(0, 8),
    ...users.slice(
      Math.floor(users.length / 2),
      Math.floor(users.length / 2) + 8
    ),
    ...users.slice(-8),
  ]
  console.log(`проверяю на ${sample.length} пользователях\n`)

  const alive = Object.fromEntries(
    Object.keys(FORMULAS).map(k => [k, { ok: 0, bad: 0, firstBad: null }])
  )

  for (const [uid, rows] of sample) {
    let real
    try {
      real = await rpcBalance(uid)
    } catch (e) {
      console.log(`  ${uid}: RPC ошибка ${e.message}`)
      continue
    }
    for (const [name, fn] of Object.entries(FORMULAS)) {
      const mine = r2(fn(rows))
      if (Math.abs(mine - r2(real)) < 0.011) alive[name].ok++
      else {
        alive[name].bad++
        if (!alive[name].firstBad)
          alive[name].firstBad = `${uid}: рпц ${r2(real)} vs моё ${mine}`
      }
    }
  }

  console.log('=== Какая формула совпала ===')
  for (const [name, v] of Object.entries(alive)) {
    const mark = v.bad === 0 ? '✓ СОВПАЛА ВЕЗДЕ' : `✗ ${v.bad} расхождений`
    console.log(`  ${mark.padEnd(20)} ${name}`)
    if (v.firstBad) console.log(`      первое: ${v.firstBad}`)
  }

  const winners = Object.entries(alive)
    .filter(([, v]) => v.bad === 0)
    .map(([k]) => k)
  if (!winners.length) {
    console.log(
      '\nНИ ОДНА не подошла — формула сложнее, вывод о знаке делать нельзя.'
    )
    return
  }

  // --- Что это значит для трека B ---------------------------------------
  console.log(
    '\n=== Следствие для трека B (114 строк stars=-9 у 144022504) ==='
  )
  const UID = '144022504'
  const rows = byUser.get(UID)
  const win = FORMULAS[winners[0]]
  const withNeg = r2(win(rows))
  const withoutNeg = r2(
    win(rows.filter(r => !(r.type === 'MONEY_OUTCOME' && n(r.stars) < 0)))
  )
  console.log(`  баланс как есть:            ${withNeg}`)
  console.log(`  баланс без этих 114 строк:  ${withoutNeg}`)
  console.log(`  разница:                    ${r2(withNeg - withoutNeg)}`)
  console.log(
    withNeg > withoutNeg
      ? '  => строки НАЧИСЛЯЮТ звёзды. Списание, записанное с минусом, работает как пополнение.'
      : '  => строки СПИСЫВАЮТ звёзды.'
  )
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
