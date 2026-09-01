#!/usr/bin/env node
// leaks-audit -- report files that WRITE a local temp file (saveFileLocally /
// fs.writeFile / createWriteStream to a path) but have NO unlink anywhere, so the
// file is orphaned on disk and slowly fills the long-running multi-bot process.
//
// WHY. iter206 shipped a per-call PNG leak: generateFluxKontextPro saved a local
// copy via saveFileLocally and never unlinked it (the Max sibling did). The
// pattern recurs -- a temp file created for a transient purpose but never removed
// on the success and/or error path. This lists the suspects so the next one is
// READ, not left to fill the disk.
//
// TRIAGE, not a gate (like `tri sweep`): a flagged file is a HYPOTHESIS. False
// positives: the file may be the DELIVERED artifact (kept intentionally), cleaned
// by an external sweeper, or written to a tmp dir the OS reaps. Read each.
// Reports, never mutates.
//
// Usage: node .claude/loop-opus/leaks-audit.mjs

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')

// saveFileLocally persists to <dist>/uploads/<id>/ (NOT an OS-tmp dir the OS
// reaps), so a saveFileLocally with no unlink is a genuine, growing leak -- this
// is the exact iter206 generateFluxKontextPro pattern. We scope to it (rather
// than every fs.writeFile, many of which are OS-tmp or the delivered artifact)
// to keep the report high-signal.
const WRITE_RE = /\bsaveFileLocally\s*\(/
// Any removal of a local file.
const UNLINK_RE =
  /\bunlink(Sync)?\s*\(|\bfs\.promises\.unlink\s*\(|\brimraf\s*\(/
// CRITICAL discriminator (iter208): a file that builds a `/uploads/...` URL from
// the saved path is SERVING it (the mini-app serves /uploads, and the URL is
// stored in the DB / sent to the user), so the local file is the delivered
// ARTIFACT, not an orphan -- unlinking it would BREAK the served image (a live
// regression). Only a save whose local path is never turned into a served
// /uploads URL is a true orphan leak. This is what keeps the report correct.
const SERVED_RE = /\/uploads\//

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (
        e.name === '__tests__' ||
        e.name === 'node_modules' ||
        e.name === 'test'
      )
        continue
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

const flagged = []
for (const file of walk(SRC)) {
  const code = stripComments(fs.readFileSync(file, 'utf8'))
  const writes = (code.match(new RegExp(WRITE_RE, 'g')) || []).length
  if (writes === 0) continue
  if (/saveFileLocally\.ts$/.test(file)) continue // the helper that defines it
  if (UNLINK_RE.test(code)) continue // has at least one cleanup
  if (SERVED_RE.test(code)) continue // serves the file via /uploads -- NOT an orphan
  // What remains is a saveFileLocally whose local copy is never unlinked AND
  // never served via /uploads: a true orphan leak (the fluxKontextPro class).
  flagged.push({ file: path.relative(ROOT, file), writes })
}

console.log('')
console.log(
  'temp-file leak audit -- files that write a local file with NO unlink'
)
console.log(
  '(TRIAGE, not a gate: the file may be the delivered artifact or OS-reaped -- READ each)\n'
)
if (flagged.length === 0) {
  console.log('  none flagged.')
} else {
  for (const f of flagged) console.log(`  ${f.file}  (writes: ${f.writes})`)
}
console.log(`\n  flagged: ${flagged.length} (hypotheses, verify each)`)
