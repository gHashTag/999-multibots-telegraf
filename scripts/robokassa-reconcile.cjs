#!/usr/bin/env node
/**
 * Who actually paid, among the invoices our table still calls PENDING.
 *
 * checkPaymentStatus.ts says it in as many words: a checker that reads the
 * table holding the defect cannot see the defect. Asked about a stuck payment
 * it answers PENDING, which is what the table already said. This is the
 * independent channel it names -- Robokassa's OpStateExt, the provider's own
 * record of whether money moved.
 *
 * READ-ONLY ON BOTH SIDES. It SELECTs from payments_v2 and it GETs a state
 * query from Robokassa. It credits nobody and writes nothing: which of these
 * people to pay, and how much, is the owner's decision, not this script's.
 *
 * State codes are quoted from https://docs.robokassa.ru/ru/xml-interfaces
 * (fetched 2026-09-08), not from memory:
 *   5   initialised, payment not yet confirmed
 *   10  cancelled, money was never taken from the buyer
 *   20  HOLD (funds held)
 *   50  money received, crediting to the shop in progress
 *   60  crediting refused, money returned to the buyer
 *   80  execution suspended after an incident
 *   100 paid successfully, funds credited
 * (translated from the Russian original at that URL; the page is the
 * authority, this file is not -- a first search returned only blog
 * paraphrases, so the table was taken from the vendor's own page.)
 * Result codes: 0 ok, 1 bad signature, 2 shop not found, 3 operation not
 * found, 4 two operations with one InvoiceID, 1000 internal error.
 *
 * THREE OUTCOMES, NEVER TWO. A network failure, an unparseable body, an
 * unexpected code -- none of those are "did not pay". They are UNKNOWN, and
 * they are printed as their own column, because a silent zero here would
 * quietly tell the owner nobody is owed anything.
 */
const crypto = require('crypto')

const PAID = new Set([50, 100]) // money left the buyer
const UNPAID = new Set([5, 10]) // money never left the buyer
const HUMAN = new Set([20, 60, 80]) // held, refunded, suspended -- a person decides

const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex')
const signature = (login, invId, password2) =>
  md5(`${login}:${invId}:${password2}`)

/** Pull one integer out of <Parent><Code>N</Code>, tolerant of attributes. */
function readCode(xml, parent) {
  const block = new RegExp(
    `<${parent}\\b[^>]*>([\\s\\S]*?)</${parent}>`,
    'i'
  ).exec(xml)
  if (!block) {
    const attr = new RegExp(
      `<${parent}\\b[^>]*\\bCode\\s*=\\s*"(\\d+)"`,
      'i'
    ).exec(xml)
    return attr ? Number(attr[1]) : null
  }
  const code = /<Code\b[^>]*>\s*(\d+)\s*<\/Code>/i.exec(block[1])
  if (code) return Number(code[1])
  const attr = /<Code\s*=\s*"(\d+)"/i.exec(block[1])
  return attr ? Number(attr[1]) : null
}

function classify(xml) {
  if (typeof xml !== 'string' || !xml.trim())
    return { verdict: 'UNKNOWN', why: 'empty body' }
  const result = readCode(xml, 'Result')
  if (result === null)
    return { verdict: 'UNKNOWN', why: 'no Result.Code in body' }
  if (result !== 0)
    return {
      verdict: 'UNKNOWN',
      why: `Result.Code=${result}`,
      resultCode: result,
    }
  const state = readCode(xml, 'State')
  if (state === null)
    return { verdict: 'UNKNOWN', why: 'Result ok but no State.Code' }
  if (PAID.has(state)) return { verdict: 'PAID', state }
  if (UNPAID.has(state)) return { verdict: 'NOT_PAID', state }
  if (HUMAN.has(state)) return { verdict: 'NEEDS_A_HUMAN', state }
  return { verdict: 'UNKNOWN', why: `undocumented State.Code=${state}`, state }
}

/**
 * The probe checks itself before it reports anything, the way every scripts/probe-*
 * does. Two fixtures the parser MUST get right and one it must refuse -- because
 * the failure that costs money here is not a wrong answer, it is a confident
 * "nobody paid" produced by a parser that matched nothing.
 */
function selfCheck() {
  const paid =
    '<?xml version="1.0"?><OperationStateResponse><Result><Code>0</Code></Result><State><Code>100</Code></State></OperationStateResponse>'
  const missing =
    '<OperationStateResponse><Result><Code>3</Code><Description>not found</Description></Result></OperationStateResponse>'
  const cancelled =
    '<OperationStateResponse><Result><Code>0</Code></Result><State><Code>10</Code></State></OperationStateResponse>'
  const problems = []
  if (classify(paid).verdict !== 'PAID')
    problems.push('a settled payment must read PAID')
  if (classify(missing).verdict !== 'UNKNOWN')
    problems.push('Result.Code=3 must read UNKNOWN, never NOT_PAID')
  if (classify(cancelled).verdict !== 'NOT_PAID')
    problems.push('a cancelled operation must read NOT_PAID')
  if (classify('<html>gateway timeout</html>').verdict !== 'UNKNOWN')
    problems.push('a non-XML body must read UNKNOWN')
  if (md5('abc') !== '900150983cd24fb0d6963f7d28e17f72')
    problems.push('md5 is not md5')
  if (signature('demo', 1, 'pw') !== md5('demo:1:pw'))
    problems.push('signature is not login:invId:password2')
  if (problems.length) {
    console.error(
      'SELF-CHECK FAILED, refusing to report:\n  ' + problems.join('\n  ')
    )
    process.exit(2)
  }
}

