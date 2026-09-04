#!/usr/bin/env node
/**
 * READ-ONLY. Списывается ли что-нибудь за обучение на ЖИВЫХ путях.
 *
 * Повод: единственный зарегистрированный обработчик model/training.start —
 * existing/generateModelTrainingFunction — не содержит ни одного денежного
 * вызова, и отправляющая сцена (uploadTrainFluxModelScene) тоже. Файлы, где
 * списание ЕСТЬ (training/generateModelTraining, training/voiceTrainingRVC),
 * не зарегистрированы (см. src/__tests__/inngest/registration.test.ts).
 *
 * Гипотеза для проверки: обучение моделей сейчас не списывает ничего, а
 * обучение голоса списывает и не оказывает услугу (событие voice/training.start
 * никто не слушает).
 *
 * Вопросы к данным:
 *   1. Есть ли списания за голосовое обучение ('Voice training') и когда?
 *   2. Существует ли voice_models и есть ли в ней строки?
 *   3. У недавних записей model_trainings есть ли списание рядом по времени?
 *      Знаменатель обязателен: сколько обучений осмотрено, у скольких списание.
 *
 * Отрицательный контроль: у обучений сентября–октября 2025 (когда списание
 * было живым — 69 плативших, docs/audit/training-money-truth.md) доля
 * «со списанием» должна быть заметно выше нуля. Если и там ноль — сломан
 * сам замер (сопоставление), а не списание.
 *
 * Ничего не пишет.
 */
const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: key, Authorization: `Bearer ${key}` }

async function get(pathAndQuery) {
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, { headers: H })
  if (!res.ok) return { ok: false, status: res.status, rows: [] }
  const rows = await res.json()
  return { ok: true, status: res.status, rows: Array.isArray(rows) ? rows : [] }
}

async function fetchAll(pathAndQuery) {
  const out = []
  let from = 0
  for (;;) {
    const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
      headers: { ...H, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
    })
    if (!res.ok) break
    const rows = await res.json()
    if (!Array.isArray(rows) || !rows.length) break
    out.push(...rows)
    if (rows.length < 1000) break
    from += 1000
    if (from > 40000) break
  }
  return out
}

/**
 * The matching rule, callable on a sample.
 *
 * It answers "was there a charge beside this training", and every comparison
 * with NaN is false -- so a training whose date will not parse, or a charge
 * whose date will not parse, reads as a training nobody paid for. That IS the
 * finding this probe reports, so the failure mode manufactures it.
 *
 * Runs before any fetch: what is checked is the time matching, not the query.
 */
const MATCH_WINDOW_MS = 6 * 60 * 60 * 1000
function chargeNear(charges, training) {
  const ts = Date.parse(training.created_at)
  if (Number.isNaN(ts)) return null // cannot tell, not "no charge"
  return (
    charges.find(
      c =>
        String(c.telegram_id) === String(training.telegram_id) &&
        // No NaN guard on this side on purpose: Math.abs(NaN - ts) < W is
        // already false, so an unparseable charge date can never match. A guard
        // here would be a rule no mutation can kill -- removing it left every
        // assertion green, which is the definition of redundant.
        Math.abs(Date.parse(c.payment_date) - ts) < MATCH_WINDOW_MS
    ) || false
  )
}

function selfCheck() {
  const training = { telegram_id: 7, created_at: '2026-09-01T12:00:00Z' }
  const near = [{ telegram_id: 7, payment_date: '2026-09-01T14:00:00Z' }]
  const far = [{ telegram_id: 7, payment_date: '2026-09-02T12:00:00Z' }]
  const other = [{ telegram_id: 8, payment_date: '2026-09-01T12:05:00Z' }]

  if (!chargeNear(near, training)) {
    console.error('самопроверка не прошла: списание внутри окна не найдено.')
    process.exit(2)
  }
  if (chargeNear(far, training) !== false) {
    console.error('самопроверка не прошла: списание за окном засчитано.')
    process.exit(2)
  }
  if (chargeNear(other, training) !== false) {
    console.error(
      'самопроверка не прошла: чужое списание засчитано этому обучению.'
    )
    process.exit(2)
  }
  // The defect itself, on both sides.
  if (chargeNear(near, { telegram_id: 7, created_at: 'not a date' }) !== null) {
    console.error(
      'самопроверка не прошла: обучение с неразбираемой датой должно быть\n' +
        '«не оценить», а не «без списания» — иначе доля бесплатных завышается.'
    )
    process.exit(2)
  }
  console.log(
    'самопроверка: окно и владелец различаются, неразбираемые даты не считаются отсутствием списания'
  )
}

