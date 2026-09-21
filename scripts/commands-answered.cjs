#!/usr/bin/env node
/**
 * DOES EVERY COMMAND IN THE MENU ACTUALLY ANSWER?
 *
 * Owner, 2026-09-21: "check that all our commands are invoked -- we did the
 * testing through user bots for exactly this; finish it if it is not done."
 *
 * It was not done. `tri bridge` proves a command is SET in the menu
 * (getMyCommands). That is not the same as a command that ANSWERS: a menu
 * entry with no handler behind it is a button that does nothing, and the
 * bridge would still print it green.
 *
 * ── THE EVIDENCE IS THE OWNER'S OWN CORRESPONDENCE ─────────────────────────
 *
 * This reads the owner's real history with each bot through `tg_history` -- a
 * READ-ONLY tool -- and for every advertised command answers one question:
 * the last time a person sent it, did the bot reply?
 *
 *   answered   a bot message followed within the window
 *   SILENT     the command was sent and nothing came back
 *   untried    nobody has sent it to this bot yet
 *
 * That is the "a person with a phone got an answer" standard the function
 * audit (docs/audit/what-works.md) found missing almost everywhere -- taken
 * from what already happened, not from a double.
 *
 * ── IT SENDS NOTHING ───────────────────────────────────────────────────────
 *
 * Every send from the owner's account in this codebase is a PROPOSAL the owner
 * confirms, deliberately. This tool does not go around that. An "untried" row
 * is a command for a person to tap -- the rainbow bridge -- after which the
 * next run turns it green or red.
 *
 *   railway run -s 999-multibots-telegraf node scripts/commands-answered.cjs
 *
 * Exit: 0 nothing silent, 1 something silent, 2 could not look.
 */
'use strict'

// The host is chosen per bot: a bot on our own Bot API server must never be
// asked on the cloud (scripts/lib/telegram-api.cjs).
const { telegramApiFor } = require('./lib/telegram-api.cjs')

const BASE =
  process.env.RENDER_BASE_URL ||
  'https://vibee-render-production.up.railway.app'
/** Whose correspondence: the first admin, as every other owner-side tool. */
const OWNER =
  process.env.OWNER_TELEGRAM_ID ||
  String(process.env.ADMIN_IDS || '')
    .split(',')[0]
    .trim()
/** How long after a command a reply still counts as its answer. */
const WINDOW_S = 120

const PAINT = Boolean(process.stdout.isTTY)
const E = PAINT ? String.fromCharCode(27) : ''
const c = (n, s) => (PAINT ? `${E}[${n}m${s}${E}[0m` : s)
const red = s => c(31, s)
const green = s => c(32, s)
const dim = s => c(2, s)
const bold = s => c(1, s)

/** The commands the menu advertises. Read from setCommands.ts, not typed. */
function advertised() {
  const fs = require('fs')
  const path = require('path')
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'setCommands.ts'),
    'utf8'
  )
  return [
    ...new Set([...src.matchAll(/command:\s*'([a-z_]+)'/g)].map(m => m[1])),
  ]
}

async function tg(method, body = {}, token) {
  const r = await fetch(`${telegramApiFor(token)}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

async function history(key, username) {
  const r = await fetch(`${BASE}/mcp?telegram_id=${OWNER}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'tg_history',
        arguments: { chat: '@' + username, limit: 200 },
      },
    }),
  })
  const d = await r.json()
  if (d.error) throw new Error(d.error.message || 'tg_history refused')
  const text = d.result?.content?.[0]?.text ?? '{}'
  return JSON.parse(text).messages ?? []
}

/**
 * For one command in one chat: the verdict for its LAST sending. The last one
 * and not any: a command that answered in June and is silent today is silent.
 */
function verdictFor(command, messages, botId) {
  const sorted = [...messages].sort((a, b) => Number(a.date) - Number(b.date))
  const sent = sorted.filter(
    m =>
      String(m.from) !== String(botId) &&
      new RegExp(`^/${command}(?:@[A-Za-z0-9_]+)?(?:\\s|$)`).test(
        String(m.text ?? '').trim()
      )
  )
  if (!sent.length) return { status: 'untried' }
  const last = sent[sent.length - 1]
  const t0 = Number(last.date)
  const reply = sorted.find(
    m =>
      String(m.from) === String(botId) &&
      Number(m.date) >= t0 &&
      Number(m.date) - t0 <= WINDOW_S
  )
  return reply
    ? { status: 'answered', seconds: Number(reply.date) - t0 }
    : { status: 'SILENT', at: t0 }
}

async function main() {
  const key = process.env.RENDER_API_KEY
  if (!key || !OWNER) {
    console.error(
      'Needs RENDER_API_KEY, ADMIN_IDS and BOT_TOKEN_*. Run it on the bot service: tri commands'
    )
    process.exitCode = 2
    return
  }
  const commands = advertised()
  console.log(bold(`menu commands: ${commands.map(x => '/' + x).join(' ')}`))
  console.log(
    dim(
      `evidence: the owner's own history with each bot, read-only; nothing is sent\n`
    )
  )

  let silent = 0
  let untried = 0
  let answered = 0
  for (let i = 1; i <= 20; i++) {
    const token = process.env[`BOT_TOKEN_${i}`]
    if (!token) continue
    const me = await tg('getMe', {}, token)
    if (!me.ok) continue
    const { username, id } = me.result
    let messages
    try {
      messages = await history(key, username)
    } catch (e) {
      console.log(
        `${String(username).padEnd(28)} ${red('could not read history')} ${dim(String(e.message).slice(0, 60))}`
      )
      continue
    }
    const cells = commands.map(cmd => {
      const v = verdictFor(cmd, messages, id)
      if (v.status === 'answered') {
        answered++
        return green(`/${cmd} ✓`)
      }
      if (v.status === 'SILENT') {
        silent++
        return red(`/${cmd} ✗`)
      }
      untried++
      return dim(`/${cmd} ·`)
    })
    console.log(`${String(username).padEnd(28)} ${cells.join('  ')}`)
  }

  console.log('')
  console.log(
    `${green('✓ answered')} ${answered}   ${red('✗ SILENT')} ${silent}   ${dim('· untried')} ${untried}`
  )
  if (untried) {
    console.log(
      dim(
        'untried = nobody has sent it yet. Tap it from a phone (the rainbow bridge), then run this again.'
      )
    )
  }
  process.exitCode = silent ? 1 : 0
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exitCode = 2
})
