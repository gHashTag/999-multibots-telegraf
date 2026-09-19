/**
 * PAY BACK THE PEOPLE WHO PAID AND WERE NEVER CREDITED.
 *
 * Measured 2026-09-19 with `tri reconcile`: twelve Robokassa invoices that the
 * provider's own record calls PAID while our row still says PENDING. Five
 * people, 822 stars. The cause (a ResultURL without its `/api` prefix) was
 * fixed on 2026-09-08; these are the ones the fix arrived too late for.
 *
 * ── WHAT "CREDITING" MEANS HERE, AND WHY IT IS NOT A NEW ROW ───────────────
 *
 * The balance is a filtered sum over COMPLETED rows. So the credit IS the flip
 * of the existing row from PENDING to COMPLETED -- exactly what the ResultURL
 * would have done if it had ever arrived. Writing a NEW row instead would pay
 * the person and leave the old invoice pending for ever: two records of one
 * payment, and a reconcile that finds the same debt again tomorrow.
 *
 * ── HOW IT CANNOT PAY TWICE ────────────────────────────────────────────────
 *
 * `claimPendingInvoice` does the flip as a compare-and-set on `status =
 * PENDING` and reports whether it won. A second run (or a race with the real
 * callback) gets `already-claimed` and credits nothing. There is no separate
 * bookkeeping to keep in step -- the row itself is the lock.
 *
 * ── WHAT IT REFUSES TO DO ──────────────────────────────────────────────────
 *
 * - It asks the PROVIDER about every invoice, every time. Our table is where
 *   the defect lives; acting on it would be acting on the thing being repaired.
 * - It compares the sum the buyer actually paid (`IncSum`) with the sum we
 *   invoiced. An "amount check" that feeds the invoiced amount back to itself
 *   checks nothing.
 * - An invoice the provider does not call PAID is left alone. UNKNOWN is not a
 *   'no', and it is not a 'yes' either: it is a refusal to act.
 * - Without `--commit` it moves nothing. The dry run prints exactly what the
 *   real one would do.
 *
 *   railway run -s 999-multibots-telegraf npx tsx scripts/settle-paid-pending.ts
 *   railway run -s 999-multibots-telegraf npx tsx scripts/settle-paid-pending.ts --commit
 */
import { supabaseAdmin } from '@/core/supabase/client'
import { askOpState } from '@/core/robokassa/opState'
import { claimPendingInvoice } from '@/core/supabase/claimPendingInvoice'

const COMMIT = process.argv.includes('--commit')

type Row = {
  inv_id: string
  telegram_id: string
  amount: number
  stars: number
  payment_date: string
}

async function main(): Promise<void> {
  const creds = {
    login:
      process.env.ROBOKASSA_MERCHANT_LOGIN || process.env.MERCHANT_LOGIN || '',
    password2: process.env.ROBOKASSA_PASSWORD_2 || '',
  }
  if (!creds.login || !creds.password2) {
    console.error(
      'No merchant credentials in this environment. Run it as\n' +
        '  railway run -s 999-multibots-telegraf npx tsx scripts/settle-paid-pending.ts'
    )
    process.exitCode = 2
    return
  }

  const { data, error } = await supabaseAdmin
    .from('payments_v2')
    .select('inv_id,telegram_id,amount,stars,payment_date')
    .eq('status', 'PENDING')
    .eq('payment_method', 'Robokassa')
    .order('payment_date', { ascending: true })

  if (error) {
    console.error(`could not read the table: ${error.message}`)
    process.exitCode = 2
    return
  }

  const rows = (data ?? []) as Row[]
  console.log(
    `${COMMIT ? 'SETTLING' : 'DRY RUN'}: ${rows.length} pending Robokassa invoices\n`
  )

  let paid = 0
  let credited = 0
  let starsCredited = 0
  const untouched: Record<string, number> = {}

  for (const row of rows) {
    const answer = await askOpState(row.inv_id, creds)
    if (answer.verdict !== 'PAID') {
      untouched[answer.verdict] = (untouched[answer.verdict] ?? 0) + 1
      continue
    }
    paid++

    /*
     * The provider says it was paid but does not say how much: without the
     * independent figure there is nothing to compare, and crediting on
     * "trust me" is what this whole family of tools exists to avoid.
     */
    if (answer.incSum === undefined) {
      console.log(
        `  SKIP  inv=${row.inv_id}  paid, but the provider states no IncSum -- nothing to check the amount against`
      )
      untouched['paid-without-sum'] = (untouched['paid-without-sum'] ?? 0) + 1
      continue
    }

    const line =
      `  inv=${row.inv_id.padEnd(12)} person=${String(row.telegram_id).padEnd(12)}` +
      ` invoiced=${row.amount} paid=${answer.incSum} stars=${row.stars}`

    if (!COMMIT) {
      console.log(`  WOULD CREDIT${line}`)
      credited++
      starsCredited += Number(row.stars) || 0
      continue
    }

    const claim = await claimPendingInvoice(row.inv_id, answer.incSum)
    if (claim.ok) {
      credited++
      starsCredited += Number(row.stars) || 0
      console.log(`  CREDITED   ${line}`)
    } else {
      console.log(`  ${claim.outcome.toUpperCase().padEnd(10)}${line}`)
      untouched[claim.outcome] = (untouched[claim.outcome] ?? 0) + 1
    }
  }

  console.log('')
  console.log(`the provider calls PAID: ${paid}`)
  console.log(
    `${COMMIT ? 'credited' : 'would credit'}: ${credited} invoices, ${starsCredited} stars`
  )
  for (const [why, n] of Object.entries(untouched).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  left alone (${why}): ${n}`)
  }
  if (!COMMIT) {
    console.log('\nNothing was moved. Re-run with --commit to settle.')
  }
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exitCode = 1
})
