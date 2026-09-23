#!/usr/bin/env node
/**
 * WHAT AUTO MODE IS DOING RIGHT NOW -- FROM A TERMINAL.
 *
 * AUTO decides whether prepared cards leave for clients without the owner
 * pressing anything, and until now the only two places that could answer
 * "is it on?" were the app and the bot. During a night shift the question is
 * asked from here, and asking it should not require opening a phone.
 *
 * READ-ONLY, ON PURPOSE. Turning it on or off is the person's own act
 * (DIRECT_CALL_ONLY in the render's tools.ts, and the reason is written
 * there): a switch that lets an account send by itself must be flipped by a
 * hand, not by a script that could be run by anything. This command prints
 * the state and, when it is on, the two numbers that bound it.
 *
 * The key is read into a variable and never printed, like every other tri
 * command that talks to the render (bin/tri feed).
 */
const { execFileSync } = require('child_process')

const BASE = 'https://vibee-render-production.up.railway.app'

function agentKey() {
  /*
   * An already-exported key wins: `railway variables` only answers inside a
   * linked checkout, and a worktree is not one. Without this the command
   * printed "nothing to ask with" from exactly the trees the night shift runs
   * in.
   */
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
    if (!line) return ''
    // `key:telegram_id`, key first -- splitting on the comma alone sends the
    // whole pair and the server rightly refuses (skill mcp-owner-access).
    return line.slice('AGENT_KEYS='.length).split(',')[0].split(':')[0].trim()
  } catch {
    return ''
  }
}

async function main() {
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
        params: { name: 'autopilot_status', arguments: {} },
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
  if (!out || typeof out.on !== 'boolean') {
    console.error('ответ без состояния — скорее всего отказ доступа.') // cyrillic-ok: operator-facing
    process.exitCode = 2
    return
  }
  const scopeLine =
    out.scope === 'chosen'
      ? out.chosen > 0
        ? `   пишет только выбранным: ${out.chosen} чел.` // cyrillic-ok: operator-facing
        : '   пишет только выбранным, а не выбран никто — значит никому.' // cyrillic-ok: operator-facing
      : '   пишет всем, кому обход нарисовал карточку.' // cyrillic-ok: operator-facing
  if (!out.on) {
    console.log('AUTO выключен — каждая карточка ждёт нажатия.') // cyrillic-ok: operator-facing
    console.log(
      `   суточный потолок ${out.cap}, сегодня отправлено ${out.sent_today}.` // cyrillic-ok: operator-facing
    )
    return
  }
  const hours = Math.floor(out.minutes_left / 60)
  const mins = out.minutes_left % 60
  console.log(
    `AUTO ВКЛЮЧЁН: карточки уходят сами ещё ${hours} ч ${mins} мин.` // cyrillic-ok: operator-facing
  )
  console.log(
    `   сегодня ушло ${out.sent_today}, осталось ${out.left_today} из ${out.cap}.` // cyrillic-ok: operator-facing
  )
  console.log(scopeLine)
  console.log(
    '   выключается его кнопкой — в приложении или в боте; отсюда нельзя.' // cyrillic-ok: operator-facing
  )
}

void main()
