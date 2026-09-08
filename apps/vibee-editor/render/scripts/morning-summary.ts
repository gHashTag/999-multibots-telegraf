/**
 * УТРЕННЯЯ СВОДКА — вся ночь работы одним файлом.
 *
 * Владелец просыпается и читает loop/MORNING.md: что опубликовано, какой
 * отклик, что сказал журнал, жив ли стек. Никаких «зайди посмотри в три
 * места» — сводка сама собирается из тех же источников, что и цикл:
 * MCP-инструменты (feed_analytics, feed_list) и журнал автопилота.
 *
 * Запуск тем же окружением, что автопилот (нужен AGENT_KEYS, SELF_URL):
 *   npx tsx scripts/morning-summary.ts
 * Чистое чтение: ничего не публикует и не меняет.
 */
import fs from 'node:fs'
import path from 'node:path'

const BASE =
  process.env.SELF_URL || 'http://127.0.0.1:' + (process.env.PORT || '3333')
const KEY = (process.env.AGENT_KEYS || '').split(',')[0]?.split(':')[0] || ''
if (!KEY) {
  console.error('[morning] нет AGENT_KEYS')
  process.exit(1)
}
const LOOP_DIR =
  process.env.LOOP_DIR || path.resolve(process.cwd(), '../../../loop')
const OUT = path.join(LOOP_DIR, 'MORNING.md')
const LOG = path.join(LOOP_DIR, 'LOOP_STATE.md')

/** Касса звёзд: инвойсы/погашения/звёзды за сутки. Опционально — без
 *  DATABASE_URL сводка просто не показывает секцию (никаких крашей). */
async function cashierSection(): Promise<string[]> {
  if (!process.env.DATABASE_URL) return []
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    // The stamp a cancelled draft leaves; idempotent, same as the server.
    await pool.query(
      `ALTER TABLE token_invoices
         ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
         ADD COLUMN IF NOT EXISTS cancel_reason text`
    )
    const inv = await pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE redeemed)::int AS paid,
              count(*) FILTER (WHERE NOT redeemed AND cancelled_at IS NOT NULL)::int AS cancelled,
              count(*) FILTER (WHERE NOT redeemed AND cancelled_at IS NULL)::int AS waiting,
              coalesce(sum(stars) FILTER (WHERE redeemed), 0)::int AS stars
         FROM token_invoices
        WHERE created_at > now() - interval '24 hours'`
    )
    const r = inv.rows[0]
    return [
      `## Касса звёзд (24 ч)`,
      `- инвойсов: ${r.total}, оплачено: ${r.paid}, ждут: ${r.waiting}, отменено: ${r.cancelled}, звёзд получено: ${r.stars}`,
      r.paid > 0
        ? `- экономика живая: покупки прошли, токены зачислены (вебхук + verify)`
        : r.waiting > 0
          ? `- покупок пока нет — ${r.waiting} счёт(а) ждут, напомни человеку`
          : `- покупок и ожидающих счетов нет: отменённые в счёт не идут`,
    ]
  } finally {
    await pool.end()
  }
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Key': KEY },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  })
  const d = await r.json()
  if (d.error) throw new Error(`${name}: ${d.error.message}`)
  return d.result.structuredContent
}

