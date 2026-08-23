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
const LOOP_DIR = process.env.LOOP_DIR || path.resolve(process.cwd(), '../../../loop')
const OUT = path.join(LOOP_DIR, 'MORNING.md')
const LOG = path.join(LOOP_DIR, 'LOOP_STATE.md')

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
        lines.push(`  - стиль ${row.style}: ${row['постов']} постов, ${row['просмотров']} просмотров`)
      }
    }
  } catch (e) {
    lines.push(`## Отклик — не собрался: ${String(e).slice(0, 160)}`)
  }
  lines.push('')

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
    if (!fresh.length) lines.push('- публикаций не было (лимит/интервал/очередь — см. журнал)')
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
    lines.push(...recent.map(l => l.replace('^- '.length ? /^- / : /^- /, '- ')))
    if (!recent.length) lines.push('- записи за 12 часов: см. LOOP_STATE.md целиком')
  } catch {
    lines.push('## Журнал — не прочитался')
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
