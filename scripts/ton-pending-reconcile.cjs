#!/usr/bin/env node
/**
 * DID A TON PAYMENT ARRIVE THAT NOBODY EVER CREDITED.
 *
 * The TON channel credits on a BUTTON. A person sends the coins with the
 * invoice id in the comment, then presses "check payment"; the scene looks at
 * the chain, finds the transfer and flips the row to COMPLETED. Nothing else
 * ever looks. Close the app, lose the message, get distracted -- the coins are
 * on the chain and the row stays PENDING for ever, with no one watching.
 *
 * So this is the Robokassa reconcile (`tri reconcile`) for the other channel,
 * and it works the same way: ask an INDEPENDENT source. Our table is where the
 * defect lives; asked about a stuck payment it answers "PENDING", which is what
 * we already knew. The chain is public and remembers.
 *
 * MATCHING IS THE SCENE'S OWN, not a looser guess (src/core/ton/index.ts,
 * findNativePaymentByComment): the comment must equal the invoice id exactly,
 * the amount must be at least 99% of what was asked (fees), and a transfer
 * older than the invoice does not count.
 *
 * READ-ONLY, AND IT CREDITS NOBODY. Whether to complete a row that the chain
 * confirms is the owner's decision -- the same line the Robokassa reconcile
 * holds. This prints the list that decision is made from.
 *
 *   railway run -s 999-multibots-telegraf node scripts/ton-pending-reconcile.cjs
 *
 * The wallet address is read from the environment and NEVER printed: it is the
 * owner's, and a tool's output ends up in chats and issues.
 *
 * Exit: 0 nothing arrived that we failed to credit, 1 something did, 2 the
 * question could not be asked (no address, no database, the chain refused).
 */
'use strict'

const PAINT = Boolean(process.stdout.isTTY)
const ESC = PAINT ? String.fromCharCode(27) : ''
const wrap = (code, s) => (PAINT ? `${ESC}[${code}m${s}${ESC}[0m` : s)
const dim = s => wrap(2, s)
const red = s => wrap(31, s)
const green = s => wrap(32, s)
const yellow = s => wrap(33, s)
const bold = s => wrap(1, s)

/** The scene's tolerance, quoted rather than reinvented. */
const AMOUNT_TOLERANCE = 0.99

const nanoToTon = nano => Number(nano) / 1e9

/**
 * THE JUDGEMENT, PURE.
 *
 * Kept apart from both the database and the chain so the cases that matter --
 * the right comment with too little money, a transfer that predates the
 * invoice, a comment that merely contains the id -- can be tested without
 * anybody sending coins.
 */
function matches(invoice, tx) {
  if (String(tx.comment ?? '') !== String(invoice.inv_id)) return false
  if (invoice.issuedAt && tx.at < invoice.issuedAt) return false
  const asked = Number(invoice.amountTon)
  if (Number.isFinite(asked) && asked > 0) {
    if (nanoToTon(tx.valueNano) < asked * AMOUNT_TOLERANCE) return false
  }
  return true
}

async function transactionsOf(address, apiKey, network) {
  const base =
    String(network || 'mainnet').toLowerCase() === 'testnet'
      ? 'https://testnet.toncenter.com'
      : 'https://toncenter.com'
  const url =
    `${base}/api/v2/getTransactions?address=${encodeURIComponent(address)}` +
    '&limit=100&archival=true'
  const res = await fetch(url, {
    headers: apiKey ? { 'X-API-Key': apiKey } : {},
  })
  const body = await res.json()
  if (!body.ok) {
    throw new Error(`toncenter refused: ${JSON.stringify(body).slice(0, 120)}`)
  }
  return (body.result || [])
    .filter(t => t.in_msg && Number(t.in_msg.value) > 0)
    .map(t => ({
      at: Number(t.utime) * 1000,
      valueNano: Number(t.in_msg.value),
      comment: t.in_msg.message || '',
      hash: t.transaction_id?.hash || '',
    }))
}

async function main() {
  const address = process.env.TON_WALLET_ADDRESS
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!address || !url || !key) {
    console.error(
      'Cannot ask without TON_WALLET_ADDRESS, SUPABASE_URL and SUPABASE_SERVICE_KEY.\n' +
        'They live on the service: run it as\n' +
        '  railway run -s 999-multibots-telegraf node scripts/ton-pending-reconcile.cjs'
    )
    process.exitCode = 2
    return
  }

  const { createClient } = require('@supabase/supabase-js')
  const db = createClient(url, key)

  const { data, error } = await db
    .from('payments_v2')
    .select(
      'inv_id,telegram_id,amount,stars,payment_date,payment_method,metadata'
    )
    .eq('status', 'PENDING')
    .in('payment_method', ['TON_NATIVE', 'TON_USDT'])
    .order('payment_date', { ascending: false })
  if (error) {
    console.error(`could not read the table: ${error.message}`)
    process.exitCode = 2
    return
  }

  const invoices = (data || []).map(r => ({
    inv_id: r.inv_id,
    telegram_id: r.telegram_id,
    amountTon: Number(r.amount),
    stars: r.stars,
    issuedAt: Date.parse(r.payment_date) || null,
    date: String(r.payment_date).slice(0, 10),
    method: r.payment_method,
  }))

  let chain
  try {
    chain = await transactionsOf(
      address,
      process.env.TON_API_KEY,
      process.env.TON_NETWORK
    )
  } catch (e) {
    console.error(`the chain could not be asked: ${e.message}`)
    process.exitCode = 2
    return
  }

  console.log(bold('TON invoices our table still calls PENDING'))
  console.log(
    dim(
      `  ${invoices.length} invoices, ${chain.length} incoming transfers read from the chain.` +
        ' The channel credits on a button press; nothing else ever looks.'
    )
  )
  console.log()

  if (!invoices.length) {
    console.log(green('no pending TON invoices at all.'))
    return
  }

  /*
   * A WINDOW THE CHAIN DOES NOT COVER IS NOT AN ANSWER. toncenter returns the
   * most recent hundred transfers; an invoice older than the oldest of them
   * cannot be judged, and calling that "not paid" is exactly the silent zero
   * this whole family of tools exists to avoid.
   */
  const oldestSeen = chain.length ? Math.min(...chain.map(t => t.at)) : Infinity

  const paid = []
  const unpaid = []
  const unknown = []
  for (const invoice of invoices) {
    const hit = chain.find(tx => matches(invoice, tx))
    if (hit) paid.push({ invoice, hit })
    else if (invoice.issuedAt && invoice.issuedAt < oldestSeen)
      unknown.push(invoice)
    else unpaid.push(invoice)
  }

  for (const [label, rows] of [
    ['arrived and never credited', paid],
    ['never arrived', unpaid],
    ['older than the chain window read -- not an answer', unknown],
  ]) {
    const paint = rows === paid ? red : rows === unknown ? yellow : dim
    console.log(paint(`${String(rows.length).padStart(3)}  ${label}`))
  }

  if (paid.length) {
    console.log()
    console.log(bold('these people sent TON and hold no stars for it:'))
    for (const { invoice, hit } of paid) {
      console.log(
        `  ${invoice.date}  ${invoice.amountTon} TON -> ${invoice.stars} stars` +
          `  inv=${invoice.inv_id}  tx=${hit.hash.slice(0, 12)}`
      )
    }
    console.log()
    console.log(
      dim("This script credits nobody: who is made whole is the owner's call.")
    )
    process.exitCode = 1
  } else {
    console.log()
    console.log(green('nothing arrived that we failed to credit.'))
  }
}

module.exports = { matches, nanoToTon, AMOUNT_TOLERANCE }

if (require.main === module) main()