/**
 * TRIAGE: WHAT THE PENDING ROWS ARE, BEFORE THE PROVIDER IS ASKED.
 *
 * A pending row is an INVOICE, not a theft. It is written when the payment
 * link is generated, so an abandoned checkout leaves exactly the same trace as
 * a payment that vanished. Calling all 164 of them "money owed" would be an
 * accusation the data does not support.
 *
 * What the ledger CAN separate is what the person did next:
 *
 *   paid within three days   an abandoned attempt followed by a working one.
 *                            Nothing is owed.
 *   kept spending after      they had stars from elsewhere, so a payment that
 *                            disappeared would most likely have been noticed
 *                            and complained about.
 *   nothing after at all     the only group where "paid and got nothing" fits
 *                            the evidence -- and still an UPPER BOUND, because
 *                            somebody who simply changed their mind looks the
 *                            same from here.
 *
 * Only OpStateExt settles it. This runs WITHOUT the merchant password so the
 * size of that question is known before anyone goes looking for it.
 */
function triage(rows) {
  const DAY = 864e5
  const byUser = new Map()
  for (const r of rows) {
    if (!byUser.has(r.telegram_id)) byUser.set(r.telegram_id, [])
    byUser.get(r.telegram_id).push(r)
  }
  for (const [, v] of byUser)
    v.sort((a, b) =>
      String(a.payment_date).localeCompare(String(b.payment_date))
    )
  const out = { retried: [], keptSpending: [], silent: [] }
  const pending = rows.filter(
    r =>
      /robokassa/i.test(r.payment_method || '') &&
      String(r.status).toUpperCase() === 'PENDING'
  )
  for (const p of pending) {
    const after = (byUser.get(p.telegram_id) || []).filter(
      r => r.payment_date > p.payment_date
    )
    const creditedSoon = after.find(
      r =>
        r.type === 'MONEY_INCOME' &&
        String(r.status).toUpperCase() === 'COMPLETED' &&
        new Date(r.payment_date) - new Date(p.payment_date) < 3 * DAY
    )
    if (creditedSoon) out.retried.push(p)
    else if (after.find(r => r.type === 'MONEY_OUTCOME'))
      out.keptSpending.push(p)
    else out.silent.push(p)
  }
  return out
}

