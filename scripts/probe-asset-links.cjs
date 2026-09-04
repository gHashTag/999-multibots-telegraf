#!/usr/bin/env node
/**
 * READ-ONLY. Проверяет, живы ли ссылки на ассеты — по возрасту.
 *
 * Повод: 171 ссылка на tempfile.aiquickdraw.com отдаёт 404, и это не история,
 * а текущая утечка (docs/audit/recount-by-people.md). Открытый вопрос: то же
 * самое с 1214 ссылками на replicate.delivery или нет? От ответа зависит,
 * идёт речь о десяти пострадавших или о всех пятидесяти восьми.
 *
 * Метод: выборка по месяцам — от старых к новым, HEAD-запросом. Разбивка по
 * возрасту важнее общей доли: если старые мертвы, а свежие живы, значит ссылки
 * протухают со временем, и вопрос лишь в сроке.
 *
 * Запросы только HEAD и только к CDN — ничего не скачиваем и не меняем.
 */
const { hostCensus, selfCheck: urlSelfCheck } = require('./lib/url-host.cjs')
// Runs BEFORE the credentials are touched, so it is verifiable without a
// database -- these probes cannot otherwise be exercised here at all.
urlSelfCheck()
const urls = hostCensus()
const url = process.env.SUPABASE_URL.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: key, Authorization: `Bearer ${key}` }

const PER_MONTH = Number(process.env.PER_MONTH || 4)

async function fetchAll(table, select) {
  const out = []
  let from = 0
  for (;;) {
    const res = await fetch(`${url}/rest/v1/${table}?select=${select}`, {
      headers: { ...H, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
    })
    if (!res.ok) throw new Error(`${table} ${res.status}`)
    const rows = await res.json()
    if (!rows.length) break
    out.push(...rows)
    if (rows.length < 1000) break
    from += 1000
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
    return `сеть:${String(e.message).slice(0, 24)}`
  }
}

async function main() {
  const rows = await fetchAll(
    'assets',
    'telegram_id,public_url,created_at,type'
  )

  const groups = new Map() // host -> month -> [rows]
  for (const r of rows) {
    const u = String(r.public_url || '')
    if (!u || u.startsWith('data:')) continue
    // Unparseable URLs are counted, not dropped: a row that vanishes here
    // shrinks the population the verdict below is computed over.
    const host = urls.hostOf(u)
    if (host === null) continue
    const month = String(r.created_at).slice(0, 7)
    if (!groups.has(host)) groups.set(host, new Map())
    const m = groups.get(host)
    if (!m.has(month)) m.set(month, [])
    m.get(month).push(r)
  }

  console.log(`\n${urls.note()}`)
  for (const [host, months] of [...groups.entries()].sort(
    (a, b) =>
      [...b[1].values()].flat().length - [...a[1].values()].flat().length
  )) {
    const total = [...months.values()].flat().length
    console.log(`\n=== ${host}  (всего ${total}) ===`)
    console.log('месяц     в базе  проверено  живых  мертвых')

    for (const month of [...months.keys()].sort()) {
      const list = months.get(month)
      const sample = list.slice(0, PER_MONTH)
      let ok = 0
      let bad = 0
      const codes = []
      for (const r of sample) {
        const st = await alive(r.public_url)
        codes.push(st)
        if (st === 200) ok++
        else bad++
      }
      const mark =
        bad === sample.length && sample.length > 0 ? '  <-- ВСЕ МЕРТВЫ' : ''
      console.log(
        `${month}  ${String(list.length).padStart(6)}  ${String(sample.length).padStart(9)}  ${String(ok).padStart(5)}  ${String(bad).padStart(7)}${mark}   ${[...new Set(codes)].join(',')}`
      )
    }
  }
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
