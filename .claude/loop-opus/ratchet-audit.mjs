#!/usr/bin/env node
// ratchet-audit -- meta-check the QUALITY of the tri guards ratchets themselves.
//
// WHY. A ratchet is only worth its green if it CAN go red. The recurring failure
// mode across this loop (it.198/199/200/204) is the "false ruler": a ratchet
// that passes green even though its detector is broken or its target renamed --
// so a real regression slips through unseen. Two properties defend against it:
//   1. a SELF-CHECK: the test feeds the detector a synthetic BAD input and
//      asserts it FIRES (proves the detector can fail), and
//   2. a FLOOR (matcher-not-stale): the test asserts the matched population is
//      > 0, so a renamed/gutted target fails loud instead of passing vacuously.
// This lists which guards lack each, so the next iteration hardens them rather
// than trusting a ruler that cannot fail.
//
// TRIAGE, not a gate: a heuristic miss is possible (a self-check written without
// the usual markers). Read each flagged file before hardening. Reports only.
//
// Usage: node .claude/loop-opus/ratchet-audit.mjs

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()

// The tracked guard list is the source of truth (guards.mjs --list).
function guardFiles() {
  const out = execFileSync(
    'node',
    [path.join(ROOT, '.claude/loop-opus/guards.mjs'), '--list'],
    { encoding: 'utf8', cwd: ROOT }
  )
  return out
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
}

// STRUCTURAL vs BEHAVIORAL. The self-check/floor discipline only applies to a
// STRUCTURAL ratchet -- one that reads/parses SOURCE code (an AST or text scan)
// and so has a "detector" that can silently break or match nothing. A
// BEHAVIORAL test imports and CALLS the real function and asserts its output; it
// is inherently self-validating (the test IS the check), so it needs no
// synthetic self-check and no population floor. Flagging behavioral tests would
// be a false positive (same category-confusion trap as the tri leaks served-vs-
// orphan miss). We only audit structural ratchets.
const STRUCTURAL_RE =
  /createSourceFile|fs\.readFileSync\([^)]*\.\.\/|readFileSync\(FILE|readFileSync\(SERVICE|readFileSync\(WIZARD|function analyze\s*\(\s*source|\bstripComments\b/
// A self-check: the test constructs a synthetic input the detector should flag
// and asserts it does. Markers, any of: the literal "self-check" in a test name,
// a `const bad =` / `const good =` synthetic, or an injected-* description.
const SELFCHECK_RE =
  /self-check|const bad\s*=|const good\s*=|injected|synthetic/i
// A floor: an assertion that fails LOUD if the guarded target is renamed/gutted
// -- so the ratchet cannot pass vacuously. Two shapes count: a count floor
// (toBeGreaterThan(OrEqual)) OR a PRESENCE assertion (.toBe(true) that the
// guarded pattern is present -- a ratchet asserting only ABSENCE, e.g.
// toEqual([]) with no presence check, passes vacuously on a gutted target).
const FLOOR_RE =
  /toBeGreaterThan(OrEqual)?\s*\(|\.toBe\(true\)|matcher-not-stale|floor/i
// A real-source MUTATION (the strongest coupling proof, INFORMATIONAL not required):
// the test reverts the actual fix in the real file and asserts the detector fires
// -- proving the ratchet is coupled to the FIX, not just to a synthetic input.
// Hallmark: `expect(mutated).not.toEqual(source)`. Not all structural ratchets
// have one (self-check + floor is the deliberate defense); this is triage info so
// a future agent knows which guards carry the strongest proof.
const MUTATION_RE = /not\.toEqual\(\s*(source|src|cfg|original)\s*\)/

const rows = []
for (const g of guardFiles()) {
  const p = path.join(ROOT, g)
  let code = ''
  try {
    code = fs.readFileSync(p, 'utf8')
  } catch {
    rows.push({ g, missing: true })
    continue
  }
  const structural = STRUCTURAL_RE.test(code)
  rows.push({
    g,
    structural,
    selfcheck: SELFCHECK_RE.test(code),
    floor: FLOOR_RE.test(code),
    mutation: MUTATION_RE.test(code),
  })
}

// Only STRUCTURAL ratchets need a self-check + floor; behavioral tests are
// inherently self-validating and exempt.
const structural = rows.filter(r => !r.missing && r.structural)
const noSelf = structural.filter(r => !r.selfcheck)
const noFloor = structural.filter(r => !r.floor)
const missing = rows.filter(r => r.missing)
const behavioral = rows.filter(r => !r.missing && !r.structural).length

console.log('')
console.log(
  `ratchet-audit -- ${rows.length} tri guards (${structural.length} structural, ${behavioral} behavioral/exempt)\n`
)

if (missing.length) {
  console.log('  MISSING FILE (stale guard entry):')
  for (const r of missing) console.log(`    ${r.g}`)
  console.log('')
}
if (noSelf.length === 0) {
  console.log('  self-check: all guards have one.')
} else {
  console.log(
    '  NO SELF-CHECK (potential false ruler -- detector may not be able to fire):'
  )
  for (const r of noSelf) console.log(`    ${r.g}`)
}
console.log('')
if (noFloor.length === 0) {
  console.log('  floor: all guards have a matcher-not-stale floor.')
} else {
  console.log('  NO FLOOR (a renamed/gutted target could pass vacuously):')
  for (const r of noFloor) console.log(`    ${r.g}`)
}
console.log('')
const withMut = structural.filter(r => r.mutation).length
console.log(
  `  mutation (strongest coupling, informational): ${withMut}/${structural.length} structural guards revert the real fix and assert RED; ` +
    `the rest rely on self-check + floor (the deliberate 2-property defense).`
)
console.log(
  `\n  summary: ${rows.length} guards, ${noSelf.length} without self-check, ${noFloor.length} without floor (triage -- read each)`
)
