#!/usr/bin/env node
/**
 * WHAT THE SELLER IS LOSING, COUNTED FROM THE JOURNAL.
 *
 * The hive journal has held the answer to "is this working" for weeks, and
 * nobody asked it that way: the events scroll past one at a time, so a steady
 * bleed looks like ordinary noise. Read 200 of them at once and the shape is
 * obvious.
 *
 * Measured 2026-09-17, a 4.6-day window: 44 of 200 events were a picture that
 * was generated and never reached the person it was made for. 41 of those 44
 * carry the reason `replaced` -- a newer draft evicted a pending one -- and the
 * daily count is rising: 5, 8, 6, 12, 13.
 *
 * Every one of those is money spent on a generation nobody saw. That is the
 * number this command exists to keep in front of somebody.
 *
 *   node scripts/hive-failures.cjs [--limit N]
 *
 * Read-only. The service key is read into a variable and never printed, per the
 * mcp-owner-access skill.
 */
'use strict'

const { execSync } = require('node:child_process')

const BASE = 'https://vibee-render-production.up.railway.app'
const OWNER = '144022504'
/*
 * The server caps this at 200 rows whatever is asked for, so the window is
 * "the last 200 notable events", not a time span. The OLDEST day in the result
 * is therefore partial and its count means nothing on its own.
 */
const CAP = 200

/*
 * COLOUR ONLY FOR A TERMINAL.
 *
 * These tools are meant to be composed -- `tri readers | awk '{print $1}'` is
 * the obvious next thing somebody does with an inventory. With escape codes
 * always on, the first field is not a path but a path wearing a dim marker, and
 * the loop fails with "no such file or directory" on a name that plainly
 * exists. Measured on my own output, 2026-09-17.
 *
 * `isTTY` is false for a pipe, a file and a subshell, which is exactly the set
 * of places where colour is noise rather than help.
 */
const PAINT = Boolean(process.stdout.isTTY)
const ESC = PAINT ? String.fromCharCode(27) : ''
const wrap = (code, s) => (PAINT ? `${ESC}[${code}m${s}${ESC}[0m` : s)
const dim = s => wrap(2, s)
const red = s => wrap(31, s)
const green = s => wrap(32, s)
const bold = s => wrap(1, s)

/** The lost-picture note, as the bot writes it. */
const LOST = 'не отправлена'
const REASON = /[0-9a-f]{12}\s+(\w+):/

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
      `-H ${JSON.stringify(`X-Api-Key: ${apiKey}`)} -H 'Content-Type: application/json' ` +
      `--data-binary @-`,
    {
      input: body,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      shell: '/bin/sh',
    }
  )
  const parsed = JSON.parse(out)
  if (parsed.error) throw new Error(String(parsed.error.message).slice(0, 120))
  const text = parsed.result.content[0].text
  const payload = JSON.parse(text)
  return payload.events || payload
}

/**
 * THE THREE PURE DECISIONS, SEPARATED SO THEY CAN BE TESTED.
 *
 * Everything above this line talks to the network and cannot be tested without
 * it. Everything below decides what a row MEANS, which is where a census gets
 * things wrong: a note whose shape changed, a reason that stops being parsed and
 * quietly becomes "unknown", a failure counted twice because it also mentions
 * the lost picture.
 */
function isLostPicture(row) {
  return String(row.note || '').includes(LOST)
}

function reasonOf(row) {
  const m = REASON.exec(String(row.note || ''))
  return m ? m[1] : 'unknown'
}

function isOtherFailure(row) {
  return (
    (row.kind === 'failure' || row.kind === 'sweep-failed') &&
    !isLostPicture(row)
  )
}

