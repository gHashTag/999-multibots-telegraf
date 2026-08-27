/**
 * РЕТРОСПЕКТИВА КОНВЕЙЕРА — неделя производства одним файлом.
 *
 * Отвечает на три вопроса владельца: стоило ли производство затрат,
 * какой стиль заголовка работает, когда публиковать. Пишет
 * loop/RETROSPECTIVE.md. Чистое чтение: ничего не публикует.
 *
 * Метрики:
 *  - темп: постов/день за окно 7 дней, разрывы (дни без постов);
 *  - A/B: посты и просмотры по ab_style, среднее на пост — стиль
 *    считается решённым только при ≥5 постов на группу;
 *  - reach velocity: просмотры в день с момента публикации — по ней
 *    выбирается расписание (пункт плана «уточнение по данным»);
 *  - часы публикации (UTC): у каких часов выше догон просмотров.
 *
 * Запуск тем же окружением, что автопилот (нужен DATABASE_URL):
 *   npx tsx scripts/pipeline-retrospective.ts [дней окна, по умолчанию 7]
 */
import fs from 'node:fs'
import path from 'node:path'

if (!process.env.DATABASE_URL) {
  console.error('[retro] нет DATABASE_URL')
  process.exit(1)
}
const LOOP_DIR = process.env.LOOP_DIR || path.resolve(process.cwd(), '../../../loop')
const OUT = path.join(LOOP_DIR, 'RETROSPECTIVE.md')
const HISTORY = path.join(LOOP_DIR, 'retro-history.json')
const WINDOW_DAYS = Math.max(1, Number(process.argv[2]) || 7)

/** Снапшот метрик каждого прогона: ретро перезаписывается, а тренд
 *  между прогонами (дельта постов/просмотров) живёт здесь. */
type Snap = { at: string; windowDays: number; posts: number; views: number; stars: number }
function readHistory(): Snap[] {
  try {
    return JSON.parse(fs.readFileSync(HISTORY, 'utf8'))
  } catch {
    return []
  }
}

/** Бенчмарки short-form retention 2026 (Retensis/ReportDash/Swydo) —
 *  ориентир для «сколько смотреть», не для «сколько набрать просмотров». */
const BENCHMARKS = [
  'клипы <15 с: retention >60% — планка лучших',
  'клипы 15–30 с: 50%',
  'клипы 30–60 с: 40%',
]

