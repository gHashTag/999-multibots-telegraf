#!/usr/bin/env node
/**
 * EVERY `tri X` WRITTEN IN THE TREE IS A CLAIM THAT `tri X` EXISTS. CHECK IT.
 *
 * WHY. Four ticks running, the same defect kept surfacing by hand: a docstring
 * named a `tri` command that was never built -- `tri pod`, then `tri journal`,
 * a browser docstring pointing at the loop's `tri eyes`, `tri tabs`, `tri seal`.
 * Each was a lie of omission of exactly the kind the liveness family exists to
 * kill, aimed at the CLI's own surface. Each was found by eye, late, and only
 * because someone happened to grep. This turns that grep into a command, so the
 * class is guarded on a schedule instead of eyeballs.
 *
 *   node .claude/loop-opus/tri-refs.mjs         (tri refs)
 *
 * A reference resolves if its name is a case-arm in EITHER live dispatcher: the
 * top-level `tri` or `bin/tri` (unknown top-level verbs fall through to bin/tri,
 * so both are real homes). Resolution is a tolerant match on the arm label
 * `(^|[\s|])name(\||\))`, which accepts Russian aliases (`saw|увидел)`) and
 * arms with code on the same line (`busy) shift; ...`). Exit 1 on any
 * unresolved reference, 0 when every `tri X` in scope is a real command -- so a
 * loop tick can put it up front and not gate on eyeballs.
 *
 * WHAT IT GUARDS (SCAN_DIRS): shipped source AND the loop's own tooling
 * .claude/loop-opus. A `tri X` in render code is a claim acted on at runtime; a
 * `tri X` in the tooling (an audit-script header, a LESSONS.md rule that tells a
 * future tick which command to run) is a claim acted on by the next loop. Both
 * rot the same way. loop-opus was NOT scanned until 2026-09-28e -- the earlier
 * note here said doing so would "drown the real signal in prose". That was true
 * WHILE it was dirty: five audit-script headers named unbuilt commands and a
 * LESSONS "Оснастка:" line named three (tri anomalies/providers/verify) that had
 * become tri scan / tri keys / bun run verify. The precondition this file set
 * for itself -- "widen only with a plan to clean what it surfaces" -- was met by
 * cleaning all of it first, then widening. It now sits at zero.
 *
 * A `*-selftest.mjs` names phantom commands ON PURPOSE (its fixtures), and today
 * each is skipped as a dispatcher (its fixture embeds `case "${1:-}"`). If a
 * future fixture trips this without that pattern, the escape hatch is a
 * documented ALLOW entry -- NOT narrowing SCAN_DIRS back and losing the guard.
 * tri.reference.sh (a third, archived dispatcher) is skipped by content.
 *
 * NOT A LIVE CHECK. This reads code, not prod (unlike anomalies.mjs / `tri
 * scan`), so it is fast and offline. "Does the CLI tell the truth about itself"
 * is a DIFFERENT question from "are the product invariants holding", so it is
 * its own command. The self-test is tri-refs-selftest.mjs (`tri refs-check`):
 * an alarm nobody can make ring is not an alarm.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(HERE, '..', '..')

/* The two live dispatchers. A name is a command if it is an arm in either. */
const DISPATCHERS = ['tri', 'bin/tri'].map(f => path.join(ROOT, f))

/*
 * Names deliberately NOT commands of this repo's `tri` and never will be --
 * each with its reason, so the allowlist can never quietly grow into a place
 * bugs hide. Empty today: `tri seal` (t27c seal) and the browser `tri eyes`
 * (tri journal --probes) were FIXED, not excused. Add here only a reference
 * that is correct as written and points at a tool that is not this `tri`.
 */
export const ALLOW = new Map([
  // e.g. ['foo', 'reason it is not a tri command and the reference is right'],
])