async function main() {
  selfCheck()
  const login =
    process.env.ROBOKASSA_MERCHANT_LOGIN || process.env.MERCHANT_LOGIN
  const pw2 = process.env.ROBOKASSA_PASSWORD_2
  const url = process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (process.argv.includes('--triage')) {
    if (!url || !key) {
      console.error(
        'Triage needs SUPABASE_URL and SUPABASE_SERVICE_KEY (it reads only).'
      )
      process.exit(2)
    }
    const H = { apikey: key, Authorization: `Bearer ${key}` }
    const rows = []
    let last = null
    for (;;) {
      const f = last === null ? '' : `&id=gt.${last}`
      const r = await fetch(
        `${url}/rest/v1/payments_v2?select=id,telegram_id,payment_date,type,status,stars,amount,inv_id,payment_method${f}&order=id.asc&limit=1000`,
        { headers: H }
      )
      const page = await r.json()
      if (!Array.isArray(page) || page.length === 0) break
      rows.push(...page)
      last = page[page.length - 1].id
      if (page.length < 1000) break
    }
    const ids = new Set(rows.map(r => r.id))
    if (ids.size !== rows.length) {
      console.error('unstable paging, refusing')
      process.exit(2)
    }
    const t = triage(rows)
    const money = a =>
      Math.round(a.reduce((s, r) => s + (Number(r.amount) || 0), 0))
    const people = a => new Set(a.map(r => r.telegram_id)).size
    const total = t.retried.length + t.keptSpending.length + t.silent.length
    console.log(
      `pending Robokassa rows: ${total}, held by ${people([...t.retried, ...t.keptSpending, ...t.silent])} people\n`
    )
    console.log(
      `  ${String(t.retried.length).padStart(4)} rows  ${String(people(t.retried)).padStart(3)} people  ${String(money(t.retried)).padStart(7)}   paid within 3 days - nothing owed`
    )
    console.log(
      `  ${String(t.keptSpending.length).padStart(4)} rows  ${String(people(t.keptSpending)).padStart(3)} people  ${String(money(t.keptSpending)).padStart(7)}   no credit, but kept spending`
    )
    console.log(
      `  ${String(t.silent.length).padStart(4)} rows  ${String(people(t.silent)).padStart(3)} people  ${String(money(t.silent)).padStart(7)}   no credit, nothing after - the upper bound`
    )
    console.log(
      `\nOnly OpStateExt settles which of those ${t.silent.length} actually paid.`
    )
    console.log(
      'Run without --triage, with ROBOKASSA_PASSWORD_2, to ask the provider.'
    )
    return
  }

  const missing = []
  if (!login) missing.push('ROBOKASSA_MERCHANT_LOGIN (or MERCHANT_LOGIN)')
  if (!pw2) missing.push('ROBOKASSA_PASSWORD_2')
  if (!url || !key) missing.push('SUPABASE_URL and SUPABASE_SERVICE_KEY')
  if (missing.length) {
    console.error(
      'Cannot reconcile without:\n  ' +
        missing.join('\n  ') +
        '\n\nThese are the only things missing. Nothing else about this is blocked.' +
        '\nRun again with them in the environment; the script writes nothing either side.'
    )
    process.exit(2)
  }

  const H = { apikey: key, Authorization: `Bearer ${key}` }
  const rows = await (
    await fetch(
      `${url}/rest/v1/payments_v2?select=inv_id,telegram_id,payment_date,amount,stars,status` +
        `&payment_method=eq.Robokassa&order=payment_date.asc&limit=2000`,
      { headers: H }
    )
  ).json()
  if (!Array.isArray(rows)) {
    console.error('payments_v2 read failed')
    process.exit(2)
  }

  const pending = rows.filter(r => String(r.status).toUpperCase() === 'PENDING')
  const completed = rows.filter(
    r => String(r.status).toUpperCase() === 'COMPLETED'
  )
  // Negative control: rows we KNOW settled must come back PAID. If they do not,
  // the credentials or the parser are wrong and every PENDING verdict below is
  // worthless -- so this runs first and its failure is fatal.
  const control = completed.slice(-5)
  console.log(`control: ${control.length} rows we already call COMPLETED`)
  let controlOk = 0
  for (const r of control) {
    const v = await ask(login, pw2, r.inv_id)
    if (v.verdict === 'PAID') controlOk++
    else
      console.log(
        `  control MISS inv_id=${r.inv_id}: ${v.verdict} ${v.why || 'state ' + v.state}`
      )
  }
  if (control.length && controlOk === 0) {
    console.error(
      `\nEvery control row came back not-PAID. That is a broken instrument,` +
        ` not a finding about the ${pending.length} pending rows. Stopping.`
    )
    process.exit(2)
  }
  console.log(`control passed: ${controlOk}/${control.length}\n`)

  const tally = { PAID: [], NOT_PAID: [], NEEDS_A_HUMAN: [], UNKNOWN: [] }
  for (const r of pending) {
    const v = await ask(login, pw2, r.inv_id)
    tally[v.verdict].push({ ...r, ...v })
  }
  console.log(`pending Robokassa rows examined: ${pending.length}`)
  for (const k of ['PAID', 'NEEDS_A_HUMAN', 'UNKNOWN', 'NOT_PAID']) {
    console.log(`  ${k.padEnd(14)} ${String(tally[k].length).padStart(4)}`)
  }
  if (tally.PAID.length) {
    const people = new Set(tally.PAID.map(r => r.telegram_id))
    const stars = tally.PAID.reduce((s, r) => s + (Number(r.stars) || 0), 0)
    const money = tally.PAID.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    console.log(
      `\nPAID AT THE PROVIDER, PENDING IN OUR TABLE -- ${people.size} people, ${stars} stars, ${money} in money:`
    )
    for (const r of tally.PAID) {
      console.log(
        `  ${r.payment_date.slice(0, 10)}  inv=${String(r.inv_id).padEnd(12)} tg=${String(r.telegram_id).padEnd(12)} ${String(r.amount).padStart(9)}  ${r.stars}⭐  state=${r.state}`
      )
    }
    console.log(
      '\nThis script does not credit anybody. Who is made whole, and with what,' +
        "\nis the owner's call; this is the list to make it from."
    )
  }
  if (tally.UNKNOWN.length) {
    console.log(
      `\nUNKNOWN (not an answer, and never to be read as "did not pay"):`
    )
    for (const r of tally.UNKNOWN.slice(0, 20))
      console.log(`  inv=${r.inv_id}  ${r.why}`)
  }
}

async function ask(login, pw2, invId) {
  const u =
    `https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt` +
    `?MerchantLogin=${encodeURIComponent(login)}&InvoiceID=${encodeURIComponent(invId)}` +
    `&Signature=${signature(login, invId, pw2)}`
  try {
    const r = await fetch(u, { headers: { Accept: 'application/xml' } })
    return classify(await r.text())
  } catch (e) {
    return { verdict: 'UNKNOWN', why: `request failed: ${e.message}` }
  }
}

module.exports = { classify, readCode, signature, triage, PAID, UNPAID, HUMAN }
if (require.main === module)
  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
