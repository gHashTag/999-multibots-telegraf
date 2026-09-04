#!/usr/bin/env node
/**
 * READ-ONLY. Зеркальная сторона прошлого класса: шаг А состоялся, шаг Б — нет.
 * Списали и не сделали.
 *
 * Прошлые итерации искали «действие без проверки предыдущего шага» по коду.
 * Этот ищет след того же по ДАННЫМ: за списание заплачено, а работы за ним не
 * видно.
 *
 * ГЛАВНАЯ ЛОВУШКА, из-за которой такой замер обычно врёт: часть услуг вообще
 * не пишет следов. Тогда «следа нет» означает «так устроено», а не «денег
 * лишили». Поэтому считаем ДОЛЮ ПО КАЖДОЙ УСЛУГЕ отдельно и смотрим на
 * выбросы, а не на абсолютные числа. Услуга со 100% отсутствием следа —
 * не находка, а особенность записи.
 *
 * Отрицательный контроль обязателен: если доля «без следа» одинакова у всех
 * услуг, значит найден фон, а не дефект.
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
/** Окно, в котором ищем след работы вокруг списания. */
const WINDOW_MS = 30 * 60 * 1000

let droppedTraceTs = 0
const index = rows => {
  const m = new Map()
  for (const r of rows) {
    const ts = Date.parse(r.created_at)
    // An unparseable trace timestamp can never match anything, so keeping it
    // in the index only makes a payment look untraced. Dropped and counted,
    // so the number is visible rather than folded into "no trace".
    if (Number.isNaN(ts)) {
      droppedTraceTs++
      continue
    }
    const k = String(r.telegram_id)
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(ts)
  }
  for (const [, v] of m) v.sort((a, b) => a - b)
  return m
}

const near = (idx, uid, t) => {
  const list = idx.get(String(uid))
  if (!list) return false
  for (const ts of list) {
    if (Math.abs(ts - t) <= WINDOW_MS) return true
    if (ts > t + WINDOW_MS) break
  }
  return false
}

/**
 * near() decides whether a payment has a trace beside it in time, and every
 * comparison with NaN is false -- so a payment whose date will not parse looks
 * exactly like a payment with no trace at all. That is not what was measured.
 * Folding "cannot tell" into "charged and nothing made" inflates the one number
 * this probe exists to report, in the direction that manufactures findings.
 *
 * Runs before any fetch: what is checked is the time matching, not the query.
 */
function selfCheck() {
  const t = Date.parse('2026-09-01T12:00:00Z')
  const withTrace = index([
    { telegram_id: 7, created_at: '2026-09-01T12:10:00Z' },
  ])
  const far = index([{ telegram_id: 7, created_at: '2026-09-01T20:00:00Z' }])

  if (!near(withTrace, 7, t)) {
    console.error('самопроверка не прошла: след внутри окна не найден.')
    process.exit(2)
  }
  if (near(far, 7, t)) {
    console.error('самопроверка не прошла: след ЗА окном засчитан как близкий.')
    process.exit(2)
  }
  if (near(withTrace, 999, t)) {
    console.error('самопроверка не прошла: чужой след засчитан этому человеку.')
    process.exit(2)
  }
  // The defect this control exists for: an unparseable timestamp must never
  // look like a trace, and must never be reported as its absence either.
  if (near(withTrace, 7, Date.parse(undefined))) {
    console.error(
      'самопроверка не прошла: списание с неразбираемой датой сочтено имеющим след.'
    )
    process.exit(2)
  }
  if (index([{ telegram_id: 7, created_at: 'not a date' }]).size !== 0) {
    console.error(
      'самопроверка не прошла: след с неразбираемой отметкой попал в индекс —\n' +
        'совпасть он не может, а списание из-за него выглядит непокрытым.'
    )
    process.exit(2)
  }
  // The payment-side half of the same defect lives inside main(), where this
  // control cannot call it. Asserted against the source instead -- crude, but
  // it is the half that actually inflates the reported loss, and a behavioural
  // check that cannot see it would be worse than an honest structural one.
  const src = require('fs').readFileSync(__filename, 'utf8')
  if (!/Number\.isNaN\(t\)\s*\)\s*\{\s*b\.unknown\+\+/.test(src)) {
    console.error(
      'самопроверка не прошла: списание с неразбираемой датой снова уходит в\n' +
        '«без следа» вместо «не поддаётся оценке» — доля потерь завышается.'
    )
    process.exit(2)
  }
  console.log(
    'самопроверка: окно и владелец различаются, неразбираемые отметки не считаются следом'
  )
}

selfCheck()

