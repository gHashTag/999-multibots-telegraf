/**
 * The evaluator half of `tri guard-diff` (bin/helpers/guard-diff.mjs).
 *
 * Reads {guard, file, rows} as JSON on stdin, imports the guard module at
 * `file` (a path inside one checked-out ref), and prints one verdict per row
 * as a JSON array on stdout. The module is imported by absolute path, so the
 * verdict is the code AT THAT REF, not this tree's copy.
 *
 * claims: `unbackedKinds(text, [])` non-empty -> "flag", else "silent".
 * prices: `unconfirmedFacts(printed, heard)` non-empty -> "ask", else
 *         "confirm".
 */
import { pathToFileURL } from 'node:url'

type Row = { text?: string; heard?: string; printed?: string }

async function main() {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  const { guard, file, rows } = JSON.parse(input) as {
    guard: 'claims' | 'prices'
    file: string
    rows: Row[]
  }
  const mod = await import(pathToFileURL(file).href)
  const fn = guard === 'claims' ? mod.unbackedKinds : mod.unconfirmedFacts
  if (typeof fn !== 'function') {
    const name = guard === 'claims' ? 'unbackedKinds' : 'unconfirmedFacts'
    process.stderr.write(`${file} exports no function ${name}\n`)
    process.exit(2)
  }
  const verdicts = rows.map(r =>
    guard === 'claims'
      ? fn(r.text, []).length > 0
        ? 'flag'
        : 'silent'
      : fn(r.printed, r.heard).length > 0
        ? 'ask'
        : 'confirm'
  )
  process.stdout.write(JSON.stringify(verdicts) + '\n')
}

main().catch(e => {
  process.stderr.write(`${e && e.stack ? e.stack : e}\n`)
  process.exit(2)
})