async function main() {
  const now = Date.now()
  const lines: string[] = []
  lines.push(`# УТРЕННЯЯ СВОДКА — ${new Date().toISOString()}`)
  lines.push('')

  // 1. Отклик и посты — из инструментов, не из памяти.
  try {
    const a = await call('feed_analytics')
    lines.push(`## Отклик`)
    lines.push(
      `- постов: ${a['постов']}, просмотров: ${a['просмотров']}, звёзд: ${a['звёзд']}, ремиксов: ${a['ремиксов']}`
    )
    lines.push(
      `- средние просмотры на пост: ${a['среднее_просмотров']}; лучший — «${a['лучший_пост']?.name ?? '—'}» (${a['лучший_пост']?.просмотров ?? 0})`
    )
    if (a['заголовки_AB']) {
      lines.push(`- A/B заголовков:`)
      for (const row of a['заголовки_AB']) {
        lines.push(
          `  - стиль ${row.style}: ${row['постов']} постов, ${row['просмотров']} просмотров`
        )
      }
    }
  } catch (e) {
    lines.push(`## Отклик — не собрался: ${String(e).slice(0, 160)}`)
  }
  lines.push('')

  // 1a. Касса звёзд — экономика в сводке с первого дня продаж.
  try {
    lines.push(...(await cashierSection()))
  } catch (e) {
    lines.push(`## Касса — не собралась: ${String(e).slice(0, 120)}`)
  }
  lines.push('')

  // 1b. Ретроспектива конвейера — если собрана не позже недели,
  // владелец видит темп и слоты прямо в сводке (файл целиком — по ссылке).
  try {
    const retro = path.join(LOOP_DIR, 'RETROSPECTIVE.md')
    const raw = fs.readFileSync(retro, 'utf8')
    const m = raw.match(/КОНВЕЙЕРА — (\S+)/)
    if (m && now - Date.parse(m[1]) < 7 * 86400_000) {
      const pick = (re: RegExp) => raw.match(re)?.[1] ?? '—'
      lines.push(`## Конвейер (ретроспектива ${m[1].slice(0, 10)})`)
      lines.push(`- постов за окно: ${pick(/- постов за окно: ([^\n]+)/)}`)
      lines.push(`- расписание: ${pick(/- рекомендация расписания: ([^\n]+)/)}`)
      lines.push(`- полностью: loop/RETROSPECTIVE.md`)
    }
  } catch {
    /* ретроспективы ещё нет — цикл №214 только готовит её */
  }

  // 2. Свежие посты (12 часов) — что вышло за ночь.
  try {
    const mine = await call('feed_list', { mine: true, limit: 20 })
    const fresh = (mine?.записи || []).filter(
      (x: any) => now - Date.parse(x.created_at) < 12 * 3_600_000
    )
    lines.push(`## За последние 12 часов (${fresh.length} постов)`)
    for (const x of fresh) {
      lines.push(
        `- «${x.name}» (id ${x.id}): просмотров ${x.views_count}, звёзд ${x.likes_count} — ${x.video_url}`
      )
    }
    if (!fresh.length)
      lines.push('- публикаций не было (лимит/интервал/очередь — см. журнал)')
  } catch (e) {
    lines.push(`## За 12 часов — не собралось: ${String(e).slice(0, 160)}`)
  }
  lines.push('')

  // 3. Журнал за 12 часов — что делал цикл и автопилот.
  try {
    const raw = fs.readFileSync(LOG, 'utf8').split('\n')
    const recent = raw.filter(l => {
      const m = l.match(/^- (\d{4}-\d{2}-\d{2}T[\d:.]+Z) /)
      return m && now - Date.parse(m[1]) < 12 * 3_600_000
    })
    lines.push(`## Журнал цикла (12 ч, ${recent.length} записей)`)
    lines.push(...recent)
    if (!recent.length)
      lines.push('- записи за 12 часов: см. LOOP_STATE.md целиком')
  } catch {
    lines.push('## Журнал — не прочитался')
  }
  lines.push('')

  // 4. Стек: сводка сама говорит, живо ли то, что её производит.
  lines.push('## Стек')
  for (const [name, url] of [
    ['render :3333', `${BASE}/health`],
    ['player :5173', 'http://localhost:5173'],
    ['бэкенд :2999', 'http://localhost:2999/health'],
  ]) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
      lines.push(`- ${name}: ${r.ok ? 'жив' : `ответ ${r.status}`}`)
    } catch {
      lines.push(`- ${name}: НЕ ОТВЕЧАЕТ`)
    }
  }
  lines.push('')
  lines.push('---')
  lines.push('Сводка собрана автоматически, чтение без побочных эффектов.')

  fs.mkdirSync(LOOP_DIR, { recursive: true })
  fs.writeFileSync(OUT, lines.join('\n'))
  console.log(`[morning] сводка: ${OUT} (${lines.length} строк)`)
}

main().catch(e => {
  console.error('[morning] падение:', String(e).slice(0, 300))
  process.exit(1)
})
