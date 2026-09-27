#!/usr/bin/env node
/**
 * tri tail [N] -- <command...>
 *
 * The last N lines of a command's output AND the command's own exit code.
 *
 * WHY. `cmd | tail -20; echo $?` prints tail's code, not cmd's. The loop
 * journal names the trap (turn 7: `tri full-run | tail` read 0 on a RED
 * run), and turn 9 (27.09.2026) fell into it again: `npx tsc | tail -5;
 * echo render-tsc=$?` said 0 over a real type error. A rule in a journal
 * did not stop it; a command that cannot lose the code does.
 *
 * - The whole output goes to a file (in .git, never tracked); the last N
 *   lines (default 20) are printed, then `== exit <code> · <file>`.
 * - tri tail exits with the command's code, so `&&` and gates keep working.
 * - One argument after `--` runs in bash with `set -o pipefail`, so a pipe
 *   inside it cannot hide a failure either: tri tail -- "a | b".
 */
import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const args = process.argv.slice(2)
const sep = args.indexOf('--')
if (sep < 0 || sep === args.length - 1) {
  console.log(
    'tri tail [N] -- <command...>   (one quoted argument runs in bash with pipefail)'
  )
  process.exit(2)
}
const n = sep > 0 ? Number(args[0]) : 20
if (!Number.isInteger(n) || n < 1) {
  console.log(`N is a count of lines, not «${args[0]}»`)
  process.exit(2)
}
const cmd = args.slice(sep + 1)

const gitDir = spawnSync('git', ['rev-parse', '--git-dir'], {
  encoding: 'utf8',
})
const dir = gitDir.status === 0 ? gitDir.stdout.trim() : tmpdir()
const file = join(dir, 'tri-tail.log')
const out = createWriteStream(file)

const child =
  cmd.length === 1
    ? spawn('bash', ['-c', `set -o pipefail; ${cmd[0]}`], {
        stdio: ['inherit', 'pipe', 'pipe'],
      })
    : spawn(cmd[0], cmd.slice(1), { stdio: ['inherit', 'pipe', 'pipe'] })

let last = []
let partial = ''
const take = chunk => {
  out.write(chunk)
  const text = partial + chunk.toString('utf8')
  const lines = text.split('\n')
  partial = lines.pop() ?? ''
  last = last.concat(lines).slice(-n)
}
child.stdout.on('data', take)
child.stderr.on('data', take)
child.on('error', e => {
  console.log(
    `cannot run \`${cmd[0]}\` (${e.code ?? e.message}): after -- comes a command`
  )
  process.exit(2)
})
child.on('close', (code, signal) => {
  if (partial) last = last.concat([partial]).slice(-n)
  out.end(() => {
    for (const l of last) console.log(l)
    const exit = code ?? 128
    console.log(`== exit ${exit}${signal ? ` (${signal})` : ''} · ${file}`)
    process.exit(exit)
  })
})
