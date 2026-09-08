#!/usr/bin/env node
/**
 * Does every subcommand of this toolkit still run?
 *
 * 113 of them have accumulated, and not one had ever been executed THROUGH the
 * CLI: each was tried by calling its script or function directly, which is how
 * twelve of them shipped for months dropping their first argument. A toolkit
 * trusted without being exercised is the same defect one floor up from the code
 * it checks.
 *
 * IT PRINTS EVERY COMMAND, not only the broken ones. A sweep that reports
 * failures alone is silent both when nothing is broken and when nothing ran,
 * and those two are the same picture. The population is the point.
 *
 * SAFE BY EXCLUSION, NOT BY HOPE. Anything that mutates state, spends money or
 * takes a remote lock is named below and skipped, and the skips are printed
 * with their reason -- a skip nobody can see is indistinguishable from a pass.
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const SKIP = {
  mutate: 'edits source to check a test bites',
  мутация: 'edits source to check a test bites',
  lock: 'takes a shared lock other sessions wait on',
  лок: 'takes a shared lock other sessions wait on',
  unlock: 'releases a lock this run never took',
  раслок: 'releases a lock this run never took',
  funnel: 'runs inside Railway, bills a remote service',
  воронка: 'runs inside Railway, bills a remote service',
  stuck: 'runs inside Railway',
  платежи: 'runs inside Railway',
  events: 'runs inside Railway',
  события: 'runs inside Railway',
  keys: 'runs inside Railway and probes paid providers',
  ключи: 'runs inside Railway and probes paid providers',
  lesson: 'appends to a skill file from stdin',
  опыт: 'appends to a skill file from stdin',
}

function subcommands(triPath) {
  const lines = fs.readFileSync(triPath, 'utf8').split('\n')
  const start = lines.findIndex(l => /^case "\$action" in/.test(l))
  const out = []
  for (let i = start; i < lines.length; i++) {
    const m = /^ {2}([a-zA-Zа-яёА-ЯЁ|_-]+)\)/.exec(lines[i]) // cyrillic-ok: subcommand aliases are Russian
    if (m) out.push(m[1].split('|')[0])
  }
  return out
}

function classify(out, code) {
  if (
    /command not found|No such file|SyntaxError|Cannot find module|is not a function/i.test(
      out
    )
  )
    return 'BROKEN'
  if (/Needs |usage:|укажите|нужно указать/i.test(out)) return 'asks' // cyrillic-ok: the tools answer in Russian
  if (code === 124) return 'SLOW'
  return 'runs'
}

function main() {
  const root = path.resolve(__dirname, '..')
  const tri = path.join(root, 'tri')
  const names = subcommands(tri)
  const seconds = Number(process.env.TRI_LIVENESS_TIMEOUT || 10)
  const tally = { runs: 0, asks: 0, BROKEN: 0, SLOW: 0, skipped: 0 }
  console.log(`subcommands found: ${names.length}, timeout ${seconds}s each\n`)
  for (const n of names) {
    if (SKIP[n]) {
      tally.skipped++
      console.log(`  skip    ${n.padEnd(26)} ${SKIP[n]}`)
      continue
    }
    let out = '',
      code = 0
    try {
      out = execFileSync(
        'perl',
        ['-e', 'alarm shift; exec @ARGV', String(seconds), 'bash', tri, n],
        {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )
    } catch (e) {
      out = `${e.stdout || ''}${e.stderr || ''}`
      code = e.status ?? 1
    }
    const verdict = classify(out, code)
    tally[verdict]++
    const first =
      String(out)
        .split('\n')
        .find(l => l.trim()) || '(no output)'
    console.log(
      `  ${verdict.padEnd(7)} ${n.padEnd(26)} ${first.trim().slice(0, 62)}`
    )
  }
  console.log(
    `\n${names.length} subcommands: ${tally.runs} ran, ${tally.asks} asked for input, ` +
      `${tally.SLOW} timed out, ${tally.BROKEN} broken, ${tally.skipped} skipped by name`
  )
  if (process.argv.includes('--gate') && tally.BROKEN > 0) process.exit(1)
}

module.exports = { subcommands, classify, SKIP }
if (require.main === module) main()