const SCAN_DIRS = ['apps/vibee-editor/render/src', '.claude/loop-opus']
const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|coverage)(\/|$)/
const TEXT = /\.(ts|tsx|js|mjs|cjs|md|sh|json|t27)$/

/* A file that is itself a `tri` dispatcher documents its own arms in its help
 * text -- not an anomaly. And this checker's own prose names the very commands
 * it hunts. Skip both by content, so the rule needs no hand-kept file list. */
const IS_DISPATCHER = /case\s+"\$\{?(1|action)\b/
const SELF = fileURLToPath(import.meta.url)

// `tri <name>` where name is a lowercase command token; flags/args after it are
// ignored (we resolve the verb, `tri journal --probes` -> `journal`).
const REF = /(?<![A-Za-z0-9_/-])tri ([a-z][a-z-]+)/g

function readSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

/** True when `name` is an arm in either dispatcher (pass their joined text). */
export function isCommand(name, dispatcherText) {
  const esc = name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
  return new RegExp(`(^|[\\s|])${esc}(\\||\\))`, 'm').test(dispatcherText)
}

function* walk(dir) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (SKIP.test(full)) continue
    if (e.isDirectory()) yield* walk(full)
    else if (e.isFile() && TEXT.test(e.name)) yield full
  }
}

/**
 * Scan the given dirs (absolute or ROOT-relative) for `tri X` references that
 * resolve to no command. Returns { found: Map<name, refs[]>, scanned }.
 * `dispatcherText` and `allow` are injectable so the self-test can drive it
 * against a fixture with a known dispatcher and a known-bad reference.
 */
export function scan(
  dirs = SCAN_DIRS,
  dispatcherText = DISPATCHERS.map(readSafe).join('\n'),
  allow = ALLOW
) {
  const found = new Map()
  let scanned = 0
  for (const dir of dirs) {
    const base = path.isAbsolute(dir) ? dir : path.join(ROOT, dir)
    for (const file of walk(base)) {
      if (file === SELF) continue
      const text = readSafe(file)
      if (IS_DISPATCHER.test(text)) continue
      scanned++
      const lines = text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        for (const m of lines[i].matchAll(REF)) {
          const name = m[1]
          if (isCommand(name, dispatcherText) || allow.has(name)) continue
          const rel = path.relative(ROOT, file)
          if (!found.has(name)) found.set(name, [])
          found.get(name).push(`${rel}:${i + 1}`)
        }
      }
    }
  }
  return { found, scanned }
}

/* CLI: run the scan and print. Skipped when imported (the self-test imports).
 * realpath both sides: on macOS /tmp -> /private/tmp, so a raw path compare
 * would silently skip the run and exit 0 -- the very liveness lie this hunts. */
const realp = p => {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}
if (process.argv[1] && realp(process.argv[1]) === realp(SELF)) {
  const { found, scanned } = scan()
  const C = process.stdout.isTTY
  const red = s => (C ? `\x1b[31m${s}\x1b[0m` : s)
  const green = s => (C ? `\x1b[32m${s}\x1b[0m` : s)
  const dim = s => (C ? `\x1b[2m${s}\x1b[0m` : s)

  console.log(dim(`  scanned ${scanned} files; allowlist has ${ALLOW.size}`))
  if (found.size === 0) {
    console.log(
      green(
        '  OK   every `tri X` in scanned source + tooling is a real command'
      )
    )
    process.exit(0)
  }
  console.log(
    red(`  ${found.size} documented tri command(s) resolve to nothing:`)
  )
  for (const [name, where] of [...found].sort()) {
    console.log(red(`  tri ${name}`) + dim(`  (${where.length})`))
    for (const w of where.slice(0, 6)) console.log(dim(`      ${w}`))
    if (where.length > 6) console.log(dim(`      … +${where.length - 6} more`))
  }
  console.log(
    dim('  fix: build the command, correct the name, or -- only if the')
  )
  console.log(
    dim('  reference is right and points elsewhere -- add it to ALLOW.')
  )
  process.exit(1)
}
