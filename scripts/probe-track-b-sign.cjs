#!/usr/bin/env node
/**
 * READ-ONLY. Проверяет ЗНАКОВОЕ СОГЛАШЕНИЕ в payments_v2 и что из него следует
 * для 114 строк трека B.
 *
 * Вопрос, который решает скрипт: если MONEY_OUTCOME обычно хранит ПОЛОЖИТЕЛЬНЫЕ
 * звёзды (знак задан типом), то outcome с stars = -9 при подсчёте
 * `sum(income) - sum(outcome)` не спишет 9 звёзд, а НАЧИСЛИТ их.
 *
 * Ничего не пишет.
 */
const url = process.env.SUPABASE_URL.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

async function fetchAll(select, filter = '') {
  const out = []
  let from = 0
  for (;;) {
    const res = await fetch(
      `${url}/rest/v1/payments_v2?select=${select}${filter}`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Range: `${from}-${from + 999}`,
          'Range-Unit': 'items',
        },
      }
    )
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

async function main() {
  const all = await fetchAll(
    'id,telegram_id,payment_date,amount,stars,type,status,service_type,description,bot_name,category,is_test'
  )
  console.log(`Всего строк: ${all.length}\n`)

  // --- 1. Знаковое соглашение по типам -----------------------------------
  console.log('=== Знак stars по типу операции (COMPLETED) ===')
  const byType = {}
  for (const r of all) {
    if (r.status !== 'COMPLETED') continue
    const t = String(r.type)
    byType[t] ??= { pos: 0, zero: 0, neg: 0, sumPos: 0, sumNeg: 0 }
    const s = n(r.stars)
    if (s > 0) {
      byType[t].pos++
      byType[t].sumPos += s
    } else if (s < 0) {
      byType[t].neg++
      byType[t].sumNeg += s
    } else byType[t].zero++
  }
  for (const [t, v] of Object.entries(byType)) {
    console.log(
      `  ${t.padEnd(16)} +:${String(v.pos).padStart(6)}  0:${String(v.zero).padStart(5)}  -:${String(v.neg).padStart(5)}   сумма+ ${v.sumPos}  сумма- ${v.sumNeg}`
    )
  }

  // --- 2. Полная история пользователя из трека B -------------------------
  const UID = 144022504
  const mine = all.filter(r => Number(r.telegram_id) === UID)
  console.log(`\n=== Пользователь ${UID}: вся история ===`)
  console.log(`  строк: ${mine.length}`)

  let inc = 0,
    out = 0
  for (const r of mine) {
    if (r.status !== 'COMPLETED') continue
    if (r.type === 'MONEY_INCOME') inc += n(r.stars)
    else if (r.type === 'MONEY_OUTCOME') out += n(r.stars)
  }
  console.log(`  сумма INCOME  (stars): ${inc}`)
  console.log(
    `  сумма OUTCOME (stars): ${out}   <- если тут есть минусы, они РАЗДУВАЮТ баланс`
  )
  console.log(`  баланс по формуле income - outcome: ${inc - out}`)

  const outNeg = mine.filter(
    r =>
      r.type === 'MONEY_OUTCOME' && n(r.stars) < 0 && r.status === 'COMPLETED'
  )
  const outNegSum = outNeg.reduce((s, r) => s + n(r.stars), 0)
  console.log(
    `  из них отрицательных OUTCOME: ${outNeg.length} на ${outNegSum} звёзд`
  )
  console.log(
    `  => формула вычитает отрицательное, то есть НАЧИСЛЯЕТ ${Math.abs(outNegSum)} звёзд`
  )
  console.log(`  баланс без этих строк: ${inc - (out - outNegSum)}`)

  // --- 3. Кто ещё держит отрицательные OUTCOME ---------------------------
  const allOutNeg = all.filter(
    r =>
      r.type === 'MONEY_OUTCOME' && n(r.stars) < 0 && r.status === 'COMPLETED'
  )
  const victims = new Map()
  for (const r of allOutNeg)
    victims.set(r.telegram_id, (victims.get(r.telegram_id) || 0) + n(r.stars))
  console.log(`\n=== Отрицательные OUTCOME по всей базе ===`)
  console.log(`  строк: ${allOutNeg.length}, пользователей: ${victims.size}`)
  for (const [u, s] of [...victims.entries()].sort((a, b) => a[1] - b[1])) {
    console.log(`    ${u}: ${s} звёзд  => лишних +${Math.abs(s)} к балансу`)
  }

  // --- 4. Есть ли парные +9 в те же секунды (признак отката) -------------
  const sameDay = mine.filter(
    r =>
      String(r.payment_date).slice(0, 10) >= '2025-06-27' &&
      String(r.payment_date).slice(0, 10) <= '2025-06-28'
  )
  console.log(`\n=== Что происходило у ${UID} 27-28 июня ===`)
  console.log(`  всего операций за эти два дня: ${sameDay.length}`)
  const dayTally = {}
  for (const r of sameDay) {
    const k = `${r.type} stars=${n(r.stars)} "${r.description}"`
    dayTally[k] = (dayTally[k] || 0) + 1
  }
  for (const [k, c] of Object.entries(dayTally).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(c).padStart(4)}  ${k}`)
  }

  // Соседние по времени строки — видно ли пары «списание/откат»
  const sorted = [...sameDay].sort((a, b) =>
    String(a.payment_date) < String(b.payment_date) ? -1 : 1
  )
  console.log('\n  первые 12 операций подряд по времени:')
  for (const r of sorted.slice(0, 12)) {
    console.log(
      `    ${String(r.payment_date).slice(11, 23)}  id=${String(r.id).padStart(6)}  ${String(r.type).padEnd(14)} stars=${String(n(r.stars)).padStart(6)}  ${r.description}`
    )
  }
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