async function main() {
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const posts = await pool.query(
      `SELECT id, name,
              views_count::int, stars_count::int, uses_count::int,
              template_settings->>'ab_style' AS ab_style,
              created_at::text,
              extract(hour from created_at)::int AS hour_utc
         FROM public_templates
        WHERE is_public = TRUE AND deleted_at IS NULL
        ORDER BY created_at DESC`
    )
    const rows = posts.rows as any[]
    const now = Date.now()
    const windowMs = WINDOW_DAYS * 86400_000
    const week = rows.filter(x => now - Date.parse(x.created_at) < windowMs)

    const L: string[] = []
    L.push(`# РЕТРОСПЕКТИВА КОНВЕЙЕРА — ${new Date().toISOString()} (окно ${WINDOW_DAYS} дн)`)
    L.push('')

    // 1. Темп производства.
    const byDay = new Map<string, number>()
    for (const x of week) {
      const d = x.created_at.slice(0, 10)
      byDay.set(d, (byDay.get(d) || 0) + 1)
    }
    const days = [...byDay.entries()].sort()
    const gapDays = WINDOW_DAYS - days.length
    L.push(`## Темп`)
    L.push(`- постов за окно: ${week.length} (${(week.length / WINDOW_DAYS).toFixed(1)}/день); дней без публикаций: ${gapDays}`)
    for (const [d, n] of days) L.push(`- ${d}: ${n}`)
    if (week.length < WINDOW_DAYS * 2)
      L.push(`- ⚠️ данных мало (целился в 4/день, вышел ${week.length}/${WINDOW_DAYS}): конвейер стоял или был BLOCKED — выводы по стилям ниже предварительные`)
    L.push('')

    // 2. A/B заголовков.
    const ab = new Map<string, { posts: number; views: number }>()
    for (const x of week) {
      const s = x.ab_style || 'без метки'
      const e = ab.get(s) || { posts: 0, views: 0 }
      e.posts++
      e.views += x.views_count
      ab.set(s, e)
    }
    L.push(`## A/B заголовков (окно)`)
    for (const [style, e] of ab) {
      const avg = e.posts ? (e.views / e.posts).toFixed(1) : '0'
      const verdict =
        e.posts >= 5 ? `${avg} ср. просмотров` : `мало постов (${e.posts}), не решено`
      L.push(`- стиль ${style}: ${e.posts} постов, ${e.views} просмотров — ${verdict}`)
    }
    L.push('')

    // 3. Reach velocity — основа расписания.
    const withVel = week.map(x => {
      const ageDays = Math.max(1, (now - Date.parse(x.created_at)) / 86400_000)
      return { ...x, vel: x.views_count / ageDays }
    })
    const avgVel = withVel.length
      ? withVel.reduce((a, x) => a + x.vel, 0) / withVel.length
      : 0
    L.push(`## Reach velocity (просмотров/день с публикации)`)
    L.push(`- средняя: ${avgVel.toFixed(2)}`)
    const top = [...withVel].sort((a, b) => b.vel - a.vel).slice(0, 5)
    for (const x of top)
      L.push(`- «${x.name}» (id ${x.id}): ${x.vel.toFixed(2)} — всего ${x.views_count} за ${Math.round((now - Date.parse(x.created_at)) / 86400_000)} дн`)
    L.push('')

    // 4. Часы публикации (UTC) — где догоняют просмотры.
    const byHour = new Map<number, { posts: number; views: number }>()
    for (const x of week) {
      const e = byHour.get(x.hour_utc) || { posts: 0, views: 0 }
      e.posts++
      e.views += x.views_count
      byHour.set(x.hour_utc, e)
    }
    const hours = [...byHour.entries()]
      .filter(([, e]) => e.posts > 0)
      .map(([h, e]) => ({ h, ...e, avg: e.views / e.posts }))
      .sort((a, b) => b.avg - a.avg)
    L.push(`## Часы публикации (UTC) по средним просмотрам`)
    if (hours.length > 1 && week.length >= 10) {
      for (const x of hours.slice(0, 5))
        L.push(`- ${String(x.h).padStart(2, '0')}:00 — ${x.avg.toFixed(1)} ср. (${x.posts} постов)`)
      L.push(`- рекомендация расписания: слоты ${hours.slice(0, 2).map(x => String(x.h).padStart(2, '0') + ':00').join(' и ')} UTC держат разнос ≥3 ч`)
    } else {
      L.push(`- данных пока ${week.length} постов: расписание остаётся «разнос 3 ч», пересчёт при ≥10`)
    }
    L.push('')

    // 5. Бенчмарки и итог.
    L.push(`## Ориентиры (short-form 2026)`)
    for (const b of BENCHMARKS) L.push(`- ${b}`)
    L.push('')
    L.push(`## Итог`)
    const totalViews = week.reduce((a, x) => a + x.views_count, 0)
    const totalStars = week.reduce((a, x) => a + x.stars_count, 0)
    L.push(`- за окно: ${week.length} постов, ${totalViews} просмотров, ${totalStars} звёзд; всего в ленте ${rows.length} постов`)

    // Тренд к прошлому прогону: те же метрики, другое время.
    const history = readHistory()
    const prev = history[history.length - 1]
    if (prev && prev.windowDays === WINDOW_DAYS) {
      L.push(
        `- с прошлого прогона (${prev.at.slice(0, 10)}): постов ${prev.posts} → ${week.length}, просмотров ${prev.views} → ${totalViews}, звёзд ${prev.stars} → ${totalStars}`
      )
    }
    history.push({
      at: new Date().toISOString(),
      windowDays: WINDOW_DAYS,
      posts: week.length,
      views: totalViews,
      stars: totalStars,
    })
    fs.writeFileSync(HISTORY, JSON.stringify(history, null, 2))
    L.push(`- следующая ретроспектива: когда окно наберёт ≥4/день × 7 дн (или 31.08)`)
    L.push('')
    L.push('---')
    L.push('Собрано автоматически, чтение без побочных эффектов.')

    fs.mkdirSync(LOOP_DIR, { recursive: true })
    fs.writeFileSync(OUT, L.join('\n'))
    console.log(`[retro] ${OUT}: ${week.length} постов за ${WINDOW_DAYS} дн, средняя reach velocity ${avgVel.toFixed(2)}`)
  } finally {
    await pool.end()
  }
}

main().catch(e => {
  console.error('[retro] падение:', String(e).slice(0, 300))
  process.exit(1)
})
