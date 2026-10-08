#!/usr/bin/env node
/**
 * tri spec-sync <spec id> [--player] [--check] -- A SPEC OF RECORD INTO THE HOST, IN ONE STEP.
 *
 * Binding a spec took four hand steps every time (P34, 2026-10-08): the sync
 * script with the FULL id (`automation/plan-reel` -- a bare `plan-reel` says
 * "no spec at specs/plan-reel.t27"), a copy of the generated module into the
 * player when the screen reads the numbers too, a byte compare of that copy,
 * and the checker. This runs them in that order and stops on the first red.
 *
 *   tri spec-sync automation/plan-reel             render: spec + gen, then the checker
 *   tri spec-sync plan-reel --player               a bare id is looked up under specs/*
 *   tri spec-sync automation/plan-reel --check     compare only, write nothing
 *
 * The t27 checkout: $T27_DIR, else ../t27 beside this repository, else
 * /home/user/t27. Exit 0 bound and identical, 1 something differs, 2 cannot run.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const RENDER = join(ROOT, 'apps/vibee-editor/render')
const PLAYER_SPEC = join(ROOT, 'apps/vibee-editor/player/src/spec')

const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('--')))
let id = args.find(a => !a.startsWith('--'))
if (!id) {
  console.error('usage: tri spec-sync <spec id> [--player] [--check]')
  process.exit(2)
}

const t27 = [
  process.env.T27_DIR,
  resolve(ROOT, '../t27'),
  '/home/user/t27',
].find(d => d && existsSync(join(d, 'specs')))
if (!t27) {
  console.error('no t27 checkout: set T27_DIR')
  process.exit(2)
}

// A bare id is the one spec of that name under specs/<dir>/.
if (!id.includes('/')) {
  const found = readdirSync(join(t27, 'specs'), { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => `${d.name}/${id}`)
    .filter(p => existsSync(join(t27, 'specs', `${p}.t27`)))
  if (found.length !== 1) {
    console.error(
      found.length
        ? `${id} is ambiguous: ${found.join(', ')}`
        : `no specs/*/${id}.t27 in ${t27}`
    )
    process.exit(2)
  }
  id = found[0]
}
const name = id.split('/').pop()

const run = (cmd, argv, cwd) => {
  try {
    execFileSync(cmd, argv, { cwd, stdio: 'inherit' })
    return true
  } catch {
    return false
  }
}

console.log(`== spec-sync ${id} from ${t27}`)
const sync = [join(RENDER, 'scripts/sync-t27-spec.mjs'), t27, id]
if (flags.has('--check')) sync.push('--check')
if (!run('node', sync, RENDER)) {
  console.log(`RED  render: ${id} differs or did not sync`)
  process.exit(1)
}

const gen = join(RENDER, 'src/spec', `${name}.gen.ts`)
const copy = join(PLAYER_SPEC, `${name}.gen.ts`)
if (flags.has('--player') || existsSync(copy)) {
  if (!flags.has('--check')) copyFileSync(gen, copy)
  const same =
    existsSync(copy) && readFileSync(copy, 'utf8') === readFileSync(gen, 'utf8')
  console.log(
    same
      ? `ok   player: ${name}.gen.ts is the render's, byte for byte`
      : `RED  player: ${name}.gen.ts differs from the render's`
  )
  if (!same) process.exit(1)
}

// The checker reads every spec of the repository; a finding on ANOTHER spec
// (another branch's version, 2026-10-08: crm-client-workspace) is printed,
// not counted against this one.
let report = ''
try {
  execFileSync(
    'node',
    [join(ROOT, 'scripts/check-t27-specs.mjs'), '--t27', t27],
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )
} catch (e) {
  report = `${e.stdout ?? ''}${e.stderr ?? ''}`
}
const lines = report.split('\n').filter(l => l.trim())
const mine = lines.filter(l => l.includes(`/${name}.`))
for (const l of lines.filter(l => !mine.includes(l)))
  console.log(`note elsewhere (not ${name}): ${l}`)
if (mine.length) {
  for (const l of mine) console.log(`RED  ${l}`)
  process.exit(1)
}
console.log(`== spec-sync green -- ${id}`)
