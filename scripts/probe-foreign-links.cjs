#!/usr/bin/env node
/**
 * READ-ONLY. Ищет ВСЕ места в базе, где хранится чужая ссылка, и проверяет,
 * жива ли она.
 *
 * Повод: в таблице `assets` из 1496 ссылок протухли 1481 — мы сохраняли адрес
 * у провайдера вместо того, чтобы переложить файл к себе
 * (docs/audit/asset-links.md). Вопрос: это единственная таблица с такой
 * болезнью или нет?
 *
 * Метод: пройти все существующие таблицы, найти колонки со значениями вида
 * `http(s)://`, разложить по хостам и проверить выборку HEAD-запросами.
 *
 * Свои хосты (Supabase Storage, наш домен) считаем нормой — их и надо было
 * использовать. Чужие — риск по определению, вопрос только в сроке.
 *
 * Ничего не пишет. Только HEAD-запросы к CDN.
 */
const { hostCensus, selfCheck: urlSelfCheck } = require('./lib/url-host.cjs')
// Runs BEFORE the credentials are touched, so it is verifiable without a
// database -- these probes cannot otherwise be exercised here at all.
urlSelfCheck()
const urls = hostCensus()
const url = process.env.SUPABASE_URL.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: key, Authorization: `Bearer ${key}` }

const PER_HOST = Number(process.env.PER_HOST || 3)

// Таблицы, которые существуют — из docs/audit/table-seams.md.
const TABLES = [
  'assets',
  'attachments',
  'avatars',
  'eleven_labs_transcriptions',
  'game',
  'idempotency_keys',
  'instagram_apify_reels',
  'instagram_scrapings',
  'jobs',
  'model_trainings',
  'payments_v2',
  'pending_messages',
  'prompts_history',
  'superhero_generations',
  'synclabs_videos',
  'templates',
  'translations',
  'user_feature_views',
  'users',
]

const ourHost = new URL(url).host

async function fetchAll(table) {
  const out = []
  let from = 0
  for (;;) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
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

async function alive(link) {
  try {
    const res = await fetch(link, {
      method: 'HEAD',
      signal: AbortSignal.timeout(20000),
    })
    return res.status
  } catch (e) {
    return `сеть:${String(e.message).slice(0, 20)}`
  }
}

async function main() {
  // host -> { count, samples: [], where: Set('таблица.колонка') }
  const hosts = new Map()

  for (const table of TABLES) {
    const rows = await fetchAll(table)
    if (!rows.length) continue
    for (const r of rows) {
      for (const [col, val] of Object.entries(r)) {
        if (typeof val !== 'string') continue
        if (!/^https?:\/\//.test(val)) continue
        const host = urls.hostOf(val)
        if (host === null) continue
        if (!hosts.has(host))
          hosts.set(host, { count: 0, samples: [], where: new Set() })
        const h = hosts.get(host)
        h.count++
        h.where.add(`${table}.${col}`)
        if (h.samples.length < PER_HOST) h.samples.push(val)
      }
    }
  }

  const sorted = [...hosts.entries()].sort((a, b) => b[1].count - a[1].count)
  console.log(`хостов найдено: ${sorted.length}\n`)
  console.log('хост'.padEnd(34) + 'ссылок'.padStart(7) + '  живых  где')

  for (const [host, h] of sorted) {
    const own = host === ourHost
    let ok = 0
    let bad = 0
    if (!own) {
      for (const s of h.samples) {
        const st = await alive(s)
        if (st === 200) ok++
        else bad++
      }
    }
    const verdict = own
      ? 'СВОЙ'
      : ok === 0 && bad > 0
        ? `0/${bad + ok} ❌`
        : `${ok}/${ok + bad}`
    console.log(
      `${host.slice(0, 33).padEnd(34)}${String(h.count).padStart(7)}  ${verdict.padEnd(7)} ${[...h.where].slice(0, 3).join(', ')}${h.where.size > 3 ? ` +${h.where.size - 3}` : ''}`
    )
  }

  const dead = sorted.filter(([host]) => host !== ourHost)
  console.log(`\n${urls.note()}`)
  console.log(
    `\nвсего чужих ссылок в базе: ${dead.reduce((s, [, h]) => s + h.count, 0)}`
  )
  const own = sorted.find(([host]) => host === ourHost)
  console.log(`своих: ${own ? own[1].count : 0}`)
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