/**
 * WHICH BUILDS ARE ACTUALLY RUNNING, AND SINCE WHEN.
 *
 * A census with no build in it invites the mistake this command was written to
 * stop. On 2026-09-17 I reported that the picture leak was waiting on an
 * unmerged pull request; the render had been running that fix since 15:15 the
 * day before, and the leak continued under it. Same number, opposite
 * conclusion, and the difference was one line from /health.
 *
 * TWO SERVICES, AND THE FIRST VERSION ASKED ONLY ONE.
 *
 * It split at the render's start time -- and then judged the SWEEP by it, which
 * lives in the bot. Two deployments with their own restarts were being measured
 * with one ruler, and the wrong one: the render redeploys on almost every merge
 * (it serves the whole front end), so the window kept resetting to nothing while
 * the bot, whose behaviour was the question, sat unchanged for hours.
 *
 * So both are asked, and the split is the LATER of the two: only past that
 * moment is the whole pipeline the new one. Conservative on purpose -- it can
 * call a fixed thing unproven, never a broken thing fixed.
 */
function builds() {
  const out = { render: null, bot: null, renderVersion: 'unreachable' }
  try {
    const health = JSON.parse(
      execSync(`curl -s --max-time 20 ${JSON.stringify(`${BASE}/health`)}`, {
        encoding: 'utf8',
        shell: '/bin/sh',
      })
    )
    out.render = health.startedAt || null
    out.renderVersion = health.version || 'unknown'
  } catch {
    /* an unreachable render leaves its half unknown, which the caller prints */
  }
  try {
    const raw = execSync(
      'railway service 999-multibots-telegraf >/dev/null 2>&1; ' +
        'railway deployment list --json 2>/dev/null',
      { encoding: 'utf8', shell: '/bin/sh', maxBuffer: 16 * 1024 * 1024 }
    )
    const list = JSON.parse(raw)
    const ok = list.find(d => d.status === 'SUCCESS')
    out.bot = ok?.createdAt || null
  } catch {
    /* no railway link here: the bot half stays unknown rather than guessed */
  }
  return out
}

/** The later of two instants, or whichever one exists. */
function laterOf(a, b) {
  if (!a) return b
  if (!b) return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}

/**
 * Split the events at the moment the running build started.
 *
 * Returns both halves plus the count each, so a caller cannot report one
 * without the other -- reporting only "since" hides that the sample is nine
 * events, and reporting only the total hides that a fix has already shipped.
 */
function splitAtDeploy(rows, startedAt) {
  if (!startedAt) return { before: [], since: rows, dated: false }
  const t = Date.parse(startedAt)
  if (Number.isNaN(t)) return { before: [], since: rows, dated: false }
  return {
    before: rows.filter(r => Date.parse(r.at) <= t),
    since: rows.filter(r => Date.parse(r.at) > t),
    dated: true,
  }
}

