#!/usr/bin/env node
/**
 * READ-ONLY. Ищет следы использования эндпоинтов, которые были открыты.
 *
 * Что было открыто (закрыто в PR #526 и #527):
 *   POST /api/generate/neuro-photo-sync   списывал звёзды с номера ИЗ ТЕЛА
 *   POST /api/generate/voice-avatar       то же
 *   POST /api/video-callback/:id          слал видео кому угодно
 *   GET  /api/billing, /api/models/:id …  отдавал данные
 *
 * Отпечаток, по которому такие запросы отличимы: оба маршрута генерации
 * подставляют в контекст `from: { username: 'api_user' }` и НЕ передают
 * `bot_name`, если его не прислали. Значит, записи, рождённые через API,
 * должны отличаться от рождённых в боте.
 *
 * Инструмент не доказывает злоупотребление — он показывает, есть ли вообще
 * записи с такими признаками. Отсутствие следов тоже результат.
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
    if (from > 40000) break
  }
  return out
}

const n = x => Number(x ?? 0)
const r2 = x => Math.round(x * 100) / 100

async function main() {
  // --- 1. Прямой отпечаток: api_user ------------------------------------
  console.log('=== 1. Записи с отпечатком «api_user» ===')
  let found = 0
  for (const [table, cols] of [
    ['users', 'telegram_id,username,bot_name,created_at'],
    ['prompts_history', 'telegram_id,model_type,created_at'],
    ['payments_v2', 'telegram_id,description,payment_method,bot_name,payment_date'],
    ['assets', 'telegram_id,type,bot_name,created_at'],
  ]) {
    const rows = await fetchAll(table, cols)
    const hits = rows.filter(r => JSON.stringify(r).includes('api_user'))
    console.log(`  ${table.padEnd(18)} ${hits.length} из ${rows.length}`)
    found += hits.length
    for (const h of hits.slice(0, 5)) console.log(`      ${JSON.stringify(h).slice(0, 120)}`)
  }
  if (!found) console.log('  следов не найдено')

  // --- 2. Списания без бота ---------------------------------------------
  //
  // Маршрут генерации не заполняет bot_name, если его не прислали. Записи из
  // самого бота почти всегда с ботом.
  console.log('\n=== 2. Списания за генерацию без указания бота ===')
  const pay = await fetchAll(
    'payments_v2',
    'telegram_id,stars,type,status,description,service_type,bot_name,payment_date,payment_method'
  )
  const gen = pay.filter(
    p =>
      p.status === 'COMPLETED' &&
      p.type === 'MONEY_OUTCOME' &&
      /neuro_photo|neurophoto|voice|generat/i.test(
        String(p.service_type || '') + ' ' + String(p.description || '')
      )
  )
  const noBot = gen.filter(p => !p.bot_name || p.bot_name === 'unknown_bot')
  console.log(`  всего списаний за генерацию: ${gen.length}`)
  console.log(`  из них без бота или с 'unknown_bot': ${noBot.length}`)
  const byMonth = {}
  for (const p of noBot) {
    const m = String(p.payment_date).slice(0, 7)
    byMonth[m] = (byMonth[m] || 0) + 1
  }
  for (const [m, c] of Object.entries(byMonth).sort()) console.log(`      ${m}  ${c}`)

  // --- 3. Списание есть, промпта нет ------------------------------------
  //
  // Через бота генерация оставляет запись в prompts_history. Через открытый
  // маршрут — не всегда: обработчик зовёт сервис напрямую.
  console.log('\n=== 3. Списания за нейрофото без промпта рядом по времени ===')
  const prompts = await fetchAll('prompts_history', 'telegram_id,created_at')
  const byUser = new Map()
  for (const p of prompts) {
    const k = String(p.telegram_id)
    if (!byUser.has(k)) byUser.set(k, [])
    byUser.get(k).push(Date.parse(p.created_at))
  }
  const photoPays = gen.filter(p => /neuro_photo|neurophoto/i.test(String(p.service_type || '')))
  let orphan = 0
  const orphanUsers = new Map()
  for (const p of photoPays) {
    const t = Date.parse(p.payment_date)
    const list = byUser.get(String(p.telegram_id)) || []
    const near = list.some(x => Math.abs(x - t) < 15 * 60 * 1000)
    if (!near) {
      orphan++
      orphanUsers.set(p.telegram_id, (orphanUsers.get(p.telegram_id) || 0) + 1)
    }
  }
  console.log(`  списаний за нейрофото: ${photoPays.length}`)
  console.log(`  без промпта в пределах 15 минут: ${orphan}`)
  for (const [u, c] of [...orphanUsers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`      uid=${String(u).padEnd(13)} ${c}`)
  }

  // --- 4. Всплески: много списаний у одного за короткое время ------------
  console.log('\n=== 4. Всплески: 5+ списаний у одного человека за 10 минут ===')
  const byU = new Map()
  for (const p of gen) {
    const k = String(p.telegram_id)
    if (!byU.has(k)) byU.set(k, [])
    byU.get(k).push({ t: Date.parse(p.payment_date), s: n(p.stars) })
  }
  let bursts = 0
  for (const [u, list] of byU) {
    list.sort((a, b) => a.t - b.t)
    for (let i = 0; i < list.length; i++) {
      const win = list.filter(x => x.t >= list[i].t && x.t < list[i].t + 10 * 60 * 1000)
      if (win.length >= 5) {
        bursts++
        console.log(
          `      uid=${u.padEnd(13)} ${win.length} списаний на ${r2(win.reduce((s, x) => s + x.s, 0))} звёзд с ${new Date(list[i].t).toISOString().slice(0, 16)}`
        )
        break
      }
    }
  }
  if (!bursts) console.log('  всплесков не найдено')
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
