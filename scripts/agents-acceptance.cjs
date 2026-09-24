#!/usr/bin/env node
/**
 * AGENTS ACCEPTANCE ON THE OWNER (#2959).
 *
 * Owner, 2026-09-24: "test that they all work for me". Unit tests prove the
 * contracts are written; this proves each specialist, on the live service,
 * answers as itself and reaches for its own tools -- which is the evidence
 * the catalogue asks for before an agent goes `live`.
 *
 * Every canary asks for a DRAFT or a reading. A run that calls a tool that
 * publishes, sends or spends is a FAIL, not a pass with side effects.
 *
 * The key: `X-Agent-Key` for the owner (skill mcp-owner-access). Taken from
 * AGENT_KEY if exported, else from `railway variables --service
 * vibee-render --kv` inside this process. It is never printed, logged or
 * written anywhere. Trainees open only for a keeper (#2957), so the key must
 * be the owner's.
 *
 *   node scripts/agents-acceptance.cjs --dry        # the table, no calls
 *   node scripts/agents-acceptance.cjs              # every agent
 *   node scripts/agents-acceptance.cjs google habr  # some agents
 *   ... --no-record                                  # do not update the market
 *
 * After a run the verdicts are POSTed to /api/agents/acceptance (keepers
 * only): the market card shows "checked <date>" from them. Tool names and
 * failure codes travel; answer text never does.
 */
const { execFileSync } = require('node:child_process')

const BASE =
  process.env.RENDER_BASE || 'https://vibee-render-production.up.railway.app'

/*
 * THE TABLE LIVES IN ONE PLACE: render/src/agent/acceptance-canaries.json.
 * The render server's daily run (daily-acceptance.ts) reads the same file,
 * so a canary changed for one is changed for both.
 *
 * ACTING: tools that act outside the conversation -- a canary must never
 * reach them. AGENTS: one canary per catalogued agent; `expect` = at least
 * one of these tools is called. A test in the render suite holds that the
 * table covers every agent and names only tools that exist.
 */
const TABLE = require('../apps/vibee-editor/render/src/agent/acceptance-canaries.json')
const ACTING = TABLE.acting
const AGENTS = TABLE.agents

function agentKey() {
  if (process.env.AGENT_KEY) return process.env.AGENT_KEY.trim()
  // `railway run --service vibee-render` (tri agents) injects AGENT_KEYS:
  // "key:telegram_id,…". The header takes the part before the colon.
  if (process.env.AGENT_KEYS) {
    return process.env.AGENT_KEYS.split(',')[0].split(':')[0].trim()
  }
  try {
    const kv = execFileSync(
      'railway',
      ['variables', '--service', 'vibee-render', '--kv'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const line = kv.split('\n').find(l => l.startsWith('AGENT_KEYS='))
    // AGENT_KEYS is "key:telegram_id,key:telegram_id"; the header takes the
    // part BEFORE the colon of the first pair.
    return line
      ? line.slice('AGENT_KEYS='.length).split(',')[0].split(':')[0].trim()
      : ''
  } catch {
    return ''
  }
}

/** Reads the NDJSON stream: text, tool names, and the last error if any. */
function readStream(body) {
  const tools = []
  let text = ''
  let error = null
  for (const line of body.split('\n')) {
    if (!line.trim()) continue
    let e
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    const kind = e['тип'] // cyrillic-ok: the server's event key
    if (kind === 'инструмент')
      tools.push(String(e['имя'] ?? '')) // cyrillic-ok: server event names
    else if (kind === 'текст')
      text += String(e['текст'] ?? e['text'] ?? '') // cyrillic-ok: server event names
    else if (kind === 'ошибка')
      error = String(e['текст'] ?? e['error'] ?? 'error') // cyrillic-ok: server event names
    // A turn cut short says so on its last event; that is not an answer.
    else if (kind === 'готово' && e['обрыв']) error = `cut: ${e['обрыв']}` // cyrillic-ok: server event names
  }
  return { tools, text, error }
}

/**
 * Pass or fail for one agent, from what the stream showed. `reasons` are for
 * the terminal; `codes` are what the server keeps (agent-acceptance.ts
 * FAIL_CODES) -- never the prose, which may quote the owner's accounts.
 */
function verdict(agent, run) {
  const reasons = []
  const codes = []
  if (run.status !== 200) {
    reasons.push(`HTTP ${run.status}`)
    codes.push('http')
  }
  if (run.error) {
    reasons.push(`error: ${run.error.slice(0, 120)}`)
    codes.push('error')
  }
  if (!run.text.trim()) {
    reasons.push('no answer text')
    codes.push('no_answer')
  }
  const acted = run.tools.filter(t => ACTING.includes(t))
  if (acted.length) {
    reasons.push(`acted: ${acted.join(', ')}`)
    codes.push('acted')
  }
  if (agent.expect.length && !run.tools.some(t => agent.expect.includes(t))) {
    reasons.push(`none of ${agent.expect.join('/')} was called`)
    codes.push('expected_tool_missing')
  }
  return { pass: reasons.length === 0, reasons, codes }
}

/**
 * The verdicts go to the server so the market card can show them
 * (/api/agents/acceptance, keepers only). Tool names and codes, never text.
 */
async function record(verdicts, key) {
  try {
    const r = await fetch(`${BASE}/api/agents/acceptance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Key': key },
      body: JSON.stringify({ verdicts }),
      signal: AbortSignal.timeout(30_000),
    })
    return r.ok ? 'recorded' : `not recorded: HTTP ${r.status}`
  } catch (e) {
    return `not recorded: ${String(e).slice(0, 80)}`
  }
}

async function runOne(agent, key) {
  const r = await fetch(
    `${BASE}/api/agent/chat?agent=${encodeURIComponent(agent.id)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Key': key },
      body: JSON.stringify({
        messages: [{ role: 'user', content: agent.canary }],
      }),
      signal: AbortSignal.timeout(240_000),
    }
  )
  const body = await r.text()
  return { status: r.status, ...readStream(body) }
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const only = args.filter(a => !a.startsWith('--'))
  const list = only.length ? AGENTS.filter(a => only.includes(a.id)) : AGENTS
  if (dry) {
    for (const a of list)
      console.log(
        `${a.id}\texpects: ${a.expect.join('/') || '(text only)'}\n\t${a.canary}`
      )
    return 0
  }
  const key = agentKey()
  if (!key) {
    console.error(
      'No agent key: export AGENT_KEY, or log in with `railway login` so the script can read AGENT_KEYS from vibee-render.'
    )
    return 2
  }
  let failed = 0
  const verdicts = []
  for (const a of list) {
    let run
    try {
      run = await runOne(a, key)
    } catch (e) {
      run = { status: 0, tools: [], text: '', error: String(e) }
    }
    const v = verdict(a, run)
    if (!v.pass) failed += 1
    verdicts.push({
      agent: a.id,
      pass: v.pass,
      tools: run.tools,
      codes: v.codes,
    })
    console.log(
      `${v.pass ? 'PASS' : 'FAIL'}  ${a.id}  tools=[${run.tools.join(',')}]` +
        (v.pass ? '' : `  ${v.reasons.join('; ')}`)
    )
  }
  console.log(`\n${list.length - failed}/${list.length} agents passed`)
  if (!args.includes('--no-record'))
    console.log(`market: ${await record(verdicts, key)}`)
  return failed ? 1 : 0
}

module.exports = { AGENTS, ACTING, readStream, verdict }

if (require.main === module) {
  main().then(code => process.exit(code))
}
