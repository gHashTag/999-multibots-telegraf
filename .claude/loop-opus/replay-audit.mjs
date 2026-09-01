#!/usr/bin/env node
/**
 * tri replay -- INVENTORY (not a gate) of paid `.action` button handlers and the
 * guard each carries against a stale-persistent-button replay.
 *
 * Two real instances of this class (#1551 upscale_image, #1553
 * ai_photoshop_upscale_last) hid behind an in-flight flag that only blocks
 * CONCURRENT taps, not a LATER re-tap of a completed paid op. This tool lists
 * every `.action('name', fn)` whose body directly fires a paid primitive and
 * prints the guard signals it detects, so a future audit reads 1-2 handlers
 * instead of ~130.
 *
 * It asserts NOTHING and always exits 0 -- it is a triage aid, not a ratchet.
 * The REVIEW hint (charges + in-flight-only/none + no scene.leave + no consume)
 * is a HEURISTIC that needs human confirmation: a handler can be safe because
 * its target changes each tap (fresh user upload), which static analysis cannot
 * see. Charges inside wizard STEPS (reached by flow, not a persistent button)
 * are out of scope by design.
 */
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const SRC = path.join(ROOT, 'src')

const PAID_IDENTIFIERS = [
  'updateUserBalance',
  'processBalanceOperation',
  'directPayment',
  'upscaleImage',
  'upscaleFluxKontextImage',
]
const PAID_REGEX = /^(generate|upscale|createVoice|trainModel|render)[A-Z]/
// Non-paid generators that share the generate*/render* prefix but do not
// deduct stars (reports, previews, UI). Excluded to keep the triage clean.
const NONPAID_REGEX =
  /(Report|Excel|Csv|Pdf|Preview|Thumbnail|Menu|Keyboard|Message|Caption|Invoice|Link)$/

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) acc.push(p)
  }
  return acc
}

function analyzeFile(file, rows) {
  const src = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true)
  const rel = path.relative(ROOT, file)

  const visit = n => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'action' &&
      n.arguments.length >= 2 &&
      ts.isStringLiteral(n.arguments[0])
    ) {
      const name = n.arguments[0].text
      const recv = n.expression.expression.getText(sf) // e.g. bot / someScene
      const isGlobal = /(^|\.)bot$/.test(recv) || recv === 'bot'
      const lo = n.getStart(sf)
      const line = sf.getLineAndCharacterOfPosition(lo).line + 1

      let charges = false
      let inflight = false
      let sceneLeave = false
      let consume = false
      let readsSetOnce = false

      const inner = x => {
        if (ts.isCallExpression(x)) {
          const ex = x.expression
          if (ts.isIdentifier(ex)) {
            if (
              (PAID_IDENTIFIERS.includes(ex.text) ||
                PAID_REGEX.test(ex.text)) &&
              !NONPAID_REGEX.test(ex.text)
            )
              charges = true
          } else if (ts.isPropertyAccessExpression(ex)) {
            if (
              (PAID_IDENTIFIERS.includes(ex.name.text) ||
                PAID_REGEX.test(ex.name.text)) &&
              !NONPAID_REGEX.test(ex.name.text)
            )
              charges = true
            if (ex.name.text === 'leave') sceneLeave = true
          }
        }
        if (ts.isPropertyAccessExpression(x)) {
          const nm = x.name.text
          if (/InProgress$/.test(nm)) inflight = true
          if (/^(lastUpscaled|.*Consumed$|.*Rendered$)/.test(nm)) consume = true
          if (/^(last[A-Z]|pending[A-Z]|saved[A-Z]|stored[A-Z])/.test(nm))
            readsSetOnce = true
        }
        x.forEachChild(inner)
      }
      n.arguments.slice(1).forEach(a => inner(a))

      if (charges) {
        let verdict
        if (consume) verdict = 'CONSUME-GUARDED'
        else if (sceneLeave && !isGlobal) verdict = 'LEAVE-GUARDED'
        else if (inflight) verdict = 'INFLIGHT-ONLY (review: later replay?)'
        else verdict = 'UNGUARDED (review!)'
        rows.push({
          name,
          rel,
          line,
          scope: isGlobal ? 'bot' : 'scene',
          inflight,
          sceneLeave,
          consume,
          readsSetOnce,
          verdict,
        })
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
}

const files = walk(SRC, [])
const rows = []
for (const f of files) {
  try {
    analyzeFile(f, rows)
  } catch {
    /* skip unparseable */
  }
}

rows.sort((a, b) => {
  const rank = v =>
    v.startsWith('UNGUARDED') ? 0 : v.startsWith('INFLIGHT') ? 1 : 2
  return rank(a.verdict) - rank(b.verdict) || a.rel.localeCompare(b.rel)
})

console.log('')
console.log(
  `tri replay -- ${rows.length} paid .action button handlers (charge fired directly in the handler)`
)
console.log(
  '  guard against stale-persistent-button replay (#1551, #1553). INVENTORY, not a gate.'
)
console.log('')
const review = rows.filter(r => r.verdict.includes('review'))
for (const r of rows) {
  const flags = [
    r.consume ? 'consume' : '',
    r.inflight ? 'inflight' : '',
    r.sceneLeave ? 'leave' : '',
    r.readsSetOnce ? 'set-once-read' : '',
  ]
    .filter(Boolean)
    .join(',')
  console.log(`  [${r.scope}] ${r.name}  (${r.rel}:${r.line})`)
  console.log(`        ${r.verdict}   {${flags || 'none'}}`)
}
console.log('')
console.log(
  `  summary: ${rows.length} charging button handlers; ${review.length} need a human replay-review.`
)
console.log(
  '  NOTE: "review" is a heuristic hint -- a handler is safe if its charge target'
)
console.log(
  '  changes every tap (fresh upload/input). Confirm by reading the handler.'
)
console.log('')
process.exit(0)
