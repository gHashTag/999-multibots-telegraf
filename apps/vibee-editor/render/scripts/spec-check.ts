/**
 * `tri spec` -- preflight for a Queen-delegatable issue.
 *
 *   tri spec check <file.md>   judge a written issue body: delegatable? a spec?
 *                              what is still missing, with paste-ready remedies
 *   tri spec new "<title>"     print a ready-to-fill spec that already passes
 *
 * The rule is `src/agent/spec-quality.ts`, a mirror of the compiled engine
 * (gHashTag/BrowserOS QueenSpecQuality). Exit 1 when the body is not delegatable
 * so the loop can gate on it; exit 0 for `new`.
 */
import { readFileSync } from 'node:fs'
import { judge, scaffold, shortfall } from '../src/agent/spec-quality'

function checkFile(path: string): number {
  let body: string
  try {
    body = readFileSync(path, 'utf8')
  } catch {
    process.stdout.write(`no such file: ${path}\n`)
    return 2
  }
  const v = judge(body)
  process.stdout.write(`— ${path} —\n`)
  for (const c of v.checks) {
    process.stdout.write(`  ${c.met ? '✓' : '✗'} ${c.name}\n`)
    if (!c.met) process.stdout.write(`      ${c.remedy}\n`)
  }
  process.stdout.write(
    `\n  delegatable: ${v.delegatable ? 'yes' : 'NO'}` +
      `   full spec: ${v.isSpec ? 'yes' : 'no'}\n`
  )
  if (!v.delegatable) {
    process.stdout.write(
      '  The Queen will skip this: without a `## Boundary` nothing can be ' +
        'reserved for it.\n'
    )
    return 1
  }
  const s = shortfall(v)
  if (s) {
    process.stdout.write(
      `  Delegatable, but ${s} -- a bee can start; review will be stricter.\n`
    )
  } else {
    process.stdout.write('  Ready: a bee can be started and judged on it.\n')
  }
  return 0
}

const [, , cmd, ...rest] = process.argv
if (cmd === 'new') {
  process.stdout.write(scaffold(rest.join(' ')))
  process.exit(0)
} else if (cmd === 'check' && rest[0]) {
  process.exit(checkFile(rest[0]))
} else {
  process.stdout.write(
    'usage: tri spec check <file.md> | tri spec new "<title>"\n'
  )
  process.exit(2)
}