function tally(rows, pick) {
  const m = new Map()
  for (const r of rows) {
    const k = pick(r)
    m.set(k, (m.get(k) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

function main() {
  const at = process.argv.indexOf('--limit')
  const limit = at === -1 ? CAP : Number(process.argv[at + 1]) || CAP

  const apiKey = key()
  if (!apiKey) {
    console.error(
      'no RENDER_API_KEY reachable. Link the service first: railway service vibee-render'
    )
    process.exitCode = 2
    return
  }

  let rows
  try {
    rows = events(apiKey, limit)
  } catch (err) {
    console.error(`could not read the journal: ${err.message}`)
    process.exitCode = 2
    return
  }
  if (!rows.length) {
    console.log('the journal returned nothing.')
    return
  }

  const newest = new Date(rows[0].at)
  const oldest = new Date(rows[rows.length - 1].at)
  const silentHours = (Date.now() - newest.getTime()) / 3_600_000
  const days = (newest.getTime() - oldest.getTime()) / 86_400_000

  console.log(
    bold(`${rows.length} events over ${days.toFixed(1)} days`) +
      dim(`  (newest ${rows[0].at})`)
  )
  const running = builds()
  const anchor = laterOf(running.render, running.bot)
  console.log(
    dim(
      `  render ${running.renderVersion}` +
        (running.render ? ` up since ${running.render}` : ' start unknown') +
        (running.bot ? `, bot deployed ${running.bot}` : ', bot deploy unknown')
    )
  )
  console.log(
    silentHours > 3
      ? red(
          `  silent for ${silentHours.toFixed(1)} h -- the sweep runs every 30 min`
        )
      : dim(`  last entry ${silentHours.toFixed(1)} h ago`)
  )

  const lost = rows.filter(isLostPicture)
  const failures = rows.filter(isOtherFailure)

  /*
   * THE SPLIT, PRINTED WHETHER OR NOT IT FLATTERS THE LAST FIX.
   *
   * "41 before the build, 3 since" is a different sentence from "44 lost", and
   * only the first one can be acted on.
   */
  const half = splitAtDeploy(rows, anchor)
  if (half.dated) {
    const lb = half.before.filter(isLostPicture).length
    const ls = half.since.filter(isLostPicture).length
    const cb = half.before.filter(r => r.kind === 'sweep-card').length
    const cs = half.since.filter(r => r.kind === 'sweep-card').length
    const pb = half.before.filter(r => r.kind === 'card-pressed').length
    const ps = half.since.filter(r => r.kind === 'card-pressed').length
    console.log()
    console.log(bold('                    before both up       since both up'))
    console.log(
      `  events            ${String(half.before.length).padStart(10)}${String(half.since.length).padStart(19)}`
    )
    console.log(
      `  cards prepared    ${String(cb).padStart(10)}${String(cs).padStart(19)}`
    )
    console.log(
      `  pictures lost     ${String(lb).padStart(10)}${String(ls).padStart(19)}`
    )
    console.log(
      `  cards pressed     ${String(pb).padStart(10)}${String(ps).padStart(19)}`
    )
    /*
     * A ZERO THAT MIGHT MEAN "NOT RECORDED" MUST SAY SO.
     *
     * `card-pressed` was added to the journal on 2026-09-16. Before that the
     * press left no trace anywhere, so a zero in this row is not evidence that
     * nobody pressed -- and a census that prints it bare invites exactly the
     * wrong conclusion about the product's throughput.
     */
    if (pb + ps === 0) {
      console.log(
        dim(
          '  no press was recorded at all: the journal only gained ' +
            '`card-pressed` on 2026-09-16, so this zero cannot be told apart ' +
            'from "not written down yet"'
        )
      )
    }
    /*
     * THE ANCHOR IS THE LATER OF TWO DEPLOYS, and the reason belongs next to
     * the number. Judging a sweep -- which lives in the bot -- by the render's
     * start time was the first version's mistake: the render redeploys on
     * nearly every merge, so the window kept resetting while the thing being
     * measured had not changed.
     */
    if (half.since.length < 30) {
      console.log(
        dim(
          `  the "since" column is ${half.since.length} events -- too few to call a trend`
        )
      )
    }
  }

  console.log()
  if (lost.length) {
    const share = ((lost.length / rows.length) * 100).toFixed(0)
    console.log(
      red(bold(`${lost.length} pictures made and never sent`)) +
        ` -- ${share}% of everything the journal recorded`
    )
    for (const [reason, n] of tally(lost, reasonOf)) {
      console.log(`    ${String(n).padStart(3)}  ${reason}`)
    }
    console.log(
      dim('  per day (the oldest day is cut off by the 200-row cap):')
    )
    const byDay = tally(lost, r => r.at.slice(0, 10)).sort((a, b) =>
      a[0] < b[0] ? -1 : 1
    )
    for (const [day, n] of byDay) {
      console.log(dim(`    ${day}  ${'#'.repeat(Math.min(n, 40))} ${n}`))
    }
  } else {
    console.log(green('no lost pictures in this window.'))
  }

  console.log()
  if (failures.length) {
    console.log(bold(`${failures.length} other failures`))
    for (const [note, n] of tally(failures, r =>
      String(r.note || '').slice(0, 60)
    )) {
      console.log(`    ${String(n).padStart(3)}  ${note}`)
    }
  } else {
    console.log(green('no other failures in this window.'))
  }

  console.log()
  console.log(
    dim(
      'kinds: ' +
        tally(rows, r => r.kind)
          .map(([k, n]) => `${k} ${n}`)
          .join(', ')
    )
  )
}

if (require.main === module) main()

module.exports = {
  isLostPicture,
  reasonOf,
  isOtherFailure,
  tally,
  splitAtDeploy,
  laterOf,
}
