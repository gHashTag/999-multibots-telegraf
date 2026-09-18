#!/usr/bin/env node
/**
 * ARE THE MONEY WATCHES ALIVE, AND WHEN DID EACH LAST LOOK.
 *
 * Two watches ask whether somebody paid and was never credited: TON hourly
 * against the chain, Robokassa daily against the provider. Both were built to
 * speak ONLY when money is owed -- which means a healthy channel and a dead
 * watch produce exactly the same silence. The journal already learned that
 * lesson once with the seller's sweep (`sweep-held`), and the two watches
 * shipped with the flaw one day after it was written down.
 *
 * They now write a heartbeat: `watch-quiet`, one per channel per twenty hours,
 * carrying how many invoices were examined. This reads those lines and says,
 * per channel, when it last looked and what it found.
 *
 *   node scripts/watches.cjs [--limit N]
 *
 * WHY THIS IS NOT ASKED OF INNGEST. The run history would answer it better,
 * and it is behind a signing key only the owner holds -- so the watches are
 * built to be legible from the journal, which this account can read. A tool
 * that can only be run by somebody else is a tool that does not run.
 *
 * Read-only; the render key is read into a variable and never printed.
 *
 * Exit: 0 every watch reported within its window, 1 one is overdue or owes
 * money, 2 the journal could not be read.
 */
'use strict'

const { execSync } = require('node:child_process')

const BASE = 'https://vibee-render-production.up.railway.app'
const OWNER = '144022504'

/**
 * The heartbeat is twenty hours, so two of them is the threshold: one missed
 * beat can be a deploy, a restart or a clock edge. Two is a stopped watch.
 */
const OVERDUE_MS = 40 * 60 * 60_000

const CHANNELS = ['TON', 'Robokassa']

const PAINT = Boolean(process.stdout.isTTY)
const ESC = PAINT ? String.fromCharCode(27) : ''
const wrap = (code, s) => (PAINT ? `${ESC}[${code}m${s}${ESC}[0m` : s)
const dim = s => wrap(2, s)
const red = s => wrap(31, s)
const green = s => wrap(32, s)
const yellow = s => wrap(33, s)
const bold = s => wrap(1, s)

/**
 * WHAT THE JOURNAL SAYS ABOUT ONE CHANNEL, AS A PURE FUNCTION.
 *
 * `never` is deliberately its own state and NOT "overdue": a watch deployed an
 * hour ago has not missed anything, and calling that a failure on the first
 * morning is how an alarm gets ignored by the second.
 */
/**
 * The text of an event, whatever this journal calls it today.
 *
 * THE NAME GOING IN IS NOT THE NAME COMING OUT. The bot posts
 * `{kind, who, what, severity}` to /api/hive/note; the MCP tool `hive_events`
 * returns the same line with the text under `note`. The first version of this
 * reader took `what`, got an empty string for every row, and reported both
 * channels as "never reported" while the heartbeats were sitting in the
 * journal -- a reader that was wrong about a system that worked. `note` is
 * what the sibling tools (hive-failures, signin-funnel) have always read.
 */
const textOf = e => String(e.note ?? e.what ?? '')

function judge(events, channel, now) {
  const mine = events
    .filter(e => textOf(e).startsWith(`${channel}:`))
    .map(e => ({
      kind: e.kind,
      at: Date.parse(e.at),
      what: textOf(e),
    }))
    .filter(e => Number.isFinite(e.at))
    .sort((a, b) => b.at - a.at)

  const beat = mine.find(e => e.kind === 'watch-quiet')
  const owed = mine.find(e => e.kind === 'payment-unclaimed')

  if (!beat && !owed) return { state: 'never', last: null, owed: null }
  const last = Math.max(beat ? beat.at : 0, owed ? owed.at : 0)
  if (owed && (!beat || owed.at > beat.at)) {
    return { state: 'owes', last, owed: owed.what }
  }
  return {
    state: now - last > OVERDUE_MS ? 'overdue' : 'alive',
    last,
    owed: null,
  }
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

function main() {
  const at = process.argv.indexOf('--limit')
  const limit = at === -1 ? 200 : Number(process.argv[at + 1]) || 200

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
  console.log(bold('the money watches'))
  console.log(
    dim(
      '  each writes one heartbeat per channel per 20 h, and an alarm when' +
        ' somebody paid and was never credited.'
    )
  )
  console.log()

  let bad = 0
  for (const channel of CHANNELS) {
    const { state, last, owed } = judge(rows, channel, now)
    const ago = last === null ? '' : dim(`  last ${hours(now - last)} h ago`)
    if (state === 'owes') {
      console.log(`  ${red('OWES')}      ${channel.padEnd(10)}${ago}  ${owed}`)
      bad++
    } else if (state === 'overdue') {
      console.log(
        `  ${red('SILENT')}    ${channel.padEnd(10)}${ago}  ${dim('two heartbeats missed -- the watch has stopped')}`
      )
      bad++
    } else if (state === 'never') {
      console.log(
        `  ${yellow('no line')}   ${channel.padEnd(10)}  ${dim('never reported in this window -- new, or never ran')}`
      )
    } else {
      console.log(`  ${green('alive')}     ${channel.padEnd(10)}${ago}`)
    }
  }

  console.log()
  console.log(
    dim(
      'A watch that speaks only about problems is indistinguishable from one' +
        ' that has stopped. That is what the heartbeat is for.'
    )
  )
  if (bad) process.exitCode = 1
}

module.exports = { judge, OVERDUE_MS, CHANNELS }

if (require.main === module) main()
