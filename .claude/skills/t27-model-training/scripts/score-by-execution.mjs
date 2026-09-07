#!/usr/bin/env node
/**
 * SCORE A GENERATED SPEC BY EXECUTION -- `t27c test-report` COMPILES AND RUNS IT.
 *
 * The strongest signal available here, and the only one that can catch "valid,
 * relevant, and does the wrong thing" -- which the name-overlap score cannot
 * see and says so honestly.
 *
 * READ THIS FILE'S NUMBER ONLY BESIDE `RELEVANT` FROM score-spec-answers.mjs.
 * The tests arrive WITH the answer, so on its own this score can be gamed; the
 * pairing is explained at `graft` below, together with what was tried first.
 *
 * ── WHAT IS MEASURABLE, AND WHAT IS NOT ───────────────────────────────────
 *
 * Measured 2026-09-08 across the 34 eval references:
 *
 *     16 runnable   compile to Zig, 97 tests, all 97 pass for the reference
 *     18 BLOCKED    do not compile to Zig at all
 *
 * A BLOCKED reference cannot judge anything, and its candidates are reported
 * separately rather than scored zero. `t27c test-report` makes the same
 * distinction in its own output and is right to: a spec that never ran is not a
 * spec that failed.
 */

import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const run = promisify(execFile)
const T27C = process.env.T27C || 't27c'
const BIG = { timeout: 300_000, maxBuffer: 256 * 1024 * 1024 }

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : fallback
}

/**
 * Split a spec into everything-but-tests and its test blocks.
 *
 * A `test "name"` block runs to the next top-level `test`, `fn`, `struct`,
 * `const` or the module's closing brace. Crude, and deliberately so: a real
 * parser lives in t27c and shelling out per block would cost more than it
 * buys. When the split is wrong the run BLOCKS rather than passing, which is
 * the safe direction.
 */
function splitTests(spec) {
  const lines = spec.split('\n')
  const body = []
  const tests = []
  let inTest = false
  for (const line of lines) {
    if (/^\s{0,8}test\s+"/.test(line)) {
      inTest = true
      tests.push(line)
      continue
    }
    if (inTest) {
      if (
        /^\s{0,8}(fn|struct|const|test|pub)\b/.test(line) ||
        /^\}/.test(line)
      ) {
        inTest = false
        body.push(line)
      } else {
        tests.push(line)
      }
      continue
    }
    body.push(line)
  }
  return { body: body.join('\n'), tests: tests.join('\n') }
}

/**
 * GRAFTING THE REFERENCE'S TESTS WAS TRIED AND DOES NOT WORK.
 *
 * Measured: of 16 references whose tests run, only ONE still ran after its test
 * blocks were cut out and re-inserted. The splitter above is a heuristic, and
 * without a real parser it mangles the module.
 *
 * It failed in the safe direction -- mangled specs BLOCK rather than pass -- and
 * the battery's own assertion caught it and refused to report a number.
 *
 * So the candidate is judged by ITS OWN tests, which reopens the hole grafting
 * was meant to close: the tests arrive with the answer, so an easy spec with
 * easy tests scores well.
 *
 * That hole is closed from the other side. `score-spec-answers.mjs` measures
 * RELEVANT -- does the answer declare the module that was asked for -- and a
 * constant cheat cannot. The two numbers are only meaningful together, and this
 * file refuses to be read alone: it prints the pairing rule in its own output.
 *
 * What remains uncovered: the right module with deliberately trivial tests.
 * Narrower, real, and not measurable without the grafting that does not work.
 */
function graft(candidate) {
  return candidate
}

