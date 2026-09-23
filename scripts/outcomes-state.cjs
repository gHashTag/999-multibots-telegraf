#!/usr/bin/env node
/**
 * HOW MUCH WENT OUT WITHOUT THE OWNER -- FROM A TERMINAL.
 *
 * The same figure the app shows under the AUTO switch, counted on the server
 * from journal rows that already exist (render outcomes-tool.ts). Here for the
 * night shift: after a cycle it answers "did anything actually leave?" without
 * opening a phone.
 *
 * Read-only, and the key never leaves a variable.
 */
const { execFileSync } = require('child_process')

const BASE = 'https://vibee-render-production.up.railway.app'

function agentKey() {
  const fromEnv = (
    process.env.RENDER_AGENT_KEY ||
    process.env.AGENT_KEY ||
    ''
  ).trim()
  if (fromEnv) return fromEnv.split(',')[0].split(':')[0].trim()
  try {
    const kv = execFileSync(
      'railway',
      ['variables', '--service', 'vibee-render', '--kv'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const line = kv.split('\n').find(l => l.startsWith('AGENT_KEYS='))
    return line
      ? line.slice('AGENT_KEYS='.length).split(',')[0].split(':')[0].trim()
      : ''
  } catch {
    return ''
  }
}

async function main() {
  const days = Number(process.argv[2]) || 7
  const key = agentKey()
  if (!key) {
    console.error(
      'ключа нет: запусти из основной копии (там привязан railway) ' + // cyrillic-ok: operator-facing
        'или задай RENDER_AGENT_KEY.' // cyrillic-ok: operator-facing
    )
    process.exitCode = 2
    return
  }
  let out
  try {
    const r = await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Key': key },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'crm_outcomes', arguments: { days } },
      }),
      signal: AbortSignal.timeout(30_000),
    })
    const body = await r.json()
    const text = body?.result?.content?.[0]?.text
    out = text ? JSON.parse(text) : body?.result?.structuredContent
  } catch (e) {
    console.error(`рендер не ответил: ${String(e).slice(0, 120)}`) // cyrillic-ok: operator-facing
    process.exitCode = 2
    return
  }
  if (!out || typeof out.auto_sent !== 'number') {
    console.error('ответ без чисел — скорее всего отказ доступа.') // cyrillic-ok: operator-facing
    process.exitCode = 2
    return
  }
  if (out.note) {
    console.log(`За ${out.days} дн.: ${out.note}.`) // cyrillic-ok: operator-facing
  } else {
    const share =
      out.without_you_percent === null ? '—' : `${out.without_you_percent}%`
    console.log(
      `За ${out.days} дн.: ответов в чатах ${out.dm_answered}, карточек само ${out.auto_sent}, ` + // cyrillic-ok: operator-facing
        `отправил сам ${out.pressed_sent}, отменено ${out.cancelled} — без тебя ${share}.` // cyrillic-ok: operator-facing
    )
  }
  if (out.before) {
    const was =
      out.before.without_you_percent === null
        ? '—'
        : `${out.before.without_you_percent}%`
    console.log(
      `   неделей раньше: всего ${out.before.left} (ответов ${out.before.dm_answered}), без тебя ${was}.` // cyrillic-ok: operator-facing
    )
  }
  console.log(
    `   обходы: карточек ${out.cards_drawn}, тихо ${out.quiet}, упало ${out.failed}.` // cyrillic-ok: operator-facing
  )
}

void main()
