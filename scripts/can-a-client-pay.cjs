#!/usr/bin/env node
/**
 * CAN A CLIENT ACTUALLY PAY RIGHT NOW.
 *
 * Owner, 2026-09-17: "проверь работает ли оплата в крипте звездах или рублях".
 * Answering that took an hour of reading: which routes exist, which keys are on
 * which service, what the mini app's buttons really do. None of it was written
 * down anywhere, so the next person would pay the same hour.
 *
 * What that hour found, and what this now checks in one command:
 *
 *   Stars      works end to end -- the production cashier minted a real invoice
 *   Roubles    keys live on the BOT service, no route on the render at all
 *   Crypto     same
 *   Profile    the mini app's profile page has no payment entry point at all
 *   Paywall    its three buttons opened ?start=subscribe_..., which the bot did
 *              not know -- fixed, and checked here so it stays fixed
 *
 *   node scripts/can-a-client-pay.cjs            read-only
 *   node scripts/can-a-client-pay.cjs --invoice  ALSO mint one real invoice
 *
 * Minting writes a token_invoices row, so it is opt-in. Keys are read into
 * variables and never printed, per the mcp-owner-access skill.
 */
'use strict'

const fs = require('node:fs')
const { execSync } = require('node:child_process')

const BASE = 'https://vibee-render-production.up.railway.app'
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

const ok = s => `${green('works')}   ${s}`
const no = s => `${red('broken')}  ${s}`
const meh = s => `${dim('partial')} ${s}`

function sh(cmd) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      shell: '/bin/sh',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return ''
  }
}

/** Variable NAMES on a Railway service. Values are never read or printed. */
function varsOf(service) {
  const out = sh(
    `railway service ${service} >/dev/null 2>&1; railway variables --kv 2>/dev/null`
  )
  return new Set(
    out
      .split('\n')
      .map(l => l.split('=')[0])
      .filter(Boolean)
  )
}

function keyFrom(service, name, part) {
  const out = sh(
    `railway service ${service} >/dev/null 2>&1; railway variables --kv 2>/dev/null`
  )
  const line = out.split('\n').find(l => l.startsWith(`${name}=`))
  if (!line) return ''
  const value = line.slice(name.length + 1)
  return part === 'before-colon' ? value.split(',')[0].split(':')[0] : value
}

function packs() {
  const body = sh(
    `curl -s --max-time 25 ${JSON.stringify(`${BASE}/api/tokens/packs`)}`
  )
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

function mintInvoice() {
  const agentKey = keyFrom('vibee-render', 'AGENT_KEYS', 'before-colon')
  if (!agentKey) return { ok: false, error: 'no AGENT_KEYS reachable' }
  const out = sh(
    `curl -s --max-time 30 -X POST ${JSON.stringify(`${BASE}/api/tokens/invoice`)} ` +
      `-H ${JSON.stringify(`X-Agent-Key: ${agentKey}`)} ` +
      `-H 'Content-Type: application/json' -d '{"pack":"10"}'`
  )
  try {
    return JSON.parse(out)
  } catch {
    return { ok: false, error: 'the cashier answered something unparsable' }
  }
}

/**
 * Does the mini app have a way to pay on a given page.
 *
 * A DIRECT CALL IS NOT THE ONLY WAY IN, and assuming it was made this check
 * lie the moment the flow was shared. The top-up moved into `useTokenTopUp`
 * so the chat and the profile could stop keeping two copies of it -- and this
 * function, which looked for the route literal, went on reporting that the
 * profile could not pay while the button sat right there.
 *
 * A probe that checks for yesterday's spelling of a thing is a probe that
 * reports the refactor as a regression.
 */
function miniAppEntry(file) {
  try {
    const src = fs.readFileSync(file, 'utf8')
    return (
      /\/api\/tokens\/(invoice|verify)/.test(src) ||
      /useTokenTopUp|TokenTopUpCard/.test(src)
    )
  } catch {
    return false
  }
}

function main() {
  console.log(bold('can a client pay right now\n'))

  const p = packs()
  if (p && p.ok) {
    const list = (p['пакеты'] || p.packs || [])
      .map(x => `${x['токенов'] ?? x.tokens}/${x['звёзд'] ?? x.stars}`)
      .join(', ')
    console.log(ok(`Stars: the cashier answers, on sale: ${list}`))
  } else {
    console.log(no('Stars: /api/tokens/packs did not answer'))
  }

  const render = varsOf('vibee-render')
  const bot = varsOf('999-multibots-telegraf')
  console.log(
    render.has('TOKENS_PAYMENT_BOT_TOKEN')
      ? ok('Stars: TOKENS_PAYMENT_BOT_TOKEN is set on the render')
      : no('Stars: TOKENS_PAYMENT_BOT_TOKEN missing -- the cashier answers 503')
  )

  /*
   * The keys for roubles and crypto are on the BOT, and the mini app talks to
   * the RENDER. That is the whole reason those two are "open the bot" buttons
   * rather than cashiers: not a missing key, a missing route.
   */
  const roubles = ['MERCHANT_LOGIN', 'ROBOKASSA_PASSWORD_1'].every(k =>
    bot.has(k)
  )
  const crypto = bot.has('CRYPTOBOT_API_TOKEN') || bot.has('TON_WALLET_ADDRESS')
  console.log(
    roubles
      ? meh('roubles: keys on the BOT service, no route on the render')
      : no('roubles: no Robokassa keys anywhere')
  )
  console.log(
    crypto
      ? meh('crypto: keys on the BOT service, no route on the render')
      : no('crypto: no TON or CryptoBot keys anywhere')
  )

  const chat = miniAppEntry('apps/vibee-editor/player/src/pages/Chat.tsx')
  const profile = miniAppEntry('apps/vibee-editor/player/src/pages/Profile.tsx')
  console.log(
    chat
      ? ok('mini app: the chat can top up with Stars')
      : no('mini app: nothing calls the tokens routes any more')
  )
  console.log(
    profile
      ? ok('mini app: the profile can top up')
      : meh('mini app: the PROFILE has no way to pay -- only the chat does')
  )

  /*
   * The paywall's buttons open the bot with ?start=subscribe_... For a year
   * that payload was dropped on the floor. Checked here because a silent
   * dead-end is exactly the failure nobody reports.
   */
  let lands = false
  try {
    const src = fs.readFileSync('src/navigation/registerCommands.ts', 'utf8')
    lands = /subscribeIntent\(startParam\)/.test(src)
  } catch {
    /* not in the bot repo */
  }
  console.log(
    lands
      ? ok('paywall: /start subscribe_... lands in the subscription scene')
      : no('paywall: its three buttons open the bot, which drops the payload')
  )

  if (process.argv.includes('--invoice')) {
    const r = mintInvoice()
    console.log()
    console.log(
      r.ok && r.link
        ? ok('a real invoice was minted just now (link not printed)')
        : no(`the cashier refused: ${String(r.error).slice(0, 80)}`)
    )
    console.log(dim('  that wrote one token_invoices row.'))
  } else {
    console.log(dim('\n--invoice also mints one real invoice (writes a row).'))
  }
}

main()
