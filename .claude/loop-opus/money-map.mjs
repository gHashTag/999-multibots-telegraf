#!/usr/bin/env node
/**
 * tri money-map -- accurate, repo-wide census of money-mutation CALL SITES.
 *
 * Why this exists: a plain `grep MONEY_OUTCOME src` over-counts badly -- it
 * matches enum/type definitions, example fixtures, and query-filter strings
 * (e.g. src/models/zot classifier + examples, billingCommand report filters).
 * This walks the TypeScript AST and reports only real CALL sites of the money
 * primitives, classified by direction, context, and the guard mechanism that
 * applies to that context. It makes the manual sweep every loop iteration does
 * (find charge/refund/credit sites, ask "is each guarded?") instant and exact.
 *
 * Complements the existing instruments:
 *   - charge-audit.mjs        scene charges vs paid-wizard-guard-ratchet
 *   - guards.mjs (tri guards) the enforceable invariant ratchets
 * money-map is the cross-context OVERVIEW: it also covers services, commands,
 * api_server routes, and inngest functions, which the scene-only charge-audit
 * does not enumerate.
 *
 * Usage:
 *   node .claude/loop-opus/money-map.mjs            grouped human report
 *   node .claude/loop-opus/money-map.mjs --json     machine-readable JSON
 *
 * Read-only. No enforcement -- the enforcing checks live in tri guards and the
 * paid-wizard-guard ratchet. loop-fable iter193.
 */
import fs from 'fs'
import path from 'path'
import ts from 'typescript'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')

// Money primitives we care about, and how to read their direction.
const CHARGE_FNS = new Set([
  'directPaymentProcessor',
  'processBalanceOperation',
])
const BALANCE_FN = 'updateUserBalance'
const REFUND_FNS = new Set(['refundUser', 'refundAndTell'])

function listTsFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return listTsFiles(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })
}

// Map a repo-relative path to a coarse context bucket.
function contextOf(rel) {
  if (rel.startsWith('src/api_server/routes/')) return 'api-route'
  if (rel.startsWith('src/api_server/')) return 'api-server'
  if (rel.startsWith('src/inngest_app/functions/')) return 'inngest-function'
  if (rel.startsWith('src/inngest_app/')) return 'inngest-service'
  if (rel.startsWith('src/scenes/')) return 'scene'
  if (rel.startsWith('src/commands/')) return 'command'
  if (rel.startsWith('src/handlers/')) return 'handler'
  if (rel.startsWith('src/services/')) return 'service'
  if (rel.startsWith('src/core/')) return 'core'
  if (rel.startsWith('src/models/')) return 'model'
  return 'other'
}

function calleeName(node) {
  const e = node.expression
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e)) return e.name.text
  return ''
}

// direction: 'charge' | 'refund' | 'credit' | 'charge-or-refund'
function classify(name, node, sf) {
  if (REFUND_FNS.has(name)) return 'refund'
  // processBalanceOperation has NO direction parameter: BalanceOperationProps
  // is { ctx, telegram_id, paymentAmount, is_ru, bot_name, is_welcome_gift },
  // and the single money call inside it is MONEY_OUTCOME. It can only charge,
  // so reading its ARGUMENTS for a direction word finds nothing and lands every
  // call in 'charge-or-refund'. That was 21 calls in 19 files -- about half the
  // charge surface, filed as unknown, and therefore outside the population the
  // charge census (#1863) claimed to pin.
  if (name === 'processBalanceOperation') return 'charge'
  if (CHARGE_FNS.has(name)) {
    const args = node.arguments.map(a => a.getText(sf)).join(' ')
    if (/REFUND|MONEY_INCOME/.test(args)) return 'refund'
    if (/MONEY_OUTCOME/.test(args)) return 'charge'
    return 'charge-or-refund'
  }
  if (name === BALANCE_FN) {
    const args = node.arguments.map(a => a.getText(sf)).join(' ')
    if (/MONEY_INCOME/.test(args)) return 'credit'
    if (/MONEY_OUTCOME/.test(args)) return 'charge'
    // PaymentType.REFUND is a credit written in the OTHER spelling, and this
    // branch used to miss it while the CHARGE_FNS branch six lines above tests
    // /REFUND|MONEY_INCOME/. One function, two rules for one word: three real
    // refunds (aiCoverWizard, voiceTrainingRVC x2) were filed as 'balance-op',
    // so a file whose only refund is REFUND-typed read as "charges and never
    // gives anything back".
    if (/REFUND/.test(args)) return 'refund'
    // What is left really is undecidable HERE: the type arrives through a
    // variable (refundAndTell does `const type = params.type ?? ...`), so the
    // answer is not in the call. Left as balance-op rather than guessed.
    return 'balance-op'
  }
  return null
}