async function main() {
  const pay = (
    await fetchAll(
      'payments_v2',
      'id,telegram_id,payment_date,type,status,stars,service_type,description'
    )
  ).filter(p => p.status === 'COMPLETED' && p.type === 'MONEY_OUTCOME')

  const prompts = await fetchAll('prompts_history', 'telegram_id,created_at')
  const assets = await fetchAll('assets', 'telegram_id,created_at')

  console.log(
    `списаний: ${pay.length}, промптов: ${prompts.length}, ассетов: ${assets.length}\n`
  )

  /** Индекс отметок времени по человеку. */
  const pIdx = index(prompts)
  const aIdx = index(assets)

  // --- Доля «без следа» по каждой услуге -------------------------------
  const bySvc = new Map()
  for (const p of pay) {
    const k = String(p.service_type || '—')
    if (!bySvc.has(k))
      bySvc.set(k, {
        n: 0,
        noTrace: 0,
        unknown: 0,
        stars: 0,
        lost: 0,
        people: new Set(),
        lostPeople: new Set(),
      })
    const b = bySvc.get(k)
    const t = Date.parse(p.payment_date)
    b.n++
    b.stars += n(p.stars)
    b.people.add(String(p.telegram_id))
    // A payment whose date will not parse cannot be matched against any trace:
    // every comparison with NaN is false, so near() returns false and the row
    // used to be counted as "charged and nothing made". That is not what was
    // measured -- it is "cannot tell" -- and folding it into the finding
    // inflates exactly the number this probe exists to report.
    if (Number.isNaN(t)) {
      b.unknown++
      continue
    }
    if (!near(pIdx, p.telegram_id, t) && !near(aIdx, p.telegram_id, t)) {
      b.noTrace++
      b.lost += n(p.stars)
      b.lostPeople.add(String(p.telegram_id))
    }
  }

  console.log('=== Доля списаний БЕЗ следа работы, по услугам ===')
  console.log(
    '  услуга'.padEnd(26) +
      'списаний'.padStart(9) +
      'без следа'.padStart(11) +
      'доля'.padStart(7) +
      'звёзд впустую'.padStart(15) +
      'людей'.padStart(7)
  )
  const rows = [...bySvc.entries()].sort((a, b) => b[1].lost - a[1].lost)
  const unknownTotal = rows.reduce((s2, [, v]) => s2 + v.unknown, 0)
  if (unknownTotal || droppedTraceTs) {
    console.log(
      `  (не поддаются оценке: ${unknownTotal} списаний с неразбираемой датой, ` +
        `${droppedTraceTs} следов с неразбираемой отметкой — в долю НЕ входят)`
    )
  }
  for (const [k, v] of rows) {
    console.log(
      `  ${k.padEnd(24)}${String(v.n).padStart(9)}${String(v.noTrace).padStart(11)}${String(Math.round((v.noTrace / v.n) * 100) + '%').padStart(7)}${String(Math.round(v.lost)).padStart(15)}${String(v.lostPeople.size).padStart(7)}`
    )
  }

  // --- Отрицательный контроль ------------------------------------------
  // Denominator excludes rows we could not judge, for the same reason.
  const shares = rows
    .filter(([, v]) => v.n - v.unknown >= 20)
    .map(([k, v]) => [k, v.noTrace / (v.n - v.unknown)])
  const avg = shares.reduce((s, [, x]) => s + x, 0) / (shares.length || 1)
  console.log(`\n=== Отрицательный контроль ===`)
  console.log(
    `  средняя доля «без следа» по услугам с 20+ списаниями: ${Math.round(avg * 100)}%`
  )
  console.log('  услуги, заметно выше среднего (это и есть кандидаты):')
  for (const [k, s] of shares
    .filter(([, s]) => s > avg + 0.2)
    .sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(24)} ${Math.round(s * 100)}%`)
  }
  console.log('  услуги, заметно ниже (значит след пишется исправно):')
  for (const [k, s] of shares
    .filter(([, s]) => s < avg - 0.2)
    .sort((a, b) => a[1] - b[1])) {
    console.log(`    ${k.padEnd(24)} ${Math.round(s * 100)}%`)
  }

  // --- Оплаченные обучения без записи об обучении ------------------------
  console.log('\n=== Оплата обучения без записи об обучении ===')
  const trainings = await fetchAll(
    'model_trainings',
    'telegram_id,created_at,status'
  )
  const tIdx = index(trainings)
  const trainPays = pay.filter(p =>
    /train|digital_avatar/i.test(
      String(p.service_type || '') + String(p.description || '')
    )
  )
  let noTraining = 0
  const victims = new Map()
  for (const p of trainPays) {
    const t = Date.parse(p.payment_date)
    const list = tIdx.get(String(p.telegram_id)) || []
    const hit = list.some(ts => Math.abs(ts - t) <= 6 * 60 * 60 * 1000)
    if (!hit) {
      noTraining++
      const k = String(p.telegram_id)
      victims.set(k, (victims.get(k) || 0) + n(p.stars))
    }
  }
  console.log(
    `  оплат обучения: ${trainPays.length}, без записи об обучении в ±6 часов: ${noTraining}`
  )
  console.log(`  людей: ${victims.size}`)
  for (const [uid, stars] of [...victims.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)) {
    console.log(`    ${uid.padEnd(13)} ${Math.round(stars)} звёзд`)
  }
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