async function testReport(specText) {
  const dir = await mkdtemp(join(tmpdir(), 't27exec-'))
  try {
    const f = join(dir, 'spec.t27')
    await writeFile(f, specText)
    let out = ''
    try {
      const r = await run(T27C, ['test-report', f], BIG)
      out = r.stdout + r.stderr
    } catch (e) {
      out = String(e.stdout || '') + String(e.stderr || '')
    }
    /*
     * BLOCKED CONFLATES THREE DIFFERENT EVENTS, AND ONLY ONE IS THE MODEL'S FAULT.
     *
     * Measured 2026-09-08 by breaking specs/base/debounce.t27 three ways:
     *
     *   codegen failed:          t27c could not even emit Zig -- the SPEC is
     *                            broken. That is the model's fault.
     *   assertion failed
     *   + called at comptime:    an INVARIANT was violated. The spec parsed and
     *                            generated; it is semantically wrong. Far closer
     *                            to correct than the line above.
     *   does not compile: ...    the emitted Zig is invalid for some other
     *                            reason. That is the GENERATOR's defect, not the
     *                            model's -- 53-64% of HAND-WRITTEN specs land
     *                            here, so scoring it against a model would
     *                            charge it for a backend it never touched.
     *
     * Reporting them as one number would put "wrote nonsense" and "wrote a good
     * spec the Zig backend cannot lower" in the same bucket.
     */
    if (/BLOCKED/.test(out)) {
      if (/codegen failed/.test(out)) return { blocked: true, why: 'spec' }
      if (/assertion failed/.test(out) && /comptime/.test(out)) {
        return { blocked: true, why: 'invariant' }
      }
      return { blocked: true, why: 'backend' }
    }
    const m = /tests\s+(\d+)\s+pass\s+(\d+)\s+FAIL\s+(\d+)/.exec(out)
    if (!m) return { blocked: true, why: 'вывод не разобран' }
    const [, total, pass, fail] = m.map(Number)
    return { blocked: false, total, pass, fail }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function scoreAll(pairs, label) {
  let runnable = 0
  let blocked = 0
  const why = { spec: 0, invariant: 0, backend: 0 }
  let tests = 0
  let passed = 0
  for (const { reference, answer } of pairs) {
    const spec = graft(answer)
    if (!spec) {
      blocked++
      continue
    }
    const r = await testReport(spec)
    if (r.blocked) {
      blocked++
      if (r.why) why[r.why] = (why[r.why] || 0) + 1
      continue
    }
    runnable++
    tests += r.total
    passed += r.pass
  }
  const rate = tests ? (passed / tests) * 100 : 0
  console.log(
    `  ${label.padEnd(26)} исполнимо ${String(runnable).padStart(2)}  ` +
      `не пошло ${String(blocked).padStart(2)}  тестов ${String(tests).padStart(3)}  ` +
      `прошло ${String(passed).padStart(3)}  = ${rate.toFixed(0).padStart(3)}%`
  )
  if (blocked) {
    console.log(
      `  ${''.padEnd(26)} из не пошедших: спек негоден ${why.spec}, ` +
        `нарушен инвариант ${why.invariant}, ` +
        `подвёл БЭКЕНД ${why.backend} (не вина модели)`
    )
  }
  return { runnable, blocked, tests, passed, rate: rate / 100 }
}

async function main() {
  const evalPath = arg('--eval', 'spec-dataset/eval.jsonl')
  const trainPath = arg('--train', 'spec-dataset/train.jsonl')

  const ev = (await readFile(evalPath, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse)
  const refs = ev.map(r => r.messages[2].content)

  if (process.argv.includes('--self-test')) {
    const tr = (await readFile(trainPath, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
    /*
     * THE CHEAT MUST BE A RUNNABLE SPEC -- THE WORST CASE, NOT AN ARBITRARY ONE.
     *
     * The first version took tr[0] and reported "cheater: 0 runnable", which
     * read as proof that execution resists a constant answer. It was luck:
     * tr[0] happens not to compile. Measured with tr[1], which does, the same
     * cheat scores 34 of 34 runnable and 100% of tests passed.
     *
     * So execution ALONE cannot catch a constant answer, and a self-test that
     * suggests otherwise is worse than none. The battery now picks the first
     * cheat that actually runs, and asserts the honest thing below.
     */
    let cheat = tr[0].messages[2].content
    for (const row of tr.slice(0, 40)) {
      const probe = await testReport(row.messages[2].content)
      if (!probe.blocked && probe.total > 0) {
        cheat = row.messages[2].content
        break
      }
    }

    console.log(`  эталонов: ${refs.length}\n`)
    const perfect = await scoreAll(
      refs.map(r => ({ reference: r, answer: r })),
      'эталон (сам ответ)'
    )
    const cheater = await scoreAll(
      refs.map(r => ({ reference: r, answer: cheat })),
      'ЖУЛЬНИК (одно на всё)'
    )

    const bad = []
    if (perfect.rate < 0.98) {
      bad.push(
        `эталон проходит лишь ${(perfect.rate * 100).toFixed(0)}% своих тестов`
      )
    }
    /*
     * NO ASSERTION AGAINST THE CHEAT, AND THAT IS THE POINT.
     *
     * With a runnable cheat this score is ~100% by construction. Demanding it
     * be low would make the battery fail for being honest. The cheat is caught
     * by RELEVANT in score-spec-answers.mjs; this file's job is to say so
     * loudly rather than to pretend it does the catching itself.
     */
    if (cheater.rate > 0.5) {
      console.log(
        `\n  ⚠️  ЖУЛЬНИК набрал ${(cheater.rate * 100).toFixed(0)}% — ТАК И ДОЛЖНО БЫТЬ.` +
          `\n      Исполнение НЕ ловит постоянный ответ; его ловит RELEVANT.` +
          `\n      Число из этого файла в одиночку ничего не значит.`
      )
    }
    if (perfect.runnable < 5)
      bad.push('исполнимых эталонов слишком мало для вывода')
    if (bad.length) {
      console.log(`\n[exec] ⚠️  ПРИБОР НЕ ГОДЕН: ${bad.join('; ')}`)
      process.exit(1)
    }
    console.log(
      '\n[exec] прибор поверен: эталон проходит свои тесты.\n' +
        '       ЧИТАТЬ ТОЛЬКО ВМЕСТЕ С RELEVANT из score-spec-answers.mjs:\n' +
        '       здесь тесты приходят вместе с ответом, и «свой модуль с лёгкими\n' +
        '       тестами» этим прибором не ловится.'
    )
    return
  }

  console.error(
    'Пока поддержан только --self-test (ответы модели ещё не снимались).'
  )
  process.exit(2)
}

main().catch(e => {
  console.error('[exec] не удалось:', e.message)
  process.exit(1)
})
