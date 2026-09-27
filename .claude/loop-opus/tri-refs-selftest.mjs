#!/usr/bin/env node
/**
 * AN ALARM NOBODY CAN MAKE RING IS NOT AN ALARM.  (`tri refs-check`)
 *
 * tri-refs.mjs stays silent when shipped source is clean -- which is also what
 * a broken checker does. This drives its scan() against a throwaway fixture
 * where the answers are known, and fails if the checker cannot tell a real
 * command from a phantom, honour the allowlist, or skip a dispatcher's own
 * help text. Same relationship as `tri scan` -> `tri scan-check`
 * (anomalies.mjs -> anomalies-selftest.mjs).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scan, isCommand } from './tri-refs.mjs'

let failed = 0
const ok = (name, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failed++
}

// A pretend dispatcher: `journal` and its Russian alias are arms; nothing else.
const DISPATCH = [
  '  journal|журнал)      cmd_journal "$@" ;;',
  '  saw|увидел)          cmd_saw "$@" ;;',
  '  busy) shift; node helpers/busy.mjs ;;',
].join('\n')

ok('resolves a real arm', isCommand('journal', DISPATCH))
ok('resolves a Russian-alias arm', isCommand('saw', DISPATCH))
ok('resolves a same-line-code arm', isCommand('busy', DISPATCH))
ok('a phantom does not resolve', !isCommand('notacommand', DISPATCH))

// A fixture tree: one file names a real command and a phantom; one file is
// itself a dispatcher and must be skipped whole.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tri-refs-'))
try {
  fs.writeFileSync(
    path.join(dir, 'doc.ts'),
    '// good: tri journal --probes\n// bad: tri notacommand here\n'
  )
  fs.writeFileSync(
    path.join(dir, 'alt-cli.sh'),
    'case "${1:-}" in\n  bogus) echo hi ;;  # tri bogus is this file\'s own arm\nesac\n'
  )

  const clean = scan([dir], DISPATCH, new Map())
  ok('flags the phantom', clean.found.has('notacommand'))
  ok('does not flag the real command', !clean.found.has('journal'))
  ok('skips a dispatcher file whole', !clean.found.has('bogus'))
  ok(
    'phantom points at the right line',
    clean.found.get('notacommand')?.[0]?.endsWith('doc.ts:2')
  )

  const allowed = scan([dir], DISPATCH, new Map([['notacommand', 'test']]))
  ok('honours the allowlist', !allowed.found.has('notacommand'))
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}

if (failed) {
  console.log(`  ${failed} check(s) failed -- tri refs cannot be trusted`)
  process.exit(1)
}
console.log('  OK   tri refs can tell a phantom from a command')
