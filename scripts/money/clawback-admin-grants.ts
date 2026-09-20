/**
 * Remove admin-granted stars from the archive.
 *
 * OWNER DECISION 2026-09-20, in their words: "всем снимай кроме админов!
 * начинам новый сервис" — the new service starts with people paying for
 * themselves. Money someone actually paid stays; stars an admin script handed
 * out go away.
 *
 *   remove = min(admin, balance)   -- see `clawbackAmount` in src/core/money
 *
 * Capped by the balance so nobody is pushed negative, capped by the grant so a
 * real payer keeps everything their own money bought.
 *
 * A reversal is a normal `MONEY_OUTCOME` row, because balance here is a SUM
 * over the ledger and not a column — there is nothing else to edit. Two details
 * are deliberate:
 *
 *   - `inv_id` = `grant-clawback-<id>` is the idempotency key, but `inv_id` has
 *     no unique constraint (it even allows NULL), so the guard is a read of the
 *     existing rows before the write. A run that skips that read charges twice.
 *   - `payment_date` is backdated to the last grant. `hasChargeToRefund` treats
 *     a fresh outcome row as a refundable charge for 24h; a reversal must not
 *     become something a user can refund.
 *
 * This ran once, on 2026-09-20: 19 users, 852839 stars, rows #19780-#19798.
 *
 * Dry run unless invoked with --commit.
 *
 *   bun run scripts/money/clawback-admin-grants.ts
 *   bun run scripts/money/clawback-admin-grants.ts --commit
 *
 * See `docs/architecture/single-wallet-decision.md`.
 */

import { paged, walletEnv, isCommit, banner } from './lib'
import {
  foldLedger,
  clawbackAmount,
  classify,
  starsOf,
  type LedgerRow,
} from '../../src/core/money/ledgerClassify'

const CLAWBACK_PREFIX = 'grant-clawback-'
const DAY_MS = 24 * 3600 * 1000

type Row = LedgerRow & {
  id?: number
  telegram_id: string
  inv_id?: string | null
  payment_date?: string | null
}

/** Owner's exemptions, each with the reason it was granted. */
const EXEMPT = new Map<string, string>([
  ['144022504', 'admin (ADMIN_IDS) @neuro_sage'],
  ['1254048880', 'admin (ADMIN_IDS)'],
  ['352374518', 'admin (ADMIN_IDS) @muse_nataly'],
  ['1852726961', 'admin (ADMIN_IDS)'],
  ['435572800', 'admin (ADMIN_IDS) @playom'],
  ['1047716284', 'admin (ADMIN_TELEGRAM_ID) @Biduero'],
  ['7669741878', 'admin Haim, owner instruction @Arhustel'],
  ['289259562', 'owner, owner instruction @Vyacheslav_Neklyudov_haim'],
  ['373211349', 'paid cash off-platform @Farishka'],
  ['504608015', 'paid cash off-platform @SamHold'],
])

const { supabaseUrl, supabaseKey } = walletEnv()
const base = supabaseUrl.replace(/\/$/, '')
const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
const commit = isCommit()

// Assert the read was complete before deciding anything. PostgREST caps a page
// at 1000 rows whatever `limit=` says, and a short read here would look like
// "these users have no grants".
const head = await fetch(`${base}/rest/v1/payments_v2?select=id&limit=1`, {
  headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
})
const expected = Number((head.headers.get('content-range') ?? '').split('/')[1])
const rows = await paged<Row>(
  supabaseUrl,
  supabaseKey,
  'payments_v2?select=id,telegram_id,type,stars,status,payment_method,bot_name,service_type,description,inv_id,payment_date&order=id'
)
if (rows.length !== expected) {
  throw new Error(`INCOMPLETE READ ${rows.length}/${expected}`)
}
console.log(`read verified: ${rows.length}/${expected}`)

const totals = foldLedger(rows)

// When the last grant landed, per user: the reversal is backdated to it.
const lastGrant = new Map<string, string>()
for (const r of rows) {
  if (r.status !== 'COMPLETED' || classify(r) !== 'admin' || starsOf(r) <= 0) continue
  const id = String(r.telegram_id)
  const when = String(r.payment_date ?? '')
  if (when && (!lastGrant.has(id) || when > lastGrant.get(id)!)) lastGrant.set(id, when)
}

const already = new Set(
  rows
    .filter(r => String(r.inv_id ?? '').startsWith(CLAWBACK_PREFIX))
    .map(r => String(r.telegram_id))
)

