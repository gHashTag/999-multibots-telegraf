#!/usr/bin/env node
/**
 * Detect and repair a node_modules directory that has become a symlink to
 * itself, then reinstall the dependencies behind it.
 *
 * WHY. This repo is worked on from several git worktrees at once, and the
 * worktrees share the main tree's dependencies through a symlink
 * (ln -sfn <main>/node_modules <worktree>/node_modules, and the same for
 * apps/vibee-editor/player/node_modules). Run that with the worktree path
 * collapsed to the main tree, and the link points at ITSELF:
 * node_modules -> <that same path>/node_modules. Every access then fails with
 * "Too many levels of symbolic links", so `bun run verify` cannot spawn a
 * single step — all thirteen report exit -1 in 0.0s — and every worktree that
 * points here breaks too. It reads as a mass gate failure; it is one broken
 * symlink. verify.cjs calls findSelfLoops() as a preflight so the gate names
 * this instead of blaming the code.
 *
 * Signature to recognise by hand: `ls node_modules` prints "Too many levels of
 * symbolic links"; `readlink node_modules` equals its own absolute path.
 *
 * Idempotent: with nothing wrong, findSelfLoops() returns [] and the CLI
 * prints "clean". No dependency on anything outside Node's stdlib.
 */
'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

// Locations whose node_modules the worktree recipe links, each with the
// directory the reinstall must run from.
const DIRS = ['.', 'apps/vibee-editor/player']

/**
 * Return the directories (relative to baseDir) whose node_modules is a symlink
 * pointing at itself. Resolves the link target against the link's own
 * directory, so it catches both absolute and relative self-targets.
 */
function findSelfLoops(baseDir) {
  const base = baseDir || process.cwd()
  const loops = []
  for (const dir of DIRS) {
    const nm = path.join(base, dir, 'node_modules')
    let stat
    try {
      stat = fs.lstatSync(nm)
    } catch {
      continue // no node_modules here at all
    }
    if (!stat.isSymbolicLink()) continue
    let target
    try {
      target = fs.readlinkSync(nm)
    } catch {
      continue
    }
    const resolved = path.resolve(path.dirname(nm), target)
    if (resolved === path.resolve(nm)) loops.push({ dir, nm })
  }
  return loops
}

/**
 * Repair every self-loop under baseDir: drop the symlink, reinstall. Returns
 * the list of directories healed. Throws if an install fails.
 */
function heal(baseDir) {
  const base = baseDir || process.cwd()
  const healed = []
  for (const { dir, nm } of findSelfLoops(base)) {
    fs.rmSync(nm)
    const cwd = path.join(base, dir)
    const r = spawnSync('bun', ['install'], { cwd, stdio: 'pipe' })
    if (r.status !== 0) {
      throw new Error(
        `bun install failed in ${dir} (exit ${r.status}): ` +
          ((r.stderr || '').toString().split('\n').slice(-4).join('\n') ||
            (r.error && r.error.message) ||
            'unknown')
      )
    }
    healed.push(dir)
  }
  return healed
}

module.exports = { findSelfLoops, heal }

if (require.main === module) {
  try {
    const healed = heal(process.cwd())
    if (healed.length === 0) {
      console.log('clean — no self-referential node_modules symlinks')
    } else {
      for (const d of healed) console.log(`repaired ${d}/node_modules`)
    }
  } catch (err) {
    console.error('heal-node-modules: ' + err.message)
    process.exit(1)
  }
}
