#!/usr/bin/env node
'use strict'

/**
 * Who can reach a shell, and with what.
 *
 * The distinction that matters is the PRIMITIVE, not the file. exec and
 * execSync hand their string to a shell, so every interpolation in the
 * template is shell-interpreted. execFile, execFileSync and spawn take an
 * argv array and do not, so the same interpolation is inert there.
 *
 * The population was nine files when this was written, and enumerating it
 * produced two real defects: an unvalidated job_id reaching `rm -rf` through
 * ssh2 (#1772) and a command template that had drifted out of its own file's
 * quoting convention (#1773). Neither came from a guess.
 *
 * ssh2's client.exec runs remotely through a shell too, so an SSH service
 * counts even though child_process does not appear in the file.
 */

const fs = require('fs')
const path = require('path')
const readCensus = require('./lib/read-census.cjs').census
const scan = readCensus('исходники')
const { execFileSync } = require('child_process')
const {
  blank,
  matchCode,
  selfCheck: blankSelfCheck,
} = require('./lib/blank-code.cjs')

const ROOT = path.resolve(__dirname, '..')

/** Primitive -> does its argument reach a shell? */
const PRIMITIVES = [
  ['execSync', true],
  ['exec', true],
  ['execFileSync', false],
  ['execFile', false],
  ['spawnSync', false],
  ['spawn', false],
]

/**
 * Which primitives a file IMPORTS from child_process.
 *
 * Classify by the import, never by the call name. Two ways that goes wrong
 * here, both real:
 *
 *   contentFactory/stages.ts imports execFile -- argv, no shell -- and calls
 *   it under the local name `exec`, so a call-name classifier calls it
 *   dangerous;
 *
 *   video-helpers, face-circle-composer, production-monitor and
 *   localMorphingProcessor all wrap exec in promisify and call the result
 *   execAsync, so `exec(` never appears and a call-name classifier misses
 *   every one of them.
 *
 * The import names what the process will actually do. The call site names
 * only what the author called it.
 */
function importedPrimitives(raw) {
  const names = new Set()
  for (const m of matchCode(
    raw,
    /(?:import\s*\{([^}]*)\}\s*from\s*|(?:const|let)\s*\{([^}]*)\}\s*=\s*require\(\s*)['"](?:node:)?child_process['"]/g
  )) {
    for (const part of (m[1] || m[2] || '').split(',')) {
      const n = part
        .trim()
        .split(/\s+as\s+/)[0]
        .trim()
      if (n) names.add(n)
    }
  }
  return names
}

/** Any child_process import at all, named bindings or not. */
const importsChildProcess = raw =>
  matchCode(raw, /(?:from|require\(\s*)\s*['"](?:node:)?child_process['"]/g)
    .length > 0

function selfCheck() {
  blankSelfCheck()
  const fail = why => {
    console.error(`самопроверка не прошла: ${why}`)
    process.exit(2)
  }
  if (!importsChildProcess("import { exec } from 'child_process'")) {
    fail('импорт child_process не распознан')
  }
  if (!importsChildProcess("const { execSync } = require('child_process')")) {
    fail('require child_process не распознан')
  }
  if (!importsChildProcess("import { execFile } from 'node:child_process'")) {
    fail('node: префикс не распознан')
  }
  // A regex .exec is NOT a shell call, and it is the obvious false positive
  // here: the name is identical and far more common.
  if (importsChildProcess('const m = /a/.exec(s)')) {
    fail('regexp .exec принят за child_process')
  }
  const imported = importedPrimitives(
    "import { exec, execFile } from 'child_process'"
  )
  if (!imported.has('exec') || !imported.has('execFile')) {
    fail(`импортированные примитивы разобраны как ${[...imported].join(',')}`)
  }
  // An alias must be recorded under the IMPORTED name, not the local one:
  // stages.ts imports execFile and calls it exec.
  const aliased = importedPrimitives(
    "import { execFile as exec } from 'node:child_process'"
  )
  if (!aliased.has('execFile') || aliased.has('exec')) {
    fail(`алиас разобран как ${[...aliased].join(',')}`)
  }
  if (importedPrimitives("import { exec } from 'other'").size !== 0) {
    fail('импорт из другого модуля принят за child_process')
  }
  // The table itself, not just the parsing. Marking execFile as shell-reaching
  // would move the published count while every parsing control stayed green.
  const table = new Map(PRIMITIVES)
  for (const [name, shouldReachShell] of [
    ['exec', true],
    ['execSync', true],
    ['execFile', false],
    ['execFileSync', false],
    ['spawn', false],
    ['spawnSync', false],
  ]) {
    if (table.get(name) !== shouldReachShell) {
      fail(
        `${name} помечен как ${table.get(name) ? 'доходящий до оболочки' : 'argv'}`
      )
    }
  }

  console.log('самопроверка: примитивы разобраны, посторонние формы отвергнуты')
}

selfCheck()

const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(
    f => f.startsWith('src/') && f.endsWith('.ts') && !f.includes('__tests__')
  )

const shellReaching = []
const argvOnly = []
for (const f of files) {
  const raw = scan.read1(path.join(ROOT, f))
  if (raw === null) continue
  if (!importsChildProcess(raw)) continue
  const imported = importedPrimitives(raw)
  const used = PRIMITIVES.filter(([n]) => imported.has(n))
  if (!used.length) continue
  const row = `  ${f}  [${used.map(([n]) => n).join(', ')}]`
  ;(used.some(([, shell]) => shell) ? shellReaching : argvOnly).push(row)
}

// ssh2 reaches a remote shell without importing child_process.
const sshCallers = files.filter(f => {
  let code
  try {
    code = blank(fs.readFileSync(path.join(ROOT, f), 'utf8'))
  } catch {
    return false
  }
  return /\b(ssh|sshService)\.exec\s*\(/.test(code)
})

console.log(`\n=== ДОХОДЯТ ДО ОБОЛОЧКИ: ${shellReaching.length} ===`)
console.log('   (строка команды интерпретируется -- подстановки опасны)\n')
shellReaching.sort().forEach(r => console.log(r))

console.log(`\n=== УДАЛЁННАЯ ОБОЛОЧКА ЧЕРЕЗ SSH: ${sshCallers.length} ===\n`)
sshCallers.sort().forEach(f => console.log(`  ${f}`))
scan.report(files.length)

console.log(`\nargv, без оболочки: ${argvOnly.length}`)
argvOnly.sort().forEach(r => console.log(r))
