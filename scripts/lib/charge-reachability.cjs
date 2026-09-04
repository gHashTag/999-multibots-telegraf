'use strict'
/**
 * WHO CAN REACH A CHARGING SERVICE, AND IS THAT CALLER GUARDED.
 *
 * Most charging files are services that never guard themselves. Their protection
 * against a double charge belongs to whoever calls them: a scene with an
 * in-progress flag, an Inngest function whose charge sits in step.run, or a
 * command with a consume-once guard.
 *
 * That is a claim about the IMPORT GRAPH, and until now it was a claim I made by
 * reading the graph once and writing the conclusion in a report. A new import
 * from an unguarded place breaks it silently -- the services stay identical, the
 * scenes stay guarded, and nothing anywhere turns red.
 *
 * BARRELS ARE TRANSPARENT. `services/index.ts` re-exporting a charger is not a
 * caller; the caller is whoever imports the barrel. Treating a barrel as a
 * terminal importer would report "imported only by index.ts" and prove nothing,
 * so barrels are followed through.
 *
 * SPECIFIERS ARE READ FROM RAW SOURCE. The first version read them from a
 * blank-code mask and found ZERO importers for every file in the repository --
 * the module path lives inside a string literal, which the mask blanks. Fourth
 * time that trap has appeared here; the tell was that the answer was uniformly
 * zero, which is a broken instrument rather than a clean repository.
 */

const fs = require('fs')
const path = require('path')
const { matchCode } = require('./blank-code.cjs')

const SPEC = /(?:from|import\()\s*['"]([^'"\n]+)['"]/g

function sourceFiles(root) {
  const out = []
  const walk = dir => {
    for (const e of fs.readdirSync(path.join(root, dir), {
      withFileTypes: true,
    })) {
      const rel = `${dir}/${e.name}`
      if (e.isDirectory()) walk(rel)
      else if (
        e.name.endsWith('.ts') &&
        !e.name.endsWith('.test.ts') &&
        !rel.includes('__tests__')
      )
        out.push(rel)
    }
  }
  walk('src')
  return out
}

/** Resolve an import specifier to a repo-relative file, or null if external. */
function resolveSpec(root, fromFile, spec) {
  let p
  if (spec.startsWith('@/')) p = path.join('src', spec.slice(2))
  else if (spec.startsWith('.'))
    p = path.normalize(path.join(path.dirname(fromFile), spec))
  else return null
  for (const c of [`${p}.ts`, path.join(p, 'index.ts')])
    if (fs.existsSync(path.join(root, c))) return c
  return null
}

/** file -> Set of files importing it. */
function importGraph(root) {
  const importers = new Map()
  for (const f of sourceFiles(root)) {
    const raw = fs.readFileSync(path.join(root, f), 'utf8')
    for (const m of matchCode(raw, SPEC)) {
      const t = resolveSpec(root, f, m[1])
      if (!t) continue
      if (!importers.has(t)) importers.set(t, new Set())
      importers.get(t).add(f)
    }
  }
  return importers
}

const isBarrel = f => f.endsWith('/index.ts')

/**
 * Importers of `file`, with barrels replaced by THEIR importers.
 * Bounded by a visited set, so a cycle of barrels cannot spin.
 */
function effectiveImporters(importers, file, seen = new Set()) {
  const out = new Set()
  for (const imp of importers.get(file) || []) {
    if (seen.has(imp)) continue
    seen.add(imp)
    if (isBarrel(imp)) {
      for (const up of effectiveImporters(importers, imp, seen)) out.add(up)
      // A barrel with no importers of its own is still a dead end worth seeing.
      if (!(importers.get(imp) || new Set()).size) out.add(imp)
    } else out.add(imp)
  }
  return out
}

function selfCheck(root) {
  const g = importGraph(root)
  let edges = 0
  for (const s of g.values()) edges += s.size
  // A graph with no edges is the mask bug returning: every specifier blanked.
  if (edges < 200)
    throw new Error(
      `import graph has ${edges} edges -- specifiers are being read from a mask, not from source`
    )
  return true
}

module.exports = {
  sourceFiles,
  resolveSpec,
  importGraph,
  effectiveImporters,
  isBarrel,
  selfCheck,
}
