#!/usr/bin/env node
/**
 * IS THIS GENERATED .t27 A REAL ANSWER?
 *
 * The evaluation gate for "the model writes a spec". Not `t27c parse` on its
 * own -- that is the trap this file exists to close.
 *
 * ── MEASURED 2026-09-08: `parse` ACCEPTS NOTHING AT ALL ───────────────────
 *
 *     empty file          parse=0   spec-status=NOFN
 *     whitespace only     parse=0   spec-status=NOFN
 *     one comment         parse=0   spec-status=NOFN
 *     module {}           parse=0   spec-status=NOFN
 *     struct, no fn       parse=0   spec-status=NOFN
 *
 * Every one of those "parses successfully". Which is defensible -- an empty
 * file IS syntactically well-formed -- and useless as a correctness gate: a
 * model that learned to emit nothing would score 100%.
 *
 * `spec-status` catches all five as NOFN. So the gate is BOTH: it must parse,
 * and it must contain something. Either alone is an instrument that cannot
 * fail, and this session has now found three of those -- a test-gate that
 * inspected zero files, an audit that counted hollow shells as usable, and
 * this.
 *
 * ── THE SELF-TEST IS NOT OPTIONAL ─────────────────────────────────────────
 *
 * `--self-test` runs the degenerate battery above and requires every one to be
 * REJECTED, plus a real spec to be accepted. Run it before trusting any score.
 * The VerilogEval harness reported 0 of 12 on its first run and the fault was
 * the harness; nothing here is more trustworthy by default.
 */

import { writeFile, mkdtemp, rm, readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const run = promisify(execFile)
const T27C = process.env.T27C || 't27c'

/** Statuses that mean the spec actually says something. */
const REAL = new Set(['IMPLEMENTED', 'PARTIAL'])

async function statusOf(file) {
  try {
    const { stdout } = await run(T27C, ['spec-status', file], {
      timeout: 60_000,
      maxBuffer: 256 * 1024 * 1024,
    })
    return stdout.trim().split(/\s+/).pop()
  } catch (e) {
    // A non-zero exit here is itself an answer: the spec is not readable.
    const out = String(e.stdout || '').trim()
    return out ? out.split(/\s+/).pop() : 'NOSTATUS'
  }
}

export async function validate(file) {
  const text = await readFile(file, 'utf8')
  // Cheapest check first, and the one `parse` gets wrong.
  if (!text.trim()) return { ok: false, why: 'файл пуст' }

  try {
    await run(T27C, ['parse', file], {
      timeout: 60_000,
      maxBuffer: 256 * 1024 * 1024,
    })
  } catch (e) {
    const msg = String(e.stderr || e.stdout || e).split('\n')[0]
    return { ok: false, why: `не разбирается: ${msg.slice(0, 90)}` }
  }

  const status = await statusOf(file)
  if (!REAL.has(status)) {
    return { ok: false, why: `разобрался, но пуст по существу: ${status}` }
  }
  return { ok: true, status }
}

const BATTERY = [
  ['пустой файл', ''],
  ['одни пробелы', '\n\n   \n\t\n'],
  ['один комментарий', '// просто комментарий\n'],
  ['пустой модуль', 'module empty::m {\n}\n'],
  ['только struct', 'module s::m {\n    struct A { x: u32 }\n}\n'],
  ['незакрытая скобка', 'module b::x {\n    struct A { a: u32,\n'],
  ['не код вовсе', 'this is not code, just prose\n'],
]

/**
 * A BATTERY OF ONLY SMALL INPUTS IS BLIND TO SIZE.
 *
 * Every degenerate case above is tiny -- an empty file, a comment, `module m {}`
 * -- because degenerate cases ARE tiny. That is why this battery passed while
 * `execFile` was silently failing on large specs: `t27c parse` prints the AST,
 * and a 48 KB spec produces 2.5 MB of it, over Node's 1 MB default. Every big
 * spec was being scored as "does not parse", and nothing here could see it.
 *
 * So the self-test now REFUSES to call itself complete without a control whose
 * AST clears the old limit. Measured: specs/base/ops.t27, 48 KB of source,
 * 2.5 MB of AST -- roughly 53 bytes of AST per byte of spec, so anything past
 * ~20 KB would have done.
 */
const AST_MUST_EXCEED = 1024 * 1024

async function astSize(file) {
  try {
    const { stdout } = await run(T27C, ['parse', file], {
      timeout: 60_000,
      maxBuffer: 256 * 1024 * 1024,
    })
    return stdout.length
  } catch {
    return 0
  }
}

async function selfTest(controlPath) {
  const dir = await mkdtemp(join(tmpdir(), 't27val-'))
  let failures = 0
  try {
    for (const [name, body] of BATTERY) {
      const f = join(dir, 'x.t27')
      await writeFile(f, body)
      const r = await validate(f)
      const good = !r.ok
      console.log(
        `  ${good ? '✅' : '❌ ЛОЖНЫЙ ПРОХОД'} ${name.padEnd(20)} ` +
          `${r.ok ? 'ПРИНЯТ' : 'отвергнут: ' + r.why}`
      )
      if (!good) failures++
    }
    if (controlPath) {
      const r = await validate(controlPath)
      console.log(
        `  ${r.ok ? '✅' : '❌'} ${'контроль (настоящий спек)'.padEnd(20)} ` +
          `${r.ok ? 'принят, ' + r.status : 'ОТВЕРГНУТ: ' + r.why}`
      )
      if (!r.ok) failures++
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  // The battery is not complete until something large has gone through it.
  if (controlPath) {
    const ast = await astSize(controlPath)
    if (ast <= AST_MUST_EXCEED) {
      console.log(
        `\n[t27val] ⚠️  БАТАРЕЯ НЕПОЛНАЯ: AST контроля ${(ast / 1024).toFixed(0)} КБ, ` +
          `нужен больше ${AST_MUST_EXCEED / 1024} КБ. Батарея из мелких входов ` +
          `не видит ошибок, зависящих от размера — так и был пропущен maxBuffer.`
      )
      failures++
    } else {
      console.log(
        `  ✅ ${'большой вход'.padEnd(20)} AST ${(ast / 1024 / 1024).toFixed(1)} МБ — ` +
          `размерный класс покрыт`
      )
    }
  }

  if (failures) {
    console.log(
      `\n[t27val] ⚠️  ПРИБОР НЕ ГОДЕН: ${failures} промах(ов). ` +
        `Ворота, которые пропускают пустоту, дают модели 100% за молчание.`
    )
    process.exit(1)
  }
  console.log('\n[t27val] прибор поверен: пустота и мусор отвергаются')
}

const file = process.argv[2]
if (process.argv.includes('--self-test')) {
  const control = process.argv[process.argv.indexOf('--self-test') + 1]
  selfTest(control && !control.startsWith('--') ? control : null)
} else if (!file) {
  console.error(
    'Usage: validate-t27.mjs <file.t27> | --self-test [контрольный.t27]'
  )
  process.exit(2)
} else {
  validate(file).then(r => {
    console.log(r.ok ? `OK ${r.status}` : `ОТКАЗ: ${r.why}`)
    process.exit(r.ok ? 0 : 1)
  })
}
