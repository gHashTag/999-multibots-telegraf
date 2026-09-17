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

const ESC = String.fromCharCode(27)
const dim = s => `${ESC}[2m${s}${ESC}[0m`
const red = s => `${ESC}[31m${s}${ESC}[0m`
const green = s => `${ESC}[32m${s}${ESC}[0m`
const bold = s => `${ESC}[1m${s}${ESC}[0m`

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
  console.log(
    silentHours > 3
      ? red(
          `  silent for ${silentHours.toFixed(1)} h -- the sweep runs every 30 min`
        )
      : dim(`  last entry ${silentHours.toFixed(1)} h ago`)
  )

  const lost = rows.filter(isLostPicture)
  const failures = rows.filter(isOtherFailure)

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

module.exports = { isLostPicture, reasonOf, isOtherFailure, tally }