function ancestor(node, pred) {
  let c = node.parent
  while (c) {
    if (pred(c)) return true
    c = c.parent
  }
  return false
}

function inLoop(node) {
  return ancestor(
    node,
    c =>
      ts.isForStatement(c) ||
      ts.isForOfStatement(c) ||
      ts.isForInStatement(c) ||
      ts.isWhileStatement(c) ||
      ts.isDoStatement(c) ||
      (ts.isCallExpression(c) &&
        ts.isPropertyAccessExpression(c.expression) &&
        ['map', 'forEach', 'filter', 'reduce'].includes(c.expression.name.text))
  )
}

function inStepRun(node) {
  return ancestor(
    node,
    c =>
      ts.isCallExpression(c) &&
      ts.isPropertyAccessExpression(c.expression) &&
      c.expression.name.text === 'run' &&
      ts.isIdentifier(c.expression.expression) &&
      c.expression.expression.text === 'step'
  )
}

const sites = []
for (const abs of listTsFiles(SRC)) {
  const rel = path.relative(ROOT, abs)
  const text = fs.readFileSync(abs, 'utf8')
  if (
    !/updateUserBalance|directPaymentProcessor|processBalanceOperation|refundUser|refundAndTell/.test(
      text
    )
  )
    continue
  const sf = ts.createSourceFile(
    rel,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const visit = node => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node)
      if (name === BALANCE_FN || CHARGE_FNS.has(name) || REFUND_FNS.has(name)) {
        const direction = classify(name, node, sf)
        if (direction) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
          sites.push({
            file: rel,
            line: line + 1,
            fn: name,
            direction,
            context: contextOf(rel),
            inLoop: inLoop(node),
            inStepRun: inStepRun(node),
          })
        }
      }
    }
    node.forEachChild(visit)
  }
  visit(sf)
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(sites, null, 2))
  process.exit(0)
}

// Human report.
const byDir = {}
for (const s of sites) (byDir[s.direction] ||= []).push(s)
const dirOrder = [
  'charge',
  'refund',
  'credit',
  'charge-or-refund',
  'balance-op',
]

console.log('')
console.log('MONEY-MAP -- real money-mutation call sites (AST, not grep)')
console.log(
  `  primitives: ${BALANCE_FN}, ${[...CHARGE_FNS].join('/')}, ${[...REFUND_FNS].join('/')}`
)
console.log(`  total call sites: ${sites.length}`)
console.log('')

for (const dir of dirOrder) {
  const rows = byDir[dir]
  if (!rows || rows.length === 0) continue
  console.log(`== ${dir.toUpperCase()} (${rows.length}) ==`)
  const byCtx = {}
  for (const r of rows) (byCtx[r.context] ||= []).push(r)
  for (const ctx of Object.keys(byCtx).sort()) {
    const list = byCtx[ctx]
    const flags = list
      .map(r => {
        const f = []
        if (r.inLoop) f.push('loop')
        if (r.inStepRun) f.push('step.run')
        return f.length ? ` [${f.join(',')}]` : ''
      })
      .filter(Boolean).length
    console.log(
      `  ${ctx.padEnd(18)} ${String(list.length).padStart(3)}   (${flags} with loop/step.run flags)`
    )
    for (const r of list) {
      const f = []
      if (r.inLoop) f.push('loop')
      if (r.inStepRun) f.push('step.run')
      const tag = f.length ? `  [${f.join(',')}]` : ''
      console.log(`      ${r.file}:${r.line} ${r.fn}${tag}`)
    }
  }
  console.log('')
}

console.log('Guard reference (where each context is enforced):')
console.log(
  '  scene            -> paid-wizard-guard-ratchet.test.ts (charge-on-success/refund-on-fail)'
)
console.log(
  '  api-route        -> creditWebhookAuthenticated + x402CreditFailClosed + robokassa-order'
)
console.log(
  '  inngest-function -> inngestMoneyInStepRun (credit/refund inside step.run)'
)
console.log(
  '  service/command  -> called from a guarded scene/handler; verify per-site if new'
)
console.log('')
console.log('This is a read-only overview. Enforcement lives in tri guards.')
