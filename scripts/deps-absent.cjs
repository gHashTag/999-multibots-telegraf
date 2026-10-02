#!/usr/bin/env node
/**
 * Packages a package.json declares that node cannot find from its directory.
 *
 * WHY. A worktree's node_modules is usually a link to the main checkout's,
 * which is installed for whatever branch THAT checkout is on. On 2026-10-03
 * it sat on a branch 2634 commits behind main, and root-types failed on
 * TS2307 'redis' in every linked tree -- read as a debt of main, or as a
 * fault of the code under review, when it was neither.
 *
 * Resolution walks up through parent node_modules, the way node does: a
 * package hoisted to the root is present, not absent.
 *
 * One home for this rule: `tri deps` and `bun run verify` both call it.
 *
 *   node scripts/deps-absent.cjs <dir> [label]   prints "label: a b" or nothing
 */
'use strict'

const fs = require('fs')
const path = require('path')

const found = (from, name) => {
  for (let d = path.resolve(from); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'node_modules', name, 'package.json')))
      return true
    if (d === path.dirname(d)) return false
  }
}

/** Declared dependencies and devDependencies of dir/package.json not found. */
function absentFrom(dir) {
  const file = path.join(dir, 'package.json')
  if (!fs.existsSync(file)) return []
  const p = JSON.parse(fs.readFileSync(file, 'utf8'))
  const names = Object.keys({ ...p.dependencies, ...p.devDependencies })
  return names.filter(n => !found(dir, n))
}

module.exports = { absentFrom }

if (require.main === module) {
  const [dir = '.', label = dir] = process.argv.slice(2)
  const gone = absentFrom(dir)
  if (gone.length) console.log(`${label}: ${gone.join(' ')}`)
}
