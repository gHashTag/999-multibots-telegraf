#!/usr/bin/env node
/**
 * IS THE PAID MEDALLION LAYER ALIVE? A CHECK WITH AN EXIT CODE.
 *
 * WHY THIS EXISTS, AND WHAT IT COST TO LEARN. The poster layer of the factory
 * was dead for weeks -- image_generate called FAL, FAL answered 403 "Exhausted
 * balance", and a missing optional prop still renders 900 valid frames and
 * publishes successfully. Every check stayed green because not one of them ever
 * looked at what was IN the published recipe. loop/regression-check.sh contains
 * no occurrence of `talking`, `portrait`, `posterUrl` or `avatarVideo`.
 *
 * The talking portrait is the same shape of layer -- optional, paid, and
 * invisible when it fails -- so it ships with the check the poster never had.
 * The record it watches is public: /api/feed exposes the whole recipe under
 * `templateSettings`, so this needs no database and no key.
 *
 * THREE OUTCOMES, NOT TWO (house rule 6).
 *   0  clean, or the switch is off and there is nothing to watch
 *   1  RED: the switch is on and the layer is not producing
 *   2  COULD NOT MEASURE: the feed did not answer, or answered nothing
 * A feed that is down is not a portrait that is broken, and reporting it as one
 * is how an alarm gets ignored.
 *
 * Run:
 *   AUTOPILOT_PORTRAIT=on node loop/portrait-watch.mjs
 *   PORTRAIT_WATCH_FEED=<url|file> AUTOPILOT_PORTRAIT=on node loop/portrait-watch.mjs
 * The file form is not a convenience: it is how this check is itself broken on
 * purpose and confirmed to go red, which is the only thing that makes it worth
 * running.
 */
import fs from 'node:fs'

const MODE = String(process.env.AUTOPILOT_PORTRAIT || '')
  .trim()
  .toLowerCase()
const SOURCE =
  process.env.PORTRAIT_WATCH_FEED || 'http://127.0.0.1:3333/api/feed?limit=8'
const WINDOW = Number(process.env.PORTRAIT_WATCH_WINDOW || 8)

/** on|dry|off, read the same way src/talking-portrait.ts reads it. */
const mode =
  MODE === '1' || MODE === 'on' || MODE === 'true'
    ? 'on'
    : MODE === 'dry' || MODE === 'dry-run'
      ? 'dry'
      : 'off'

const say = s => console.log(s)

/** A local path is a fixture; anything else is fetched. */
async function loadFeed(src) {
  if (!/^https?:\/\//i.test(src))
    return JSON.parse(fs.readFileSync(src, 'utf8'))
  const r = await fetch(src, { signal: AbortSignal.timeout(15_000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

/**
 * The feed has been served under more than one field name and more than one
 * case convention; guessing wrong here would report "no rows" and be read as
 * "the layer is dead", which is the failure mode this file is against.
 */
const rowsOf = feed =>
  feed?.templates || feed?.records || feed?.items || feed?.data || []
const settingsOf = row => row?.templateSettings || row?.template_settings || {}

if (mode === 'off') {
  // Not a pass by omission: with the switch off there is nothing this check
  // could observe, and saying so is different from saying it is healthy.
  say('портрет: выключатель off — наблюдать нечего (0)')
  process.exit(0)
}

let feed
try {
  feed = await loadFeed(SOURCE)
} catch (e) {
  say(
    `портрет: ЛЕНТА НЕ ОТВЕТИЛА (${String(e).slice(0, 120)}) — НЕ ИЗМЕРЕНО (2)`
  )
  process.exit(2)
}

const rows = rowsOf(feed).slice(0, WINDOW)
if (!rows.length) {
  say('портрет: в ленте нет записей — НЕ ИЗМЕРЕНО (2)')
  process.exit(2)
}

const withTalking = rows
  .map(r => settingsOf(r).talking)
  .filter(t => t && typeof t === 'object')

// An observation, not a check: the poster layer runs on EVERY post while the
// portrait runs only on the paid slot, so one number cannot judge both. Printed
// because the poster is the layer that already died silently once.
const posters = rows.filter(r => settingsOf(r).posterUrl).length
say(`портрет: смотрю ${rows.length} записей; гравюр-постеров в них ${posters}`)

if (!withTalking.length) {
  say(
    `портрет: КРАСНО — выключатель ${mode}, но ни в одной из ${rows.length} ` +
      'записей нет поля talking. Фабрика не доходит до платного слоя: ' +
      'ровно так же месяцами молчал слой картинок (0 из 6 записей с posterUrl)'
  )
  process.exit(1)
}

// dry is a rehearsal, so its healthy answer is `dry`, not `delivered`.
const healthy = mode === 'dry' ? ['dry'] : ['delivered']
const good = withTalking.filter(t => healthy.includes(String(t.state)))
if (!good.length) {
  const newest = withTalking[0]
  say(
    `портрет: КРАСНО — ${withTalking.length} попыток подряд без результата ` +
      `(ожидалось состояние ${healthy.join('/')}). Последняя: ${newest.state} — ` +
      `${String(newest.reason || 'без причины').slice(0, 200)}`
  )
  process.exit(1)
}

const spent = withTalking.reduce((a, t) => a + (Number(t.credits) || 0), 0)
say(
  `портрет: чисто — ${good.length} из ${withTalking.length} попыток в состоянии ` +
    `${healthy.join('/')}, потрачено ${spent} кредитов за окно (0)`
)
process.exit(0)
