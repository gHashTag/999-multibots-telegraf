#!/usr/bin/env node
/**
 * Guard: NEW LOGIC IN THE BOT IS WRITTEN IN .t27 AND NOWHERE ELSE.
 *
 * Owner, 2026-10-09: "write the logic in .t27 and in no other way" and
 * "forbid writing new logic in the bot in any language but .t27". A rule --
 * may this person do it, is it past the limit, how many are kept -- is a
 * spec `fn` in gHashTag/t27, compiled into `<id>.logic.ts` by
 * scripts/t27-logic.mjs, and its numbers come from `<id>.gen.ts`. The host
 * calls them; it does not write them.
 *
 * What this rejects in the ADDED lines of a commit, in the bot (src/) and
 * its agent service (apps/vibee-editor/render/src/), tests and generated
 * files aside:
 *
 *   predicate  a new function returning `boolean`, or one named mayX, canX or
 *              shouldX -- the shape of a rule;
 *   threshold  a new UPPER_CASE constant bound to a number -- the shape of a
 *              limit, a price, a window.
 *
 * Ratchet, not migration: the code already there is not touched (that debt
 * is scripts/t27-specs.json "mirrored"). Plumbing that only LOOKS like a rule
 * -- a type guard on Telegram's data, a timeout of a network call -- says so
 * on the line or the one above: `// t27-plumbing: <why this is not a rule>`.
 * A marker without a reason is refused: the reason is what a reviewer reads.
 *
 *   node scripts/t27-only-guard.cjs staged    # pre-commit
 */
'use strict'

const { execSync } = require('node:child_process')

const SCOPE = /^(src|apps\/vibee-editor\/render\/src)\/.+\.tsx?$/
const SKIP =
  /(\.test\.tsx?|\.d\.ts|\.gen\.ts|\.logic\.ts)$|\/__tests__\/|\/__mocks__\/|\/spec\//
const MARKER = /\/\/\s*t27-plumbing:\s*\S.{2,}/
const BARE_MARKER = /\/\/\s*t27-plumbing:?\s*$/

const PREDICATE = [
  // function name(...): boolean   |   async function name(...): Promise<boolean>
  /\bfunction\s+(\w+)\s*(?:<[^>]*>)?\([^)]*\)\s*:\s*(?:Promise<)?boolean\b/,
  // const name = (...): boolean =>
  /\b(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*:\s*(?:Promise<)?boolean\s*=>/,
  // function mayX( / canX( / shouldX(  -- named as a rule
  /\bfunction\s+((?:may|can|should)[A-Z]\w*)\s*\(/,
  /\b(?:const|let)\s+((?:may|can|should)[A-Z]\w*)\s*=\s*(?:async\s*)?\(/,
]
const THRESHOLD =
  /\b(?:export\s+)?const\s+([A-Z][A-Z0-9_]{2,})\s*(?::\s*number\s*)?=\s*-?[\d][\d_]*(?:\.\d+)?(?:\s*\*\s*[\d_]+)*\s*;?\s*(?:\/\/.*)?$/

/** Problems in one file's added lines: [{ line, kind, name, text }]. */
function scanAdded(path, added) {
  if (!SCOPE.test(path) || SKIP.test(path)) return []
  const bad = []
  for (let i = 0; i < added.length; i++) {
    const { text, prev } = added[i]
    if (MARKER.test(text) || MARKER.test(prev ?? '')) continue
    if (BARE_MARKER.test(text) || BARE_MARKER.test(prev ?? '')) {
      bad.push({ line: added[i].no, kind: 'marker', name: '', text })
      continue
    }
    const code = text.replace(/\/\/.*$/, '')
    for (const re of PREDICATE) {
      const m = re.exec(code)
      if (m) {
        bad.push({ line: added[i].no, kind: 'predicate', name: m[1], text })
        break
      }
    }
    const t = THRESHOLD.exec(text)
    if (t) bad.push({ line: added[i].no, kind: 'threshold', name: t[1], text })
  }
  return bad
}

/** Parse `git diff -U1` output into { path: [{ no, text, prev }] } of added lines. */
function addedLines(diff) {
  const out = {}
  let path = null
  let no = 0
  let prev = null
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      path = raw.slice(4).replace(/^b\//, '')
      if (path === '/dev/null') path = null
      continue
    }
    if (raw.startsWith('@@')) {
      no = Number(/\+(\d+)/.exec(raw)?.[1] ?? 0) - 1
      prev = null
      continue
    }
    if (!path || raw.startsWith('--- ')) continue
    if (raw.startsWith('+')) {
      no += 1
      ;(out[path] ??= []).push({ no, text: raw.slice(1), prev })
      prev = raw.slice(1)
    } else if (raw.startsWith(' ')) {
      no += 1
      prev = raw.slice(1)
    } else if (raw.startsWith('-')) {
      // a removed line moves nothing in the new file
    }
  }
  return out
}

function main() {
  const mode = process.argv[2]
  if (mode !== 'staged') {
    console.error('usage: t27-only-guard.cjs staged')
    process.exit(2)
  }
  const diff = execSync(
    'git diff --cached -U1 --no-color --diff-filter=AM -- "*.ts" "*.tsx"',
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  const bad = []
  for (const [path, lines] of Object.entries(addedLines(diff)))
    for (const b of scanAdded(path, lines)) bad.push({ path, ...b })
  if (!bad.length) return
  console.error(
    'New logic outside .t27 (owner, 2026-10-09: logic is written in .t27 and in no other way):'
  )
  for (const b of bad)
    console.error(
      `  ${b.path}:${b.line}  [${b.kind}] ${b.name ? b.name + ': ' : ''}${b.text.trim().slice(0, 120)}`
    )
  console.error(
    '\nWrite the rule as a fn (or the number as a const) in the spec in gHashTag/t27, vendor it\n' +
      '(sync-t27-spec.mjs), compile it (node scripts/t27-logic.mjs <t27> <kind/id> --out=<dir>) and import\n' +
      'it from <id>.logic.ts / <id>.gen.ts. Plumbing that only looks like a rule says why on the line:\n' +
      '  // t27-plumbing: <why this is not a rule>     (skill t27-spec-first)'
  )
  process.exit(1)
}

module.exports = { scanAdded, addedLines }
if (require.main === module) main()
