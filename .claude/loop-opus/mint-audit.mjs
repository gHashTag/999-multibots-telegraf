#!/usr/bin/env node
/**
 * tri mint -- INVENTORY (not a gate) of every credit call (balance mutation with
 * PaymentType.MONEY_INCOME) and the protection signal its enclosing function
 * carries against minting stars for free.
 *
 * A credit is safe when it is one of: a REFUND of a prior charge; gated by a
 * webhook SIGNATURE; serialized by an atomic status CAS; ADMIN-gated; keyed by a
 * deterministic IDEMPOTENCY inv_id; or tied to a confirmed SETTLEMENT. A credit
 * whose amount/recipient comes from an unauthenticated request with NONE of
 * these is a mint. This lists each site + its signals so the next unprotected
 * credit is READ, not stumbled on (the TON CAS #1555 was found exactly this way,
 * via a tri inflight flag).
 *
 * Always exits 0 -- a triage aid, not a ratchet. A "review" flag is a HEURISTIC:
 * the guard may live just outside the analyzed function (a signed router mount,
 * a caller-side allowlist). Read each. Reports, never mutates.
 */
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const SRC = path.join(ROOT, 'src')

const CREDIT_FNS = [
  'updateUserBalance',
  'processBalanceOperation',
  'directPaymentProcessor',
  'directPayment',
]

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) acc.push(p)
  }
  return acc
}

// Signals scanned in the ENCLOSING function text (and, for file-scoped ones like
// a signed router or an admin import, the whole file).
const SIG = {
  REFUND: /\b(refund|refundUser|refundAndTell|chargedCostOverride|compensat)/i,
  SIGNED:
    /\b(verifyCallbackToken|checkSignature|verifySignature|validateSignature|signatureValue|SignatureValue|crc|hmac|verifyWebhook|verifyRobokassa)/i,
  CAS: /\.eq\(\s*['"]status['"]\s*,\s*[^)]*PENDING/,
  ADMIN: /\b(requireAdmin|isAdmin|ADMIN_IDS|isOwner|ownerOnly|SUPER_ADMIN)/,
  IDEMPOTENT: /\binv_id\s*:/,
  SETTLEMENT:
    /\b(settlement|isPaid|payment_confirmed|paymentConfirmed|status\s*===?\s*['"](success|paid|completed|COMPLETED|SUCCESS)['"]|OutSum|invoicePaid)/,
  PROMO: /\b(promo|referral|reward|bonus|invite|marketplace)/i,
}

function enclosingFn(node, sf) {
  let p = node.parent
  while (p) {
    if (
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) ||
      ts.isMethodDeclaration(p)
    )
      return p
    p = p.parent
  }
  return sf
}

const rows = []
for (const file of walk(SRC, [])) {
  const src = fs.readFileSync(file, 'utf8')
  let sf
  try {
    sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true)
  } catch {
    continue
  }
  const rel = path.relative(ROOT, file)
  const visit = n => {
    if (
      ts.isCallExpression(n) &&
      ((ts.isIdentifier(n.expression) &&
        CREDIT_FNS.includes(n.expression.text)) ||
        (ts.isPropertyAccessExpression(n.expression) &&
          CREDIT_FNS.includes(n.expression.name.text)))
    ) {
      const callText = n.getText(sf)
      // Only real credits: MONEY_INCOME as the direction in this call.
      if (!/MONEY_INCOME/.test(callText)) {
        n.forEachChild(visit)
        return
      }
      const fn = enclosingFn(n, sf)
      const fnText = fn.getText(sf)
      const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
      const signals = Object.entries(SIG)
        .filter(([, re]) => re.test(fnText))
        .map(([k]) => k)
      // TRANSFER: a MONEY_OUTCOME charge in the same fn funds this credit (a
      // buyer-pays-author sale / payout), so the credit is not minted.
      if (/MONEY_OUTCOME/.test(fnText)) signals.push('TRANSFER')
      // SIGNED/ADMIN can be established file-wide (imported guard, mounted router)
      for (const k of ['SIGNED', 'ADMIN'])
        if (!signals.includes(k) && SIG[k].test(src)) signals.push(k + '?')
      rows.push({ rel, line, signals })
    }
    n.forEachChild(visit)
  }
  visit(sf)
}

// A credit is "protected" if it carries any real guard signal.
const PROTECTED = [
  'REFUND',
  'TRANSFER',
  'SIGNED',
  'CAS',
  'ADMIN',
  'IDEMPOTENT',
  'SETTLEMENT',
]
const isProtected = s => s.some(x => PROTECTED.includes(x.replace('?', '')))

rows.sort(
  (a, b) =>
    Number(isProtected(a.signals)) - Number(isProtected(b.signals)) ||
    a.rel.localeCompare(b.rel)
)

console.log('')
console.log(
  `tri mint -- ${rows.length} credit sites (balance mutation with MONEY_INCOME)`
)
console.log('  protection signal per enclosing fn. INVENTORY, not a gate.')
console.log('')
let review = 0
for (const r of rows) {
  const prot = isProtected(r.signals)
  const tag = prot ? 'ok    ' : 'REVIEW'
  if (!prot) review++
  console.log(`  [${tag}] ${r.rel}:${r.line}`)
  console.log(`           {${r.signals.join(', ') || 'NONE'}}`)
}
console.log('')
console.log(
  `  summary: ${rows.length} credit sites; ${review} with no in-fn guard signal (READ each).`
)
console.log(
  '  "?" = signal found file-wide (imported guard / mounted signed router), not in the fn.'
)
console.log(
  '  REVIEW is a heuristic -- the guard may live in the caller/router. Confirm by reading.'
)
console.log('')
process.exit(0)
