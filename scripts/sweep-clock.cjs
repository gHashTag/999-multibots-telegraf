#!/usr/bin/env node
/**
 * IS THE SELLER'S CLOCK RUNNING, AND WHAT CAN THIS EVEN TELL US.
 *
 * `crm-proactive-sweep` ticks every thirty minutes (`CRM_SWEEP_CRON`). On
 * 2026-09-18 the journal had been quiet for 39 minutes and that looked like a
 * missed tick; it was not, and finding out cost a detour. The rule, from
 * services/hiveNote.ts:
 *
 *   idle    written on EVERY tick -- the seller looked and found nothing
 *   card    a card was pushed to the owner
 *   failed  the tick died, and an alert already rang for it
 *   held    a seller holding a pause writes this ONCE PER SIX HOURS, on purpose
 *   paused  no carrier registered yet -- writes NOTHING AT ALL
 *
 * So a silent journal is legitimate for up to six hours, and a tick that found
 * no carrier is invisible for ever. This tool therefore judges what the system
 * actually promises -- a heartbeat every six hours, an alarm at twelve
 * (SELLER_SILENCE_MS) -- and says plainly that the tick history itself is not
 * here: it lives in the Inngest run list, behind a key only the owner holds.
 *
 *   node scripts/sweep-clock.cjs [--limit N] [--hours N]
 *
 * Read-only. The render key is read into a variable and never printed.
 *
 * Exit: 0 the clock is beating, 1 silent past the alarm, 2 could not look.
 */
'use strict'

const { execSync } = require('node:child_process')

const BASE = 'https://vibee-render-production.up.railway.app'
const OWNER = '144022504'

/** From hiveNote.ts: a holding seller writes one line per heartbeat. */
const HEARTBEAT_MS = 6 * 60 * 60_000
/** From render/src/hive/seller-silence.ts: two missed heartbeats is an alarm. */
const ALARM_MS = 12 * 60 * 60_000

const SWEEP_KINDS = ['sweep-idle', 'sweep-card', 'sweep-held', 'sweep-failed']
const MARK = {
  'sweep-idle': '.',
  'sweep-card': 'C',
  'sweep-held': '-',
  'sweep-failed': 'X',
}

const PAINT = Boolean(process.stdout.isTTY)
const ESC = PAINT ? String.fromCharCode(27) : ''
const wrap = (code, s) => (PAINT ? `${ESC}[${code}m${s}${ESC}[0m` : s)
const dim = s => wrap(2, s)
const red = s => wrap(31, s)
const green = s => wrap(32, s)
const yellow = s => wrap(33, s)
const bold = s => wrap(1, s)

/**
 * THE WHOLE JUDGEMENT, AS A PURE FUNCTION.
 *
 * Kept apart from the fetching so it can be tested against invented journals
 * instead of against whatever production happens to be doing tonight -- the
 * states worth pinning (silent for thirteen hours, never swept at all) are
 * exactly the ones you cannot arrange on demand.
 */
function judge(events, now, window) {
  const sweeps = events
    .filter(e => SWEEP_KINDS.includes(e.kind))
    .map(e => ({ kind: e.kind, at: Date.parse(e.at) }))
    .filter(e => Number.isFinite(e.at))
    .filter(e => window === undefined || e.at >= now - window)
    .sort((a, b) => b.at - a.at)

  if (!sweeps.length) {
    /*
     * NOTHING AT ALL IS NOT SILENCE. It is also not health: the window may
     * simply be too short, or the journal unreadable. Either way there is no
     * verdict to give, and inventing a green one is the failure a checker
     * must not have.
     */
    return { state: 'never swept', sweeps, since: null, longestGap: null }
  }

  const since = now - sweeps[0].at
  let longestGap = null
  for (let i = 0; i < sweeps.length - 1; i++) {
    const gap = sweeps[i].at - sweeps[i + 1].at
    if (longestGap === null || gap > longestGap) longestGap = gap
  }

  const state =
    since >= ALARM_MS ? 'alarm' : since >= HEARTBEAT_MS ? 'quiet' : 'beating'
  return { state, sweeps, since, longestGap }
}

function key() {
  try {
    const kv = execSync(
      'railway service vibee-render >/dev/null 2>&1; railway variables --kv 2>/dev/null',
      { encoding: 'utf8', shell: '/bin/sh', maxBuffer: 8 * 1024 * 1024 }
    )
    const line = kv.split('\n').find(l => l.startsWith('RENDER_API_KEY='))
    return line ? line.slice('RENDER_API_KEY='.length) : null
  } catch {
    return null
  }
}

