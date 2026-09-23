#!/usr/bin/env node
'use strict'
/**
 * WHICH BOTS LIVE ON OUR OWN BOT API SERVER, AND DO THE THREE SERVICES AGREE.
 *
 *   tri botapi
 *
 * A bot is on our server only when three variables on three services say so
 * together: BOT_API_LOCAL_BOTS on 999-multibots-telegraf (the bot sends it
 * there), the same list on vibee-render (a reference; the render sends it
 * there too), and BOT_API_ALLOWED_IDS on telegram-bot-api (the proxy lets it
 * in). Any two out of three is a state with a name -- mid-move, a silent bot,
 * a half-finished rollback, or a split -- and each has one next step
 * (deployment/telegram-bot-api/README.md, 4 and 4b).
 *
 * Read-only and token-free: it reads those three variables through
 * `railway variables --kv` (envFromKv keeps only them; nothing else is kept or
 * printed) and the boot lines of the three logs. It calls no Telegram server
 * -- a call to the cloud for a moved bot logs it back in there.
 */

const { execFileSync } = require('node:child_process')
const { envFromKv, readBotApiConfig } = require('./lib/telegram-api.cjs')
const allowed = require('../deployment/telegram-bot-api/allowed-bots.cjs')

/**
 * The state of every bot any of the three lists names, and what to do next.
 * Pure: Maps of id -> username|null in, rows and a verdict out.
 */
function botApiFindings({ bot, render, admitted }) {
  const ids = [
    ...new Set([...bot.keys(), ...render.keys(), ...admitted.keys()]),
  ].sort()
  const rows = ids.map(id => {
    const b = bot.has(id)
    const r = render.has(id)
    const a = admitted.has(id)
    const name = bot.get(id) || render.get(id) || admitted.get(id) || null
    let level
    let state
    if (b && r && a) {
      level = 'ok'
      state = 'on our server'
    } else if (b !== r) {
      level = 'red'
      state =
        `the services disagree: ${b ? 'vibee-render' : '999-multibots-telegraf'} ` +
        'still sends it to the cloud, which logs it back in there. Make the render ' +
        'carry the reference BOT_API_LOCAL_BOTS=${{999-multibots-telegraf.BOT_API_LOCAL_BOTS}}'
    } else if (b && r && !a) {
      level = 'yellow'
      state =
        'pointed but not let in: the bot is silent. Mid-move: step 2 ' +
        '(--cloud-logout --pointed) if it has not logged out yet, else step 3 ' +
        '(add it to BOT_API_ALLOWED_IDS)'
    } else {
      level = 'yellow'
      state =
        'let in but not pointed: the services send it to the cloud. A rollback ' +
        'left half done -- take it out of BOT_API_ALLOWED_IDS'
    }
    return { id, name, bot: b, render: r, admitted: a, level, state }
  })
  const worst = rows.some(r => r.level === 'red')
    ? 'red'
    : rows.some(r => r.level === 'yellow')
      ? 'yellow'
      : 'ok'
  return { rows, worst }
}

function railway(args) {
  return execFileSync('railway', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 32 * 1024 * 1024,
  })
}

/** BOT_API_LOCAL_BOTS of one service, parsed as that service parses it. */
function localBotsOf(service) {
  const env = envFromKv(railway(['variables', '--service', service, '--kv']))
  const out = new Map()
  for (const [id, b] of readBotApiConfig(env).local) out.set(id, b.username)
  return out
}

/** BOT_API_ALLOWED_IDS on the server, as its proxy reads it. */
function admittedIds() {
  const kv = railway(['variables', '--service', 'telegram-bot-api', '--kv'])
  if (!kv.trim())
    throw new Error('telegram-bot-api variables could not be read')
  const line = kv.split('\n').find(l => l.startsWith(`${allowed.VARIABLE}=`))
  return allowed.parseAllowedVariable(
    line ? line.slice(line.indexOf('=') + 1) : ''
  )
}

// Anything token-shaped is masked before a log line is printed.
const masked = s =>
  String(s).replace(/(\d{5,}:)[A-Za-z0-9_-]{20,}/g, '$1<token>')

/** The last line of a service's log matching a pattern, or null. */
function lastLine(service, pattern) {
  let text = ''
  try {
    text = railway(['logs', '--service', service, '--lines', '1500'])
  } catch {
    return null
  }
  const hits = text.split('\n').filter(l => pattern.test(l))
  return hits.length ? masked(hits[hits.length - 1].trim()).slice(0, 180) : null
}

function main() {
  const bot = localBotsOf('999-multibots-telegraf')
  const render = localBotsOf('vibee-render')
  const admitted = admittedIds()
  const { rows, worst } = botApiFindings({ bot, render, admitted })
  const mark = { ok: '✓', yellow: '!', red: '✗' }
  console.log('bots on our Bot API server (bot / render / server admits):')
  if (!rows.length) console.log('  none -- every bot is on the cloud')
  for (const r of rows) {
    const yn = x => (x ? 'y' : '-')
    console.log(
      `  ${mark[r.level]} ${r.id} ${String(r.name || '').padEnd(24)} ` +
        `${yn(r.bot)} / ${yn(r.render)} / ${yn(r.admitted)}  ${r.state}`
    )
  }
  console.log('')
  console.log('boot lines (latest):')
  const lines = [
    ['bot', '999-multibots-telegraf', /Bot API: \d+ of \d+ bot\(s\)/],
    [
      'render',
      'vibee-render',
      /Bot API: \d+ bot\(s\) on our server|every bot on the cloud/,
    ],
    ['server', 'telegram-bot-api', /\[api\] Bot API proxy on/],
    ['monitor', '999-multibots-telegraf', /\[bot-api\]/],
  ]
  for (const [label, service, re] of lines) {
    console.log(
      `  ${label.padEnd(8)} ${lastLine(service, re) || '(none in the recent log)'}`
    )
  }
  console.log('')
  console.log(
    // This line PRINTS the host inside a sentence for the human reading the
    // report. It calls nothing and resolves nothing, so there is no host here
    // to route through a helper -- the word IS the warning.
    // The marker goes on the line immediately above the offending one: the
    // scanner reads only that one line back.
    // telegram-api-root-ok
    'Never call api.telegram.org with the token of a bot marked y/y/y: any method ' +
      'logs it back into the cloud.'
  )
  return worst === 'red' ? 1 : 0
}

module.exports = { botApiFindings }

if (require.main === module) {
  try {
    process.exit(main())
  } catch (e) {
    console.error(`botapi: ${e && e.message ? e.message : e}`)
    process.exit(2)
  }
}
