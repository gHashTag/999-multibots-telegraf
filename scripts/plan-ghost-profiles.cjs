#!/usr/bin/env node
/**
 * План заведения профилей для плательщиков без строки в `users`.
 *
 * По умолчанию — СУХОЙ ПРОГОН: ничего не пишет, только печатает, что вставил
 * бы. Запись включается флагом `--apply`.
 *
 * Ни одно значение не выдумывается: `bot_name` и `language` берутся из
 * собственных платежей человека. Если по платежам их определить нельзя —
 * аккаунт пропускается и попадает в список «нужно решение», а не заполняется
 * умолчанием. Умолчание здесь было бы догадкой, записанной в базу.
 *
 * Кого НЕ трогаем:
 *   - явную синтетику (12345, 67890, 999999997 и подобные)
 *   - идентификаторы неправдоподобной формы (13 знаков — это метка времени)
 *   - тех, у кого нет положительного баланса
 */
const url = process.env.SUPABASE_URL.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: key, Authorization: `Bearer ${key}` }
const APPLY = process.argv.includes('--apply')

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

// Telegram на сегодня выдаёт идентификаторы короче 11 знаков.
const plausibleId = id => /^\d{5,10}$/.test(String(id))
// Аккаунты, которые заводили руками для проверок.
const SYNTHETIC = new Set([
  '12345',
  '67890',
  '11111',
  '999999996',
  '999999997',
  '999999998',
  '999999999',
  '123456789',
])

/**
 * Значения `bot_name`, которые в платежах встречаются, но ботами не являются.
 *
 * `admin_script` — это пометка ручного начисления, а не бот, с которым человек
 * разговаривает. Записать её в профиль значило бы соврать в поле, по которому
 * потом выбирают, каким ботом человеку писать. Такие случаи уходят в «нужно
 * решение», а не заполняются похожим по виду значением.
 */
const NOT_A_BOT = new Set([
  'admin_script',
  'unknown_bot',
  'telegram_bot',
  'migration_bot',
  'test_bot',
  '',
])

const mode = arr => {
  const m = new Map()
  for (const x of arr) if (x) m.set(x, (m.get(x) || 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

async function main() {
  const pay = await fetchAll(
    'payments_v2',
    'telegram_id,stars,type,status,payment_date,payment_method,bot_name,language,description'
  )
  const users = await fetchAll('users', 'telegram_id')
  const known = new Set(users.map(u => String(u.telegram_id)))

  const byUser = new Map()
  for (const p of pay) {
    const k = String(p.telegram_id)
    if (known.has(k)) continue
    if (!byUser.has(k)) byUser.set(k, [])
    byUser.get(k).push(p)
  }

  const isTest = r => /TEST_DATA/i.test(String(r.description || ''))
  const isMig = r => String(r.payment_method) === 'System_Balance_Migration'

  const plan = []
  const skipped = []

  for (const [id, rows] of byUser) {
    const bal = r2(balance(rows))
    const real = rows.filter(r => !isTest(r) && !isMig(r))

    if (SYNTHETIC.has(id)) {
      skipped.push([id, bal, 'служебный аккаунт'])
      continue
    }
    if (!plausibleId(id)) {
      skipped.push([
        id,
        bal,
        `идентификатор из ${id.length} знаков — не telegram_id`,
      ])
      continue
    }
    if (bal <= 0) {
      skipped.push([id, bal, 'баланс не положительный'])
      continue
    }
    if (!real.length) {
      skipped.push([id, bal, 'только миграция/TEST_DATA'])
      continue
    }

    const usable = b => b && !NOT_A_BOT.has(b)
    const botName =
      mode(real.map(r => r.bot_name).filter(usable)) ??
      mode(rows.map(r => r.bot_name).filter(usable))
    const language =
      mode(real.map(r => r.language).filter(Boolean)) ??
      mode(rows.map(r => r.language).filter(Boolean))

    if (!botName) {
      skipped.push([id, bal, 'бот по платежам не определяется — нужно решение'])
      continue
    }

    plan.push({
      telegram_id: id,
      bot_name: botName,
      language: language || 'ru',
      language_source: language ? 'из платежей' : 'по умолчанию ru',
      balance: bal,
      operations: rows.length,
      first: String(rows.map(r => r.payment_date).sort()[0]).slice(0, 10),
    })
  }

  plan.sort((a, b) => b.balance - a.balance)

  console.log(`=== ПЛАН: завести профилей ${plan.length} ===`)
  console.log(
    'telegram_id'.padEnd(14) +
      'баланс'.padStart(9) +
      '  бот'.padEnd(30) +
      'язык  источник языка'
  )
  for (const p of plan) {
    console.log(
      p.telegram_id.padEnd(14) +
        String(p.balance).padStart(9) +
        '  ' +
        String(p.bot_name).padEnd(28) +
        String(p.language).padEnd(6) +
        p.language_source
    )
  }

  console.log(`\n=== ПРОПУЩЕНО: ${skipped.length} ===`)
  const byReason = new Map()
  for (const [, , why] of skipped)
    byReason.set(why, (byReason.get(why) || 0) + 1)
  for (const [why, c] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(c).padStart(4)}  ${why}`)
  }
  const needsDecision = skipped.filter(([, , w]) => w.includes('нужно решение'))
  if (needsDecision.length) {
    console.log('\n  требуют решения владельца:')
    for (const [id, bal, why] of needsDecision)
      console.log(`    ${id.padEnd(14)} баланс ${bal}  ${why}`)
  }

  if (!APPLY) {
    console.log('\nСУХОЙ ПРОГОН. Ничего не записано. Для записи: --apply')
    return
  }

  console.log('\n=== ЗАПИСЬ ===')
  const inserted = []
  for (const p of plan) {
    const row = {
      telegram_id: Number(p.telegram_id),
      bot_name: p.bot_name,
      language_code: p.language,
      is_bot: false,
    }
    const res = await fetch(`${url}/rest/v1/users`, {
      method: 'POST',
      headers: {
        ...H,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    })
    const text = await res.text()
    if (!res.ok) {
      console.log(`  ✗ ${p.telegram_id}: ${res.status} ${text.slice(0, 160)}`)
      continue
    }
    inserted.push(p.telegram_id)
    console.log(`  ✓ ${p.telegram_id}  ${p.bot_name}  ${p.language}`)
  }
  console.log(`\nзаписано: ${inserted.length} из ${plan.length}`)
  console.log(
    'откат при необходимости — удалить строки users с этими telegram_id:'
  )
  console.log(`  ${inserted.join(', ')}`)
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
