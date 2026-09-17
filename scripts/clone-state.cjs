#!/usr/bin/env node
/**
 * WHICH PIECES OF THE DIGITAL CLONE A PERSON ACTUALLY HAS.
 *
 * Three things make a clone: a SOUL that says who they are, a voice of their
 * own, and a face to render. All three existed in some form and two of them
 * were unreachable -- the voice had no route, the avatar was in a column
 * nobody read. That was only visible after an hour of grepping, which is
 * exactly the kind of hour this repository turns into a command.
 *
 *   node scripts/clone-state.cjs [telegram_id]
 *
 * Read-only. Keys are read into variables and never printed.
 */
'use strict'

const { execSync } = require('node:child_process')

const BASE = 'https://vibee-render-production.up.railway.app'
const ESC = String.fromCharCode(27)
const dim = s => `${ESC}[2m${s}${ESC}[0m`
const green = s => `${ESC}[32m${s}${ESC}[0m`
const red = s => `${ESC}[31m${s}${ESC}[0m`
const bold = s => `${ESC}[1m${s}${ESC}[0m`

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

function keys() {
  const out = sh(
    'railway service vibee-render >/dev/null 2>&1; railway variables --kv 2>/dev/null'
  )
  const pick = name => {
    const line = out.split('\n').find(l => l.startsWith(`${name}=`))
    return line ? line.slice(name.length + 1) : ''
  }
  return {
    agent: pick('AGENT_KEYS').split(',')[0].split(':')[0],
    api: pick('RENDER_API_KEY'),
  }
}

function ask(url, header) {
  const out = sh(
    `curl -s --max-time 25 ${JSON.stringify(url)} -H ${JSON.stringify(header)}`
  )
  try {
    return JSON.parse(out)
  } catch {
    return null
  }
}

function main() {
  const who = process.argv[2] || ''
  const k = keys()
  if (!k.agent && !k.api) {
    console.error('no key reachable: railway service vibee-render')
    process.exitCode = 2
    return
  }

  const url = who
    ? `${BASE}/api/clone/status?telegram_id=${encodeURIComponent(who)}`
    : `${BASE}/api/clone/status`
  const header = k.agent ? `X-Agent-Key: ${k.agent}` : `X-Api-Key: ${k.api}`
  const d = ask(url, header)

  console.log(bold(`clone state${who ? ` for ${who}` : ''}`))
  if (!d || d.ok === false) {
    console.log(red(`  could not read it: ${String(d?.error ?? 'no answer')}`))
    process.exitCode = 1
    return
  }

  const mark = v => (v ? green('yes') : red('no '))
  console.log(
    `  voice   ${mark(d.voice)}  ${dim('an ElevenLabs voice of their own')}`
  )
  console.log(
    `  photo   ${mark(d.photo)}  ${dim('a face to render, stored at registration')}`
  )
  /*
   * The SOUL is deliberately not here. It lives behind an agent tool call with
   * a POST body rather than on the user row, and a line that says "not asked"
   * every single time is furniture, not information.
   */

  if (!d.voice || !d.photo) {
    console.log(
      dim('\n  a missing piece is what the welcome road opens a step for.')
    )
  }
}

main()
