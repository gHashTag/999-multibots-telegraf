/**
 * PUT THE TWELVE SETTLED INVOICES BACK ON THEIR REAL DATES.
 *
 * `claimPendingInvoice` flips a row to COMPLETED and sets `payment_date` to
 * NOW. For the callback it was written for that is right -- the flip happens
 * seconds after the payment. For the back-settlement of 2026-09-19 it was
 * wrong: twelve payments made between April 2025 and May 2026 now claim to
 * have happened that evening, and every report by month attributes 1854 roubles
 * to the wrong period.
 *
 * The true moment is not a guess and not my memory of a listing: the provider
 * states it. `OpStateExt` answers with `<State><StateDate>`, the moment the
 * operation reached its current state, to the second and with a timezone. That
 * is the figure this restores.
 *
 * ── WHY NOT JUST THE DAY FROM THE OLD REPORT ───────────────────────────────
 *
 * I have the dates to the day in an earlier run's output. Day precision would
 * put the rows in the right month and quietly invent a time -- and a row that
 * says 00:00:00 is indistinguishable from a row whose time was never known.
 * The provider's answer costs one request and is exact.
 *
 * ── SAFETY ─────────────────────────────────────────────────────────────────
 *
 * Dry run by default. It only touches rows whose inv_id is in the list below
 * and whose status is COMPLETED; it never changes status, amount or anybody's
 * balance -- moving a date does not move money, because the balance is a sum
 * over COMPLETED rows and does not read the date at all.
 *
 *   railway run -s 999-multibots-telegraf npx tsx scripts/restore-settled-dates.ts
 *   railway run -s 999-multibots-telegraf npx tsx scripts/restore-settled-dates.ts --commit
 */
import { supabaseAdmin } from '@/core/supabase/client'
import { opStateSignature } from '@/core/robokassa/opState'

const COMMIT = process.argv.includes('--commit')

/** The twelve settled on 2026-09-19, and nothing else. */
const SETTLED = [
  '839653',
  '458799',
  '85358',
  '574744',
  '110007',
  '942371',
  '120831',
  '124134',
  '110936',
  '210442081',
  '479591493',
  '1865242617',
]

/** The provider's own moment for this operation, or null if it does not say. */
async function stateDateOf(
  invId: string,
  creds: { login: string; password2: string }
): Promise<string | null> {
  const url =
    'https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt' +
    `?MerchantLogin=${encodeURIComponent(creds.login)}` +
    `&InvoiceID=${encodeURIComponent(invId)}` +
    `&Signature=${opStateSignature(creds.login, invId, creds.password2)}`
  const res = await fetch(url)
  const xml = await res.text()
  const m = /<StateDate\b[^>]*>\s*([^<]+?)\s*<\/StateDate>/i.exec(xml)
  if (!m) return null
  const when = new Date(m[1])
  return Number.isFinite(when.getTime()) ? when.toISOString() : null
}

async function main(): Promise<void> {
  const creds = {
    login:
      process.env.ROBOKASSA_MERCHANT_LOGIN || process.env.MERCHANT_LOGIN || '',
    password2: process.env.ROBOKASSA_PASSWORD_2 || '',
  }
  if (!creds.login || !creds.password2) {
    console.error('No merchant credentials in this environment.')
    process.exitCode = 2
    return
  }

  const { data, error } = await supabaseAdmin
    .from('payments_v2')
    .select('inv_id,status,payment_date,amount,stars')
    .in('inv_id', SETTLED)
  if (error) {
    console.error(`could not read the table: ${error.message}`)
    process.exitCode = 2
    return
  }

  console.log(COMMIT ? 'RESTORING\n' : 'DRY RUN -- nothing is written\n')
  let changed = 0
  let refused = 0

  for (const row of data ?? []) {
    const inv = String(row.inv_id)
    if (row.status !== 'COMPLETED') {
      console.log(`  SKIP  ${inv}: status is ${row.status}, not COMPLETED`)
      refused++
      continue
    }
    const real = await stateDateOf(inv, creds)
    if (!real) {
      /*
       * No date from the provider is not a reason to invent one. The row keeps
       * the wrong date and is reported, which is worse than right and better
       * than a fabricated timestamp nobody can tell from a real one.
       */
      console.log(`  NO DATE  ${inv}: the provider states no StateDate`)
      refused++
      continue
    }
    const now = String(row.payment_date)
    if (now.slice(0, 10) === real.slice(0, 10)) {
      console.log(`  ALREADY  ${inv}: ${now.slice(0, 19)}`)
      continue
    }
    console.log(
      `  ${COMMIT ? 'RESTORED' : 'WOULD SET'}  ${inv}: ${now.slice(0, 19)} -> ${real.slice(0, 19)}`
    )
    changed++
    if (!COMMIT) continue

    const { error: writeError } = await supabaseAdmin
      .from('payments_v2')
      .update({ payment_date: real })
      .eq('inv_id', inv)
      .eq('status', 'COMPLETED')
    if (writeError) {
      console.log(`    FAILED: ${writeError.message}`)
      refused++
      changed--
    }
  }

  console.log('')
  console.log(`${COMMIT ? 'restored' : 'would restore'}: ${changed}`)
  if (refused) console.log(`left alone: ${refused}`)
  if (!COMMIT) console.log('\nNothing was written. Re-run with --commit.')
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exitCode = 1
})
