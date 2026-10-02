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
 * installDrift() is the EARLY warning. Absent packages are what a stale install
 * looks like once it bites; a linked node_modules whose package.json declares
 * different packages or versions than this tree is the same fault a day
 * earlier, while every gate is still green.
 *
 * One home for this rule: `tri deps` and `bun run verify` both call it.
 *
 *   node scripts/deps-absent.cjs <dir> [label]          prints "label: a b" or nothing
 *   node scripts/deps-absent.cjs --drift <dir> [label]  prints the drift or nothing
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

const declared = file => {
  if (!fs.existsSync(file)) return null
  const p = JSON.parse(fs.readFileSync(file, 'utf8'))
  return { ...p.dependencies, ...p.devDependencies }
}

/**
 * When dir/node_modules is a link into another checkout, the packages whose
 * declared version differs between the two package.json files (absent on one
 * side reads as "-"). null when the install is the tree's own, or they agree.
 */
function installDrift(dir) {
  const nm = path.join(dir, 'node_modules')
  let real
  try {
    if (!fs.lstatSync(nm).isSymbolicLink()) return null
    real = fs.realpathSync(nm)
  } catch {
    return null
  }
  const from = path.dirname(real)
  if (from === fs.realpathSync(dir)) return null
  const mine = declared(path.join(dir, 'package.json'))
  const theirs = declared(path.join(from, 'package.json'))
  if (!mine || !theirs) return null
  const names = [...new Set([...Object.keys(mine), ...Object.keys(theirs)])]
  const changed = names
    .filter(n => mine[n] !== theirs[n])
    .map(n => `${n} ${theirs[n] ?? '-'} -> ${mine[n] ?? '-'}`)
  return changed.length ? { from, changed } : null
}

/** One line for a report: where the install came from, and what differs. */
const driftLine = ({ from, changed }, max = 4) =>
  `installed from ${from}: ${changed.slice(0, max).join(', ')}` +
  (changed.length > max ? ` (+${changed.length - max} more)` : '')

module.exports = { absentFrom, installDrift, driftLine }

if (require.main === module) {
  const args = process.argv.slice(2)
  const drift = args[0] === '--drift'
  if (drift) args.shift()
  const [dir = '.', label = dir] = args
  if (drift) {
    const d = installDrift(dir)
    if (d) console.log(`${label}: ${driftLine(d)}`)
  } else {
    const gone = absentFrom(dir)
    if (gone.length) console.log(`${label}: ${gone.join(' ')}`)
  }
}