selfCheck()

async function main() {
  // --- Самопроверка искалки: заведомо-положительный и заведомо-отрицательный
  const pos = await get('payments_v2?select=id&limit=1')
  const neg = await get(
    'payments_v2?select=id&description=eq.__NO_SUCH_DESCRIPTION__&limit=1'
  )
  if (!pos.ok || pos.rows.length !== 1 || !neg.ok || neg.rows.length !== 0) {
    console.error('САМОПРОВЕРКА НЕ ПРОШЛА: запросы к payments_v2 не работают', {
      pos: { ok: pos.ok, n: pos.rows.length },
      neg: { ok: neg.ok, n: neg.rows.length },
    })
    process.exit(2)
  }

  // --- 1. Голосовое обучение: списания и возвраты -------------------------
  console.log('=== 1. Платежи со словом «Voice training» ===')
  const voicePays = await fetchAll(
    'payments_v2?select=telegram_id,stars,type,description,payment_date,status&description=ilike.*voice%20training*&order=payment_date.desc'
  )
  console.log(`строк: ${voicePays.length}`)
  for (const p of voicePays.slice(0, 20)) {
    console.log(
      `  ${String(p.payment_date).slice(0, 10)}  ${p.type}  ${p.stars}⭐  ${p.telegram_id}  ${p.description}`
    )
  }

  // --- 2. Таблица voice_models --------------------------------------------
  console.log('\n=== 2. voice_models ===')
  const vm = await get(
    'voice_models?select=id,telegram_id,status,created_at&order=created_at.desc&limit=10'
  )
  if (!vm.ok) {
    console.log(
      `таблица недоступна: HTTP ${vm.status} (вероятно, не существует)`
    )
  } else {
    console.log(`строк (последние 10): ${vm.rows.length}`)
    for (const r of vm.rows)
      console.log(
        `  ${String(r.created_at).slice(0, 10)}  ${r.status}  ${r.telegram_id}`
      )
  }

  // --- 3. model_trainings против списаний ---------------------------------
  console.log('\n=== 3. Обучения моделей и списания рядом по времени ===')
  const trainings = await fetchAll(
    'model_trainings?select=id,telegram_id,created_at,status&order=created_at.desc&limit=300'
  )
  const charges = await fetchAll(
    'payments_v2?select=telegram_id,stars,payment_date,description&type=eq.MONEY_OUTCOME&or=(description.ilike.*%D1%82%D1%80%D0%B5%D0%BD%D0%B8%D1%80%D0%BE%D0%B2%D0%BA*,description.ilike.*model%20training*,description.ilike.*NeuroBase*)'
  )
  console.log(
    `осмотрено обучений: ${trainings.length}, списаний с «тренировк/model training» всего: ${charges.length}`
  )

  const WINDOW_MS = 6 * 60 * 60 * 1000
  const byMonth = {}
  for (const t of trainings) {
    const ts = Date.parse(t.created_at)
    const m = String(t.created_at).slice(0, 7)
    byMonth[m] = byMonth[m] || { total: 0, charged: 0, unknown: 0 }
    byMonth[m].total++
    // Every comparison with NaN is false, so a training whose date will not
    // parse finds no charge beside it and reads as "trained for free" -- which
    // is the finding this probe reports. That is not what was measured; it is
    // "cannot tell". Counted apart, and kept out of the ratio below.
    if (Number.isNaN(ts)) {
      byMonth[m].unknown++
      continue
    }
    const hit = charges.find(
      c =>
        String(c.telegram_id) === String(t.telegram_id) &&
        Math.abs(Date.parse(c.payment_date) - ts) < WINDOW_MS
    )
    if (hit) byMonth[m].charged++
  }
  console.log('месяц      обучений  со списанием рядом (±6ч)  не оценить')
  for (const m of Object.keys(byMonth).sort().reverse()) {
    const b = byMonth[m]
    console.log(
      `${m}    ${String(b.total).padStart(4)}      ${String(b.charged).padStart(4)}` +
        `                ${String(b.unknown || 0).padStart(4)}`
    )
  }

  // Отрицательный контроль: месяцы, когда списание точно жило (2025-07..10),
  // обязаны показать долю > 0. Если нет — сломан сам замер.
  const controlMonths = ['2025-07', '2025-08', '2025-09', '2025-10']
  const ctrl = controlMonths.reduce(
    (a, m) => {
      if (byMonth[m]) {
        a.total += byMonth[m].total
        a.charged += byMonth[m].charged
      }
      return a
    },
    { total: 0, charged: 0 }
  )
  if (ctrl.total > 0 && ctrl.charged === 0) {
    console.error(
      `\nОТРИЦАТЕЛЬНЫЙ КОНТРОЛЬ НЕ ПРОШЁЛ: за ${controlMonths.join(',')} ` +
        `${ctrl.total} обучений и ноль списаний рядом — сопоставление сломано`
    )
    process.exit(2)
  }
  console.log(
    `\nконтроль (2025-07..10): обучений ${ctrl.total}, со списанием ${ctrl.charged} — ` +
      (ctrl.total
        ? 'сопоставление работает'
        : 'в окне контроля обучений нет (контроль пуст, читать с осторожностью)')
  )

  // --- 4. Второй способ: обучения с ноября 2025 против ЛЮБЫХ списаний ------
  // Матчер описаний (раздел 3) может промахиваться по формулировкам; здесь
  // окно ±6ч и любой MONEY_OUTCOME того же человека — сильнее и уже.
  console.log('\n=== 4. Обучения с 2025-11: любые списания рядом (±6ч) ===')
  const TEST_ACCOUNT = '144022504'
  const recent = trainings.filter(t => String(t.created_at) >= '2025-11-01')
  let testRows = 0
  let realZero = 0
  let realNonTraining = 0
  for (const t of recent) {
    const ids = String(t.telegram_id)
    const ts = Date.parse(t.created_at)
    const from = new Date(ts - WINDOW_MS).toISOString()
    const to = new Date(ts + WINDOW_MS).toISOString()
    const near = await fetchAll(
      `payments_v2?select=stars,description,payment_date&telegram_id=eq.${ids}` +
        `&type=eq.MONEY_OUTCOME&payment_date=gte.${from}&payment_date=lte.${to}`
    )
    const isTest = ids === TEST_ACCOUNT
    if (isTest) testRows++
    else if (near.length === 0) realZero++
    else realNonTraining++
    console.log(
      `  ${String(t.created_at).slice(0, 16)}  ${t.status}  tg=${ids}${isTest ? ' (тест)' : ''}` +
        `  списаний(любых): ${near.length}` +
        (near.length
          ? '  [' +
            near
              .map(p => `${p.stars}⭐ ${String(p.description).slice(0, 30)}`)
              .join(' | ') +
            ']'
          : '')
    )
  }
  console.log(
    `итого с 2025-11: ${recent.length} обучений; тестовый аккаунт: ${testRows}; ` +
      `живые без списаний вообще: ${realZero}; живые только с оплатами не-обучения: ${realNonTraining}`
  )
}

main().catch(e => {
  console.error('ОШИБКА ЗАМЕРА:', e.message)
  process.exit(1)
})
