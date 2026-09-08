#!/usr/bin/env node
/**
 * Where a first visit ends. SELECT-only.
 *
 * Every loop of this project has fixed what happens AFTER somebody presses a
 * button. This measures whether they press one at all, and it is the number
 * that should decide what gets fixed next:
 *
 *   organic arrivals   821 people
 *     never generated   678  82.6%
 *     generated once    121  14.7%
 *     generated more     22   2.7%
 *
 * Twenty-two people, ever, produced a second thing.
 *
 * THE SPLIT IS NOT COSMETIC. 1559 of the 2380 rows in `users` were created in
 * ONE SECOND -- a bulk import -- and mixing them into a single average hides
 * the finding, because the imported cohort CONTINUES BETTER than the organic
 * one (56.9% stop after one generation against 84.6%). An average over the two
 * reads as "roughly two thirds stop", which is true of nobody: the people who
 * came on their own do worse than the ones who were put there.
 *
 * The import second is DETECTED, not hardcoded: the most crowded second in the
 * table. A hardcoded timestamp would quietly stop matching after the next
 * import and put everybody in one bucket again.
 */
const HOUR = 36e5

/** Cohort split and continuation, from rows alone. Pure, so it is testable. */
function analyse(users, prompts) {
  const perUser = new Map()
  const firstAt = new Map()
  for (const p of prompts) {
    const u = String(p.telegram_id)
    if (!p.created_at) continue
    perUser.set(u, (perUser.get(u) || 0) + 1)
    if (!firstAt.has(u) || p.created_at < firstAt.get(u))
      firstAt.set(u, p.created_at)
  }
  const bySecond = new Map()
  for (const u of users) {
    const s = String(u.created_at).slice(0, 19)
    bySecond.set(s, (bySecond.get(s) || 0) + 1)
  }
  let importSecond = null
  let biggest = 0
  for (const [s, n] of bySecond)
    if (n > biggest) {
      biggest = n
      importSecond = s
    }
  // One second holding more than a percent of everybody is an import, not a
  // busy minute. Below that, treat every arrival as organic.
  const looksImported = biggest > Math.max(20, users.length * 0.01)

  const empty = () => ({ none: 0, once: 0, more: 0, withinHour: 0 })
  const out = {
    imported: empty(),
    organic: empty(),
    importSecond: looksImported ? importSecond : null,
    importSize: looksImported ? biggest : 0,
  }
  for (const u of users) {
    const g =
      looksImported && String(u.created_at).slice(0, 19) === importSecond
        ? 'imported'
        : 'organic'
    const id = String(u.telegram_id)
    const n = perUser.get(id) || 0
    if (n === 0) out[g].none++
    else if (n === 1) out[g].once++
    else out[g].more++
    const f = firstAt.get(id)
    if (f && (new Date(f) - new Date(u.created_at)) / HOUR <= 1)
      out[g].withinHour++
  }
  return out
}

/** The probe answers on a shape it knows, or it does not report. */
function selfCheck() {
  const users = [
    ...Array.from({ length: 30 }, (_, i) => ({
      telegram_id: `i${i}`,
      created_at: '2025-09-16T10:09:58Z',
    })),
    { telegram_id: 'a', created_at: '2026-01-01T00:00:00Z' },
    { telegram_id: 'b', created_at: '2026-01-02T00:00:00Z' },
  ]
  const prompts = [
    { telegram_id: 'a', created_at: '2026-01-01T00:10:00Z' },
    { telegram_id: 'i0', created_at: '2025-09-16T11:00:00Z' },
    { telegram_id: 'i0', created_at: '2025-09-16T12:00:00Z' },
  ]
  const r = analyse(users, prompts)
  const problems = []
  if (r.importSize !== 30)
    problems.push('the crowded second was not detected as an import')
  if (r.organic.once !== 1)
    problems.push('an organic single generation was miscounted')
  if (r.organic.none !== 1)
    problems.push('an organic non-generator was miscounted')
  if (r.imported.more !== 1)
    problems.push('an imported repeat generator was miscounted')
  if (r.organic.withinHour !== 1)
    problems.push('the within-the-hour count is wrong')
  if (problems.length) {
    console.error(
      'SELF-CHECK FAILED, refusing to report:\n  ' + problems.join('\n  ')
    )
    process.exit(2)
  }
}

async function pageAll(url, key, table, select, keyCol) {
  const out = []
  let last = null
  for (;;) {
    const f = last === null ? '' : `&${keyCol}=gt.${encodeURIComponent(last)}`
    const r = await fetch(
      `${url}/rest/v1/${table}?select=${select}${f}&order=${keyCol}.asc&limit=1000`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      }
    )
    const rows = await r.json()
    if (!Array.isArray(rows) || rows.length === 0) break
    out.push(...rows)
    last = rows[rows.length - 1][keyCol]
    if (rows.length < 1000) break
  }
  const keys = new Set(out.map(r => r[keyCol]))
  if (keys.size !== out.length) {
    console.error(
      `${table}: ${out.length} rows but ${keys.size} distinct keys — unstable paging, refusing`
    )
    process.exit(2)
  }
  return out
}

async function main() {
  selfCheck()
  const url = process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      'Needs SUPABASE_URL and SUPABASE_SERVICE_KEY. Reads only. Exiting 2 (could not check).'
    )
    process.exit(2)
  }
  const users = await pageAll(
    url,
    key,
    'users',
    'id,telegram_id,created_at',
    'id'
  )
  const prompts = await pageAll(
    url,
    key,
    'prompts_history',
    'prompt_id,telegram_id,created_at',
    'prompt_id'
  )
  const r = analyse(users, prompts)
  console.log(`users ${users.length}, generations ${prompts.length}`)
  if (r.importSecond)
    console.log(
      `bulk import detected: ${r.importSize} people created in the second ${r.importSecond}\n`
    )
  else console.log('no bulk import detected; everybody counted as organic\n')
  for (const g of ['organic', 'imported']) {
    const v = r[g]
    const tot = v.none + v.once + v.more
    if (!tot) continue
    const pct = n => `${((100 * n) / tot).toFixed(1)}%`
    console.log(`${g}: ${tot} people`)
    console.log(
      `  never generated            ${String(v.none).padStart(5)}  ${pct(v.none)}`
    )
    console.log(
      `  generated exactly once     ${String(v.once).padStart(5)}  ${pct(v.once)}`
    )
    console.log(
      `  generated more than once   ${String(v.more).padStart(5)}  ${pct(v.more)}`
    )
    const gen = v.once + v.more
    if (gen)
      console.log(
        `  of those who generated, stopped after one: ${((100 * v.once) / gen).toFixed(1)}%`
      )
    console.log(
      `  first generation within the hour of arriving: ${v.withinHour}`
    )
    console.log()
  }
  console.log(
    'Read the two cohorts apart: an average over them describes nobody.'
  )
}

module.exports = { analyse, selfCheck }
if (require.main === module)
  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
