#!/usr/bin/env node
/**
 * tri stepjump -- INVENTORY (not a gate) of Telegraf wizard step-jumps and the
 * selectStep(n) + next() off-by-one that skips a step.
 *
 * ctx.wizard.next() = selectStep(cursor + 1). So `selectStep(N); return
 * ctx.wizard.next()` lands on cursor N+1, SKIPPING Step N. This broke the
 * resume-after-voice flow in veed-fabric (#1565, fixed) and ai-reels-wizard
 * (task_2602e027, owner -- its Step 2 charges). The correct resume pattern is
 * `selectStep(N); return (ctx.wizard as any).steps[ctx.wizard.cursor](ctx)` or
 * `ctx.wizard.step` direct-invoke (morphing) -- select the step AND run it.
 *
 * OVERSHOOT = a selectStep statement whose immediate next statement in the same
 * block is a (return) ctx.wizard.next(). Lists every selectStep site and flags
 * overshoots. Always exits 0 -- a triage aid, not a ratchet. Reports, never
 * mutates.
 */
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const SRC = path.join(ROOT, 'src')

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) acc.push(p)
  }
  return acc
}

// A bare `<x>.selectStep(...)` statement (its expression IS the selectStep call),
// or a `return <x>.selectStep(...)` -- NOT a big .action(fn) statement whose body
// merely contains a selectStep somewhere inside.
const isSelectStepCall = e =>
  ts.isCallExpression(e) &&
  ts.isPropertyAccessExpression(e.expression) &&
  e.expression.name.text === 'selectStep'
const isSelectStep = n =>
  (ts.isExpressionStatement(n) && isSelectStepCall(n.expression)) ||
  (ts.isReturnStatement(n) && n.expression && isSelectStepCall(n.expression))
const isWizardNext = n =>
  /\.wizard\.next\s*\(\s*\)/.test(n.getText()) &&
  (ts.isReturnStatement(n) || ts.isExpressionStatement(n))

const sites = []
const overshoots = []
for (const f of walk(SRC, [])) {
  const src = fs.readFileSync(f, 'utf8')
  let sf
  try {
    sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true)
  } catch {
    continue
  }
  const rel = path.relative(ROOT, f)
  const visit = n => {
    if (ts.isBlock(n) || ts.isSourceFile(n)) {
      const st = n.statements
      for (let i = 0; i < st.length; i++) {
        if (isSelectStep(st[i])) {
          const line =
            sf.getLineAndCharacterOfPosition(st[i].getStart(sf)).line + 1
          const arg = st[i].getText(sf).trim().slice(0, 44)
          const overshoot = i + 1 < st.length && isWizardNext(st[i + 1])
          sites.push({ rel, line, arg, overshoot })
          if (overshoot) overshoots.push({ rel, line, arg })
        }
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
}

console.log('')
console.log(
  `tri stepjump -- ${sites.length} ctx.wizard.selectStep sites; ${overshoots.length} selectStep+next() OVERSHOOT(s)`
)
console.log(
  '  next() = selectStep(cursor+1), so selectStep(N)+next() skips Step N. INVENTORY, not a gate.'
)
console.log('')
for (const s of sites) {
  const tag = s.overshoot ? 'OVERSHOOT' : 'ok       '
  console.log(`  [${tag}] ${s.rel}:${s.line}  ${s.arg}`)
}
console.log('')
if (overshoots.length) {
  console.log(
    '  OVERSHOOT sites skip their target step. Fix: selectStep(N) + direct invoke'
  )
  console.log(
    '  steps[cursor](ctx) (see veed-fabric #1565). A charge-step target is OWNER.'
  )
} else {
  console.log(
    '  No selectStep+next overshoot. (Known: ai-reels-wizard is owner-routed task_2602e027.)'
  )
}
console.log('')
process.exit(0)