function events(apiKey, limit) {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'hive_events', arguments: { limit } },
  })
  const out = execSync(
    `curl -s --max-time 40 ${JSON.stringify(`${BASE}/mcp?telegram_id=${OWNER}`)} ` +
      `-H ${JSON.stringify(`X-Api-Key: ${apiKey}`)} ` +
      `-H 'Content-Type: application/json' --data-binary @-`,
    {
      input: body,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      shell: '/bin/sh',
    }
  )
  const parsed = JSON.parse(out)
  if (parsed.error) throw new Error(String(parsed.error.message).slice(0, 120))
  const payload = JSON.parse(parsed.result.content[0].text)
  return payload.events || payload
}

const hours = ms => (ms / 3_600_000).toFixed(1)

/** One line per hour, newest last, so a hole is visible as a run of spaces. */
function strip(sweeps, now, window) {
  const rows = []
  const startHour = Math.floor((now - window) / 3_600_000)
  const endHour = Math.floor(now / 3_600_000)
  for (let h = startHour; h <= endHour; h++) {
    const inHour = sweeps.filter(s => Math.floor(s.at / 3_600_000) === h)
    const at = new Date(h * 3_600_000)
    rows.push({
      label: `${String(at.getUTCHours()).padStart(2, '0')}:00Z`,
      marks: inHour.map(s => MARK[s.kind] || '?').join('') || ' ',
    })
  }
  return rows
}

function main() {
  const limitAt = process.argv.indexOf('--limit')
  const limit = limitAt === -1 ? 200 : Number(process.argv[limitAt + 1]) || 200
  const hoursAt = process.argv.indexOf('--hours')
  const window =
    (hoursAt === -1 ? 24 : Number(process.argv[hoursAt + 1]) || 24) * 3_600_000

  const apiKey = key()
  if (!apiKey) {
    console.error('no RENDER_API_KEY reachable: railway service vibee-render')
    process.exitCode = 2
    return
  }
  let rows
  try {
    rows = events(apiKey, limit)
  } catch (e) {
    console.error(`could not read the journal: ${e.message}`)
    process.exitCode = 2
    return
  }

  const now = Date.now()
  /*
   * The gap is measured inside the window that is DRAWN. Measuring it over
   * the whole 200-event fetch printed "longest gap 12.0 h" under a picture of
   * the last eight hours -- a true number about a stretch the reader cannot
   * see, which reads as a contradiction.
   */
  const { state, sweeps, since, longestGap } = judge(rows, now, window)

  console.log(bold("the seller's clock"))
  console.log(
    dim(
      `  ticks every 30 min; a HOLDING seller writes one line per 6 h, and a` +
        ` tick with no carrier writes nothing at all.`
    )
  )
  console.log()

  if (state === 'never swept') {
    console.log(
      yellow('no sweep line in this window at all.') +
        ' Nothing to judge -- widen --limit, or the journal is not answering.'
    )
    process.exitCode = 2
    return
  }

  for (const row of strip(sweeps, now, window)) {
    console.log(`  ${dim(row.label)}  ${row.marks}`)
  }
  console.log(dim('  . idle   C card   - held (heartbeat)   X failed'))
  console.log()

  const line = `last line ${hours(since)} h ago; longest gap in the ${hours(
    window
  )} h shown ${longestGap === null ? 'n/a' : `${hours(longestGap)} h`}`
  if (state === 'beating') {
    console.log(green('the clock is beating.') + ' ' + line)
  } else if (state === 'quiet') {
    console.log(
      yellow('past the heartbeat, not yet the alarm.') +
        ' ' +
        line +
        ' A holding seller is allowed six.'
    )
  } else {
    console.log(red('silent past the alarm.') + ' ' + line)
    process.exitCode = 1
  }

  /*
   * WHAT THIS CANNOT SEE, SAID EVERY TIME.
   *
   * The journal records what a tick DID, never that a tick happened. The run
   * history is the Inngest server's, and the key for it is the owner's.
   */
  console.log()
  console.log(
    dim(
      'not visible from here: whether a tick ran and wrote nothing (held between' +
        ' heartbeats, or no carrier). That is the Inngest run list --'
    )
  )
  console.log(
    dim(
      '  list_function_runs functionId=telegram-bot-client-crm-proactive-sweep'
    )
  )
}

module.exports = { judge, HEARTBEAT_MS, ALARM_MS, SWEEP_KINDS }

if (require.main === module) main()
