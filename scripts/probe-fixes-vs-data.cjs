#!/usr/bin/env node
/**
 * READ-ONLY. Проверяет по данным, делают ли недавние правки то, что задумано.
 *
 * Зачем. Правка, прошедшая проверку типов и тесты, всё ещё может не работать в
 * проде: покрывать не тот путь, ловить не то условие, молча ничего не менять.
 * Тест проверяет замысел, данные — результат. Здесь смотрим на результат.
 *
 * Что проверяем (каждая правка — с датой выката, чтобы делить «до» и «после»):
 *   1. зеркалирование чужих ссылок (#521) — появляются ли новые чужие ссылки
 *   2. токены ботов в photo_url (#523) — пишутся ли новые
 *   3. пометка происхождения 'api-route' (#528) — жива ли она вообще
 *   4. формат ссылки на модель (#522) — появляются ли новые кривые
 *   5. незавершённые платежи — копятся ли новые PENDING
 *
 * Ничего не пишет.
 */
const url = process.env.SUPABASE_URL.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: key, Authorization: `Bearer ${key}` }

/** Момент выката зеркалирования и остальных правок этой серии (UTC). */
const DEPLOY = '2026-08-19T19:52:00Z'

async function fetchAll(table, select, extra = '') {
  const out = []
  let from = 0
  for (;;) {
    const res = await fetch(
      `${url}/rest/v1/${table}?select=${select}${extra}`,
      {
        headers: {
          ...H,
          Range: `${from}-${from + 999}`,
          'Range-Unit': 'items',
        },
      }
    )
    if (!res.ok) {
      console.log(`  (таблица ${table} недоступна: ${res.status})`)
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

/** Ссылка ведёт не к нам. */
const OURS = /supabase|storage\.googleapis|railway\.app|three-head-dragon/i
const isForeign = u =>
  typeof u === 'string' && /^https?:\/\//.test(u) && !OURS.test(u)

const after = (row, field) => row[field] && String(row[field]) >= DEPLOY

async function main() {
  console.log(`граница «до/после» — выкат ${DEPLOY}\n`)

  // --- 1. Зеркалирование ------------------------------------------------
  console.log('=== 1. Чужие ссылки в ассетах и промптах (#521) ===')
  for (const [table, field, ts] of [
    ['assets', 'url', 'created_at'],
    ['prompts_history', 'media_url', 'created_at'],
  ]) {
    const rows = await fetchAll(table, `${field},${ts}`)
    if (!rows.length) continue
    const foreign = rows.filter(r => isForeign(r[field]))
    const fresh = rows.filter(r => after(r, ts))
    const freshForeign = fresh.filter(r => isForeign(r[field]))
    console.log(
      `  ${table}: всего ${rows.length}, чужих ${foreign.length}; ` +
        `после выката ${fresh.length}, из них чужих ${freshForeign.length}`
    )
    for (const r of freshForeign.slice(0, 3)) {
      console.log(`      ${String(r[field]).slice(0, 80)}`)
    }
  }

  // --- 2. Токены ботов в профиле ---------------------------------------
  console.log('\n=== 2. Токены ботов в photo_url (#523) ===')
  const users = await fetchAll('users', 'telegram_id,photo_url,updated_at')
  const TOKEN = /api\.telegram\.org\/file\/bot\d+:/i
  const withToken = users.filter(u => TOKEN.test(String(u.photo_url || '')))
  const freshToken = withToken.filter(u => after(u, 'updated_at'))
  console.log(
    `  профилей: ${users.length}, с токеном в ссылке: ${withToken.length}`
  )
  console.log(`  из них обновлены ПОСЛЕ выката: ${freshToken.length}`)
  console.log(
    freshToken.length
      ? '  ⚠️  правка не покрывает путь, который используется'
      : '  новых не появилось'
  )

  // --- 3. Пометка происхождения ----------------------------------------
  console.log('\n=== 3. Пометка происхождения api-route (#528) ===')
  const pay = await fetchAll('payments_v2', 'bot_name,payment_date')
  const freshPay = pay.filter(p => after(p, 'payment_date'))
  const byBot = {}
  for (const p of freshPay)
    byBot[String(p.bot_name)] = (byBot[String(p.bot_name)] || 0) + 1
  console.log(`  списаний после выката: ${freshPay.length}`)
  console.log(`  по ботам: ${JSON.stringify(byBot)}`)
  console.log(
    byBot['api-route']
      ? `  ⚠️  ${byBot['api-route']} вызовов через маршрут — но маршруты закрыты ключом`
      : '  через маршрут не приходили (или трафика не было — см. число выше)'
  )

  // --- 4. Формат ссылки на модель --------------------------------------
  console.log('\n=== 4. Формат ссылки на модель (#522) ===')
  const models = await fetchAll(
    'model_trainings',
    'model_url,model_name,created_at,status'
  )
  const broken = models.filter(
    m =>
      m.model_url &&
      !/^[\w.-]+\/[\w.-]+:[0-9a-f]{6,}$/i.test(String(m.model_url))
  )
  const freshBroken = broken.filter(m => after(m, 'created_at'))
  console.log(
    `  обучений со ссылкой: ${models.filter(m => m.model_url).length}`
  )
  console.log(
    `  ссылка не того вида: ${broken.length}, из них после выката: ${freshBroken.length}`
  )
  for (const m of broken.slice(0, 5)) {
    console.log(
      `      ${String(m.model_name || '')
        .slice(0, 24)
        .padEnd(24)} ${String(m.model_url).slice(0, 60)}`
    )
  }

  // --- 5. Незавершённые платежи ----------------------------------------
  console.log('\n=== 5. Незавершённые платежи ===')
  const pend = pay.length
    ? await fetchAll('payments_v2', 'status,stars,payment_method,payment_date')
    : []
  const pending = pend.filter(p => p.status !== 'COMPLETED')
  const freshPending = pending.filter(p => after(p, 'payment_date'))
  const pm = {}
  for (const p of pending)
    pm[String(p.payment_method)] = (pm[String(p.payment_method)] || 0) + 1
  console.log(
    `  незавершённых: ${pending.length}, из них после выката: ${freshPending.length}`
  )
  console.log(`  по способу: ${JSON.stringify(pm)}`)
  const last = pending
    .map(p => p.payment_date)
    .filter(Boolean)
    .sort()
    .slice(-3)
  console.log(`  последние по времени: ${last.join(', ') || '—'}`)
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
