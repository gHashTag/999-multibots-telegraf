#!/usr/bin/env node
'use strict'
/**
 * A PAYMENT METHOD THAT CAN BE OFFERED MUST BE A PAYMENT METHOD THAT CAN CREDIT.
 *
 *   node scripts/payment-method-census.cjs         list every method, both sides
 *   ... --gate                                     exit 1 on an undeclared one
 *
 * x402 was offered to people for nine months while its receiving end was
 * switched off ON PURPOSE: the credit handlers refuse with 501 because nothing
 * verifies settlement, and the router is not even mounted. Twelve people paid.
 * Nothing joined those two facts, because they lived in different files and
 * different test suites -- one census knew the endpoint was dead, another knew
 * people were paying.
 *
 * This is that join, made mechanical. For every value of the PaymentMethod
 * enum it reads two things out of the source:
 *
 *   CREATES   a site writing `payment_method: <method>` on a payment row
 *   CREDITS   a file that both names the method and sets a payment COMPLETED
 *
 * A method that CREATES and does not CREDIT is a way to take money with no way
 * to deliver it. That is the shape, and it is what the gate reds on.
 *
 * KNOWN BLIND SPOT, found by a mutation that SURVIVED. Crediting is matched per
 * FILE, so a method whose name merely appears in a file that completes some
 * OTHER payment reads as creditable. A fake method planted inside
 * tonPaymentScene was not flagged for exactly that reason; planted at a real
 * PENDING creation site in a file that completes nothing, it is flagged at
 * once. The heuristic sees the shape it was built for and is honest about the
 * shape it does not: a mention is not a credit path, and this cannot tell them
 * apart inside one file.
 *
 * THE ATTRIBUTION IS A HEURISTIC AND IS CALIBRATED, NOT ASSUMED. Crediting is
 * matched per FILE, not per line: robokassa.routes.ts both names 'Robokassa'
 * and sets COMPLETED, and that is the real relationship. Two controls keep the
 * heuristic honest and the script refuses if either breaks -- Robokassa must
 * come out creditable (75 payments really completed through it) and CryptoBot
 * must not (nothing anywhere receives a CryptoBot callback). A rule that
 * cannot tell those two apart is not measuring anything.
 */
const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()

const enumSrc = fs.readFileSync(
  path.join(ROOT, 'src/interfaces/payments.interface.ts'),
  'utf8'
)
const block = /export enum PaymentMethod \{([\s\S]*?)\}/.exec(enumSrc)
if (!block) {
  console.error('SELF-CHECK FAILED: the PaymentMethod enum could not be read.')
  process.exit(2)
}
const methods = []
for (const m of block[1].matchAll(/(\w+)\s*=\s*'([^']+)'/g))
  methods.push({ key: m[1], value: m[2] })

/*
 * AN UNMOUNTED ROUTER CANNOT CREDIT ANYTHING, and that fact does not live in
 * the router's own file -- it lives in api_server/index.ts. Without this,
 * x402.routes.ts reads as x402's credit path: it names the method and it sets
 * COMPLETED. It is also not mounted, so no request has ever reached either
 * line. A census that cannot see reachability calls a dead rail alive.
 */
const entry = fs.readFileSync(
  path.join(ROOT, 'src/api_server/index.ts'),
  'utf8'
)
const routeImports = {}
for (const m of entry.matchAll(
  /import\s+(\w+)\s*(?:,\s*\{[\s\S]*?\})?\s*from\s+'(\.[^']+)'/g
))
  routeImports[m[1]] = m[2]
const mountedRouteFiles = new Set()
for (const m of entry.matchAll(/\.use\(\s*'[^']+'\s*,([^)]*)\)/g))
  for (const id of m[1].match(/\w+/g) || []) {
    const rel = routeImports[id]
    if (rel && rel.includes('routes/'))
      mountedRouteFiles.add(path.basename(rel) + '.ts')
  }
const reachable = rel =>
  !rel.startsWith('src/api_server/routes/') ||
  mountedRouteFiles.has(path.basename(rel))

const files = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name)
    if (e.isDirectory()) {
      if (!/node_modules|__tests__|\.git/.test(f)) walk(f)
    } else if (f.endsWith('.ts')) files.push(f)
  }
})(path.join(ROOT, 'src'))

/* Fixtures and demo data describe payments that never existed. */
const isFixture = f => /models\/zot|\/examples?\.|fixtures?/.test(f)

const COMPLETES =
  /status: *(?:PaymentStatus\.COMPLETED|'COMPLETED')|updatePaymentStatus\([^)]*COMPLETED/

const WINDOW = Number(process.env.PENDING_WINDOW || 25)

function census(PENDING_WINDOW) {
  const report = []
  for (const { key, value } of methods) {
    const creates = []
    const credits = []
    for (const file of files) {
      if (isFixture(file)) continue
      const src = fs.readFileSync(file, 'utf8')
      const rel = path.relative(ROOT, file)
      const namesIt =
        src.includes(`PaymentMethod.${key}`) ||
        new RegExp(`payment_method: *'${value}'`).test(src)
      if (!namesIt) continue

      const createRe = new RegExp(
        `payment_method: *(?:PaymentMethod\\.${key}|'${value}')`,
        'g'
      )
      /*
       * ONLY A ROW THAT STARTS OUT PENDING IS IN THE POPULATION. A site naming
       * the method on an ALREADY-COMPLETED row is a record of something that
       * worked, not an invoice waiting for a receiver -- the refund in
       * modelTrainingV2 credits through updateUserBalance and is complete the
       * moment it is written. Counting it produced a finding about a method with
       * 405 completed rows and no pending ones, which is the opposite of the
       * defect being looked for.
       *
       * The window is checked, not chosen: PENDING_WINDOW is swept below and the
       * classification must not move between 10 and 50 lines, or the constant is
       * deciding instead of the code.
       */
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        if (!createRe.test(line)) {
          createRe.lastIndex = 0
          return
        }
        createRe.lastIndex = 0
        const near = lines
          .slice(Math.max(0, i - PENDING_WINDOW), i + PENDING_WINDOW)
          .join('\n')
        if (/PaymentStatus\.PENDING|status: *'PENDING'/.test(near))
          creates.push(`${rel}:${i + 1}`)
      })
      if (COMPLETES.test(src) && reachable(rel)) credits.push(rel)
    }
    report.push({ key, value, creates, credits })
  }
  return report
}

