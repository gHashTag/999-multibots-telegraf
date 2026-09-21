#!/usr/bin/env node
/**
 * IS THIS CLIENT PACKAGED -- AND WHAT IS THE NEXT PRESS.
 *
 * Owner, 2026-09-21: "she is a client -- her bot is Leela Chakra, about neural
 * networks. Check and package the client, testing every function on this
 * business case, so that afterwards we can scale it."
 *
 * A client package is not one row. It is eight parts that live in eight
 * places: the profile (crm_client_profile), the twin's SOUL, the content plan,
 * the person connected as a seller, their live wallet, the duets that rehearse
 * the sale, and the parts only the person can do. Measured on the first case
 * the same day: the package had been installed on 2026-09-13, and eight days
 * later the content plan stood at 0 of 14 and the SOUL was still the draft the
 * platform wrote -- nobody could see that without opening five tools.
 *
 * This prints the eight parts as one table, each with its state and the one
 * press that moves it, so the same command runs for the next client and the
 * hundredth. Read-only: every call is a reading tool over the server key, as
 * the owner (.claude/skills/mcp-owner-access). It sends nothing.
 *
 *   tri pack <telegram_id> <username>
 *
 * Exit: 0 packaged, 1 something to do, 2 could not look.
 */
'use strict'

const BASE =
  process.env.RENDER_BASE_URL ||
  'https://vibee-render-production.up.railway.app'

/** The parts no tool can do for the person. Printed, never skipped. */
const HUMAN_ONLY = [
  'the four discovery answers -- in her own words, not the persona model',
  'reading and correcting the SOUL draft -- it speaks in her name',
  'approving the first reel before anything is published',
  'one real payment through the cashier of her own bot',
]

const DRAFT = /draft|черновик/i // cyrillic-ok: matching the status the tools write

/**
 * The report, from what the tools answered. Pure: every input may be null
 * (a tool that did not answer), and a null is a gap with a name, never a pass.
 */
function packReport({ id, profile, soul, plan, sellers, wallet, runs }) {
  const rows = []
  const row = (part, state, detail, next = '') =>
    rows.push({ part, state, detail, next })

  if (!profile) row('profile', 'gap', 'unreadable', 'check the render')
  else if (!profile.has_profile) {
    row('profile', 'gap', 'not installed', 'crm_client_setup')
  } else if (DRAFT.test(String(profile.profile?.status ?? ''))) {
    row(
      'profile',
      'human',
      `installed ${String(profile.updated_at ?? '').slice(0, 10)}, still hypotheses`,
      'her four discovery answers turn them into facts'
    )
  } else row('profile', 'ok', 'confirmed')

  if (!soul || soul.ok === false) {
    row('soul', 'gap', 'no SOUL', 'crm_client_setup installs the draft')
  } else if (DRAFT.test(String(soul.soul ?? '').slice(0, 400))) {
    row(
      'soul',
      'human',
      `the platform's draft since ${String(soul.updatedAt ?? '').slice(0, 10)}`,
      'she reads and corrects it in the app'
    )
  } else row('soul', 'ok', 'her own words')

  if (!sellers)
    row('seller', 'gap', 'seller list unreadable', 'check the render')
  else if (!sellers.has(String(id))) {
    row(
      'seller',
      'gap',
      'not connected',
      'she connects Telegram in the app; the code is hers to type'
    )
  } else row('seller', 'ok', 'connected')

  const raw = wallet ? wallet['баланс_токенов'] : undefined
  if (typeof raw !== 'number' || !Number.isFinite(raw))
    row('wallet', 'gap', 'unreadable', 'check the render')
  else if (raw <= 0) {
    row('wallet', 'gap', 'empty', 'top up, or the owner decides to credit')
  } else row('wallet', 'ok', `${raw} tokens`)

  const total = Number(plan?.total)
  const done = Number(plan?.done)
  if (!plan || !Number.isFinite(total)) {
    row('plan', 'gap', 'unreadable', 'check the render')
  } else if (total === 0) {
    row('plan', 'gap', 'no content plan', 'crm_client_setup')
  } else if (!(done > 0)) {
    const first = (plan.items ?? []).find(i => i.status !== 'done')
    row(
      'plan',
      'gap',
      `0 of ${total} produced`,
      first ? `produce the first: ${String(first.title).slice(0, 60)}` : ''
    )
  } else row('plan', done >= total ? 'ok' : 'gap', `${done} of ${total}`)

  const list = Array.isArray(runs?.runs) ? runs.runs : null
  if (!list) row('duet', 'gap', 'unreadable', 'check the render')
  else {
    const real = list.filter(r => !r.dry_run)
    const good = real.find(
      r => r.state === 'done' && !(r.violations ?? []).length
    )
    if (good) {
      row(
        'duet',
        'ok',
        `${real.length} real, last clean ${String(good.finished_at ?? '').slice(0, 10)}`
      )
    } else {
      row(
        'duet',
        'gap',
        `${list.length} runs, none real and clean`,
        'crm_duet, dry run first, owner authorises in chat'
      )
    }
  }

  for (const h of HUMAN_ONLY) row('human', 'human', h)
  return {
    rows,
    gaps: rows.filter(r => r.state === 'gap').length,
    human: rows.filter(r => r.state === 'human').length,
  }
}

async function tool(key, as, name, args = {}) {
  try {
    const r = await fetch(`${BASE}/mcp?telegram_id=${encodeURIComponent(as)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    })
    const d = await r.json()
    if (d.error) return null
    return JSON.parse(d.result?.content?.[0]?.text ?? 'null')
  } catch {
    return null
  }
}

async function main() {
  const key = process.env.RENDER_API_KEY
  const owner = String(process.env.ADMIN_IDS || '')
    .split(',')[0]
    .trim()
  const [id, username] = process.argv.slice(2)
  if (!key || !owner || !/^\d{5,15}$/.test(String(id)) || !username) {
    console.error(
      'usage: tri pack <telegram_id> <username>  (on the bot service)'
    )
    process.exitCode = 2
    return
  }
  const [profile, soul, plan, sellerList, wallet, runs] = await Promise.all([
    tool(key, owner, 'crm_client_profile', { telegram_id: id }),
    tool(key, owner, 'soul_of', {
      username: String(username).replace(/^@/, ''),
    }),
    tool(key, owner, 'crm_client_plan', { telegram_id: id }),
    tool(key, owner, 'crm_sellers'),
    tool(key, id, 'my_balance'),
    tool(key, owner, 'crm_duet_runs', { buyer: id, limit: 20 }),
  ])
  const sellers = Array.isArray(sellerList?.sellers)
    ? new Set(sellerList.sellers.map(r => String(r.telegram_id)))
    : null
  const r = packReport({ id, profile, soul, plan, sellers, wallet, runs })
  const mark = { ok: '✓', gap: '✗', human: '·' }
  console.log(`client ${id} @${String(username).replace(/^@/, '')}`)
  for (const x of r.rows) {
    console.log(
      `  ${mark[x.state]} ${x.part.padEnd(8)} ${x.detail}${x.next ? `  -> ${x.next}` : ''}`
    )
  }
  console.log(
    `\n${r.gaps} gap(s) for the machine and the owner, ${r.human} for the person`
  )
  process.exitCode = r.gaps ? 1 : 0
}

module.exports = { packReport, HUMAN_ONLY }

if (require.main === module) {
  main().catch(e => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 2
  })
}