const plan: Array<{
  id: string
  name: string
  granted: number
  balance: number
  remove: number
  when: string
}> = []
for (const [id, t] of totals) {
  if (t.admin <= 0) continue
  if (EXEMPT.has(id)) continue
  if (already.has(id)) {
    console.log(`skip ${id}: already clawed back`)
    continue
  }
  const remove = clawbackAmount(t)
  if (remove <= 0) continue
  const when = lastGrant.get(id) ?? ''
  if (!when) throw new Error(`ABORT ${id}: grants found but no payment_date to backdate to`)
  if (Date.now() - Date.parse(when) < DAY_MS) {
    throw new Error(`ABORT ${id}: last grant ${when} is inside the 24h refund window`)
  }
  plan.push({ id, name: '', granted: t.admin, balance: t.balance, remove, when })
}
plan.sort((a, b) => b.remove - a.remove)

// Names are for the human reading the plan, nothing depends on them.
if (plan.length) {
  const users = await paged<{ telegram_id: string; username?: string }>(
    supabaseUrl,
    supabaseKey,
    `users?telegram_id=in.(${plan.map(p => p.id).join(',')})&select=telegram_id,username`
  )
  const nameOf = new Map<string, string>()
  for (const u of users) {
    const id = String(u.telegram_id)
    if (!nameOf.has(id)) nameOf.set(id, u.username ? `@${u.username}` : '')
  }
  for (const p of plan) p.name = nameOf.get(p.id) || '(no users row)'
}

console.log(`\n=== EXEMPT (${EXEMPT.size})`)
for (const [id, why] of EXEMPT) {
  const kept = Math.round(totals.get(id)?.admin ?? 0)
  console.log(`  ${id.padStart(12)} keeps ${String(kept).padStart(8)}⭐  ${why}`)
}

banner(commit)
console.log(`${plan.length} users\n`)
console.log('ID            granted   balance   REMOVE    after   who')
for (const p of plan) {
  console.log(
    `${p.id.padStart(12)} ${p.granted.toFixed(0).padStart(9)} ${p.balance
      .toFixed(0)
      .padStart(9)} ${p.remove.toFixed(0).padStart(8)} ${(p.balance - p.remove)
      .toFixed(0)
      .padStart(8)}   ${p.name}`
  )
}
if (plan.length) {
  const total = plan.reduce((s, p) => s + p.remove, 0)
  const lowest = Math.min(...plan.map(p => p.balance - p.remove))
  console.log(
    `\nTOTAL REMOVED: ${total.toFixed(0)}⭐ from ${plan.length} users; lowest resulting balance ${lowest.toFixed(0)}⭐`
  )
}

const stamp = new Date().toISOString()
const rowFor = (p: (typeof plan)[number]) => ({
  telegram_id: p.id,
  payment_date: p.when,
  amount: p.remove,
  stars: p.remove,
  currency: 'XTR',
  type: 'MONEY_OUTCOME',
  status: 'COMPLETED',
  category: 'REAL',
  payment_method: 'System',
  inv_id: `${CLAWBACK_PREFIX}${p.id}`,
  bot_name: 'admin_grant_clawback',
  language: 'ru',
  is_system_payment: true,
  is_test: false,
  transaction_context: 'PERSONAL',
  service_type: null,
  subscription_type: null,
  cost: null,
  model_name: null,
  description: `Reversal of admin-granted stars: ${p.remove} of ${p.granted} granted`,
  metadata: {
    stars_removed: p.remove,
    stars_granted_total: p.granted,
    balance_before: p.balance,
    reason: 'new service start: admin-granted stars removed; users pay for themselves',
    rule:
      'remove = min(granted, max(0, balance)) -- capped so nobody goes negative and a real payer keeps what their money bought',
    exempt_groups: 'ADMIN_IDS, owners, users who paid cash off-platform',
    payment_date_backdated_to_last_grant: true,
    payment_date_backdated_reason:
      'hasChargeToRefund would otherwise treat this reversal as a refundable charge for 24h',
    written_at: stamp,
    authorised_by: 'owner',
  },
})

if (!commit || !plan.length) {
  console.log('\nDry run only. Re-run with --commit to write.')
  process.exit(0)
}

const res = await fetch(`${base}/rest/v1/payments_v2`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify(plan.map(rowFor)),
})
const body = await res.text()
console.log(`\ninsert: HTTP ${res.status}`)
if (!res.ok) {
  console.log(body)
  process.exit(1)
}
for (const r of JSON.parse(body)) {
  console.log(`  inserted #${r.id} user ${r.telegram_id} -${r.stars}`)
}

// Verify against the balance the bots actually read, not against our counters.
console.log('\nBalances after (live RPC):')
for (const p of plan) {
  const balance = Number(
    await (
      await fetch(`${base}/rest/v1/rpc/get_user_balance`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_telegram_id: p.id }),
      })
    ).text()
  )
  console.log(
    `  ${p.id.padStart(12)} ${String(balance).padStart(10)}  expected ${(p.balance - p.remove).toFixed(0)}  ${balance < 0 ? 'NEGATIVE!' : 'ok'}`
  )
}