const report = census(WINDOW)

/*
 * THE CONSTANT MUST NOT BE THE ONE DECIDING. Doubling the window changes how
 * many creation sites are found -- that is expected -- but it must not change
 * WHICH methods take money without a way to deliver it. If it does, the
 * verdict is an artefact of a number nobody chose on purpose.
 */
const marks = r =>
  r
    .filter(x => x.creates.length > 0 && x.credits.length === 0)
    .map(x => x.key)
    .sort()
    .join(',')
if (marks(report) !== marks(census(WINDOW * 2))) {
  console.error('SELF-CHECK FAILED: the verdict moves with the window size.')
  console.error(`  at ${WINDOW}: ${marks(report) || '(none)'}`)
  console.error(`  at ${WINDOW * 2}: ${marks(census(WINDOW * 2)) || '(none)'}`)
  console.error(
    'A finding that depends on a constant is a property of the constant.'
  )
  process.exit(2)
}

/*
 * Declared and reasoned. An entry is a method that CREATES without CREDITS and
 * is not a live defect -- with why, so the next reader is not tempted to "wire
 * it up". Adding a line is a decision, and that is the point.
 */
const DECLARED = {
  X402:
    'the credit handlers refuse with 501 on purpose (no settlement verification, ' +
    'so crediting would let anyone mint balance) and the router is not mounted. ' +
    'Offering is blocked by canX402Credit at the door AND at the row-writing ' +
    'handler; X402_SETTLEMENT_IMPLEMENTED is the one switch.',
}

const fail = m => {
  console.error('SELF-CHECK FAILED: ' + m)
  process.exit(2)
}
if (mountedRouteFiles.size < 5)
  fail(
    `only ${mountedRouteFiles.size} route files resolved as mounted; reachability ` +
      'would then reject real credit paths and invent findings.'
  )
if (methods.length < 8)
  fail(`only ${methods.length} payment methods parsed; the enum has more.`)

const byKey = Object.fromEntries(report.map(r => [r.key, r]))
if (!byKey.ROBOKASSA || byKey.ROBOKASSA.credits.length === 0)
  fail(
    'Robokassa reads as having no credit path, and 75 payments really completed ' +
      'through it. The attribution is broken, not the product.'
  )
if (!byKey.CRYPTOBOT || byKey.CRYPTOBOT.credits.length > 0)
  fail(
    'CryptoBot reads as creditable, and nothing anywhere receives a CryptoBot ' +
      'callback. The attribution is too loose to tell a live rail from a dead one.'
  )

if (!byKey.X402 || byKey.X402.credits.length > 0)
  fail(
    'x402 reads as creditable. Its only credit site is x402.routes.ts, which is ' +
      'not mounted -- so reachability is not being applied, and the census ' +
      'cannot tell a dead rail from a live one.'
  )
if (!byKey.CRYPTOBOT || byKey.CRYPTOBOT.creates.length > 0)
  fail(
    'CryptoBot reads as creating a payment row. It does not: handleTopUpWithAmount ' +
      'makes an invoice and shows a Pay button without recording anything at all.'
  )

const offeredWithoutCredit = report.filter(
  r => r.creates.length > 0 && r.credits.length === 0
)
const undeclared = offeredWithoutCredit.filter(r => !(r.key in DECLARED))
const stale = Object.keys(DECLARED).filter(
  k => !offeredWithoutCredit.some(r => r.key === k)
)
if (stale.length)
  fail(
    'these declarations no longer describe anything -- the method now credits, ' +
      'or no longer creates:\n  ' +
      stale.join('\n  ')
  )

console.log(`payment methods in the enum: ${methods.length}`)
console.log('')
for (const r of report) {
  const mark = r.creates.length === 0 ? '  ' : r.credits.length ? 'ok' : '!!'
  console.log(
    `${mark} ${r.value.padEnd(12)} creates: ${String(r.creates.length).padStart(2)}   credits: ${
      r.credits.length ? r.credits.join(', ') : '(nothing)'
    }`
  )
}
console.log('')
console.log(
  `takes money with no way to deliver it: ${offeredWithoutCredit.length}` +
    `  (declared ${offeredWithoutCredit.length - undeclared.length}, not ${undeclared.length})`
)
if (undeclared.length) {
  console.log('')
  console.log('NOT DECLARED -- a way to take money that cannot credit it:')
  for (const r of undeclared) {
    console.log(`  ${r.value}`)
    for (const c of r.creates) console.log(`      creates at ${c}`)
  }
  console.log('')
  console.log('Build the receiver, or stop offering it. Wiring up the invoice')
  console.log('alone is how x402 collected twelve payments and credited none.')
}
/*
 * exitCode, not exit(): process.exit throws away writes still queued on a pipe,
 * and this script prints a list that a person reads through one. Node's own
 * documentation calls the result "truncated and lost". Measured on the Cyrillic
 * gate, 2026-09-17: 966, 7706 and 8484 of the same 8484 lines on three runs.
 * Safe here because this is the last statement at the top level.
 */
process.exitCode = process.argv.includes('--gate') && undeclared.length ? 1 : 0
