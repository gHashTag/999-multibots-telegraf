#!/usr/bin/env node
// inflight-audit -- report scene .action handlers that reach a CHARGE primitive
// but set NO in-flight guard flag, i.e. a double-tap can re-enter before the
// first charge settles (processBalanceOperation is non-atomic read-check-write).
//
// WHY. iter204 shipped a HIGH double-charge: the aiPhotoshop 'upscale' button
// called upscaleImage() (which charges) directly, bypassing the scene's
// aiPhotoshopInProgress choke point, so two rapid taps both charged. The pattern
// recurs: a paid .action with no synchronous reject-before-set. This lists the
// suspects so the next one is READ, not stumbled on.
//
// This is a TRIAGE report (like `tri sweep`), NOT a gate: a flagged handler is a
// HYPOTHESIS. Many are false positives -- the charge may sit behind a shared
// choke function that holds the guard (grep the callee), or the action is not
// double-tappable. Read each. Reports, never mutates.
//
// Usage: node .claude/loop-opus/inflight-audit.mjs

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SCENES = path.join(ROOT, 'src', 'scenes')

// Primitives that move money (a call to one of these inside an .action body is
// a charge on that path).
const CHARGE = [
  'processBalanceOperation',
  'updateUserBalance',
  'directPaymentProcessor',
  'upscaleImage',
]
// Any assignment to a *InProgress flag is treated as an in-flight guard.
const GUARD_RE = /\b\w*InProgress\b\s*=\s*true/

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue
      walk(p, out)
    } else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

const stripComments = s =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

// Slice out each `.action(` handler body by brace-matching from the first `{`
// after the `.action(` opening. Good enough for a triage report.
function actionHandlers(code) {
  const out = []
  const re = /\.action\(\s*([^,]+),/g
  let m
  while ((m = re.exec(code))) {
    const open = code.indexOf('{', m.index)
    if (open === -1) continue
    let depth = 0
    let i = open
    for (; i < code.length; i++) {
      if (code[i] === '{') depth++
      else if (code[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    out.push({
      selector: m[1].trim().slice(0, 48),
      body: code.slice(open, i + 1),
    })
  }
  return out
}

const flagged = []
for (const file of walk(SCENES)) {
  const code = stripComments(fs.readFileSync(file, 'utf8'))
  for (const h of actionHandlers(code)) {
    const charges = CHARGE.filter(c => h.body.includes(c + '('))
    if (charges.length === 0) continue
    if (GUARD_RE.test(h.body)) continue // has an in-flight guard
    flagged.push({
      file: path.relative(ROOT, file),
      selector: h.selector,
      charges: charges.join(', '),
    })
  }
}

console.log('')
console.log(
  'in-flight guard audit -- paid .action handlers with NO *InProgress = true'
)
console.log(
  '(TRIAGE, not a gate: charge may sit behind a shared guarded choke fn -- READ each)\n'
)
if (flagged.length === 0) {
  console.log('  none flagged.')
} else {
  for (const f of flagged) {
    console.log(`  ${f.file}`)
    console.log(`     action(${f.selector})  ->  charges: ${f.charges}`)
  }
}
console.log(`\n  flagged: ${flagged.length} (hypotheses, verify each)`)
