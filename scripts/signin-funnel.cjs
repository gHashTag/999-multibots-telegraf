#!/usr/bin/env node
/**
 * DID THE CODE REACH ANYBODY, AND WHERE DID IT STOP.
 *
 * Owner, 2026-09-17: "why does the code not reach the user?" Answering it meant
 * reading the journal by hand and counting kinds, and the count that mattered
 * was an ABSENCE -- 23 sign-ins and not one `code-issued`, which is invisible
 * until somebody thinks to look for a thing that is not there.
 *
 * A funnel makes an absence a number. Four steps, in the order a person walks
 * them:
 *
 *   sign-in     somebody got in through the mini app's own signature
 *   code-issued a pairing code was minted and SHOWN in the mini app window
 *   code-claimed that code was typed somewhere else and accepted
 *   code-refused a request or a claim was turned down, with the reason
 *
 * The code is never sent anywhere: it is drawn on screen for two minutes. So
 * "the code did not arrive" is always one of two different facts -- it was
 * never minted, or it was minted and the claim failed -- and they have
 * different repairs.
 *
 *   node scripts/signin-funnel.cjs [--limit N]
 *
 * Read-only. The key is read into a variable and never printed.
 */
'use strict'

const { execSync } = require('node:child_process')

const BASE = 'https://vibee-render-production.up.railway.app'
const OWNER = '144022504'
const CAP = 200

const PAINT = Boolean(process.stdout.isTTY)
const ESC = PAINT ? String.fromCharCode(27) : ''
const wrap = (code, s) => (PAINT ? `${ESC}[${code}m${s}${ESC}[0m` : s)
const dim = s => wrap(2, s)
const red = s => wrap(31, s)
const green = s => wrap(32, s)
const bold = s => wrap(1, s)

const STEPS = [
  ['sign-in', 'signed in inside Telegram'],
  ['code-issued', 'a code was minted and shown'],
  ['code-claimed', 'that code was typed and accepted'],
  ['code-refused', 'a request or a claim was refused'],
]

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

function main() {
  const at = process.argv.indexOf('--limit')
  const limit = at === -1 ? CAP : Number(process.argv[at + 1]) || CAP

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
  if (!rows.length) {
    console.log('the journal returned nothing.')
    return
  }

  const days =
    (Date.parse(rows[0].at) - Date.parse(rows[rows.length - 1].at)) / 86_400_000
  console.log(
    bold(`the way in, over ${days.toFixed(1)} days`) +
      dim(`  (${rows.length} events, newest ${rows[0].at})`)
  )
  console.log()

  const counts = new Map(STEPS.map(([k]) => [k, 0]))
  for (const r of rows) {
    if (counts.has(r.kind)) counts.set(r.kind, counts.get(r.kind) + 1)
  }

  for (const [kind, what] of STEPS) {
    const n = counts.get(kind)
    const mark = n === 0 ? red('0'.padStart(4)) : String(n).padStart(4)
    console.log(`  ${mark}  ${kind.padEnd(13)} ${dim(what)}`)
  }

  /*
   * THE ABSENCE IS THE FINDING, SO IT IS SPELLED OUT.
   *
   * A zero here is not "nothing happened" -- it is "this step never ran", and
   * which zero it is decides the repair.
   */
  console.log()
  if (counts.get('code-issued') === 0) {
    /*
     * WHAT A ZERO MEANS CHANGED ON 2026-09-18, AND THE TOOL HAD TO BE TOLD.
     *
     * Until then the code was minted only when somebody PRESSED a button on
     * the pairing screen, so the server heard nothing until that press: "never
     * reached the screen" and "reached it and left without pressing" produced
     * the identical zero. The screen now asks on arrival (PairWithApp), so a
     * zero here means the screen was not OPENED -- and the repair is the road
     * to it, not the screen.
     */
    console.log(
      red('no code was minted at all in this window.') +
        ' Since 2026-09-18 the screen asks on arrival, so this'
    )
    console.log(
      'means the pairing screen was not opened at all -- look at the way to' +
        ' it, not at it. Unless a refusal is recorded below: then it WAS'
    )
    console.log('opened and the request was turned down.')
  } else if (counts.get('code-claimed') === 0) {
    console.log(
      red('codes were shown and none was accepted.') +
        ' They were minted, so the screen works --'
    )
    console.log('the failure is between the screen and the other device.')
  } else {
    console.log(green('codes were minted and claimed: the way in works.'))
  }

  const refusals = rows.filter(r => r.kind === 'code-refused')
  if (refusals.length) {
    console.log()
    console.log(bold('why it was refused'))
    const by = new Map()
    for (const r of refusals) {
      const why = String(r.note || 'no reason recorded')
      by.set(why, (by.get(why) || 0) + 1)
    }
    for (const [why, n] of [...by].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${why}`)
    }
    console.log(
      dim(
        '  A refusal you caused yourself with curl looks exactly like a' +
          " person's. Check the time before reading one as a complaint."
      )
    )
  }
}

main()
