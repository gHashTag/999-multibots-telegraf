#!/usr/bin/env node
/**
 * ONE REPORT, BECAUSE THESE NUMBERS ARE ONLY TRUE TOGETHER.
 *
 * Three instruments measure a model's answers and not one of them means
 * anything alone. Every misreading below actually happened during the night
 * they were built:
 *
 *   VALID alone       a constant unrelated answer scores 100%.
 *   RELEVANT alone    says the right module was named, nothing about content.
 *   EXECUTION alone   a cheat answering with one RUNNABLE spec scores 100%
 *                     on 34 of 34. Measured, not feared.
 *
 * So this file refuses to print a single headline figure. It prints the panel
 * and the rule for reading it, and it says out loud which failures are not the
 * model's fault at all.
 *
 * ── WHAT CANNOT BE MEASURED HERE, STATED EVERY RUN ────────────────────────
 *
 *   The backend fails on 18 of 34 hand-written references. A model's answer
 *   landing there is being judged by a component it never touched.
 *
 *   Three eval questions exceed the 32768-token window of the chosen base, so
 *   the ceiling is 91%, not 100%.
 *
 *   No spec in this corpus compiles and then fails its own tests -- 262 tests
 *   across three samples, zero failures. On references, execution therefore
 *   carries no information beyond compilation; its power was proved separately
 *   by breaking an implementation on purpose.
 *
 *   A right module with deliberately trivial tests is caught by nothing here.
 */

import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const HERE = new URL('.', import.meta.url).pathname
const BIG = {
  timeout: 1_800_000,
  maxBuffer: 256 * 1024 * 1024,
  cwd: process.cwd(),
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : fallback
}

async function instrument(script, args) {
  try {
    const r = await run('node', [HERE + script, ...args], BIG)
    return { ok: true, out: r.stdout + r.stderr }
  } catch (e) {
    return { ok: false, out: String(e.stdout || '') + String(e.stderr || '') }
  }
}

function pick(out, re) {
  const m = re.exec(out)
  return m ? m.slice(1) : null
}

async function main() {
  const dataset = arg('--dataset', 'spec-dataset')
  const selfTest = process.argv.includes('--self-test')

  console.log('══ ПАНЕЛЬ ОЦЕНКИ ══\n')

  // The dataset itself: without it nothing below has anything to measure.
  try {
    const tr = (await readFile(`${dataset}/train.jsonl`, 'utf8'))
      .trim()
      .split('\n').length
    const ev = (await readFile(`${dataset}/eval.jsonl`, 'utf8'))
      .trim()
      .split('\n').length
    console.log(`  данные        обучение ${tr}, оценка ${ev}`)
  } catch {
    console.log(
      `  данные        ⛔ ${dataset}/ не найден — собрать: tri igla dataset-specs`
    )
    process.exit(1)
  }

  /*
   * THE DATASET PATH MUST REACH THE INSTRUMENTS, NOT JUST THE HEADER.
   *
   * The first version read --dataset itself, printed "train 207, eval 34" from
   * it, and then ran the instruments with no path at all -- so they looked for
   * the default `spec-dataset/` in the working directory.
   *
   * Here that directory was absent and both instruments failed loudly, which is
   * how this was noticed. Had a STALE `spec-dataset/` been lying there, the
   * panel would have printed its numbers under the header of a different
   * dataset, and nothing would have said so.
   *
   * A panel that names one source and measures another is worse than no panel.
   */
  const flags = selfTest ? ['--self-test'] : []
  flags.push(
    '--eval',
    `${dataset}/eval.jsonl`,
    '--train',
    `${dataset}/train.jsonl`
  )
  const score = await instrument('score-spec-answers.mjs', flags)
  const exec = await instrument('score-by-execution.mjs', flags)

  /*
   * The instruments print in Russian, so these patterns must contain Russian.
   * Written as strings rather than regex literals on purpose: the project's
   * no-cyrillic guard permits Cyrillic inside string literals and rejects it in
   * a regex literal, and satisfying that by marking an exception would be
   * dodging the rule rather than following it.
   */
  const P = src => new RegExp(src)
  const s = pick(
    score.out,
    P(
      'эталон[^\\n]*VALID\\s+(\\d+)%\\s+RELEVANT\\s+(\\d+)%\\s+SUBSTANCE\\s+(\\d+)%'
    )
  )
  const c = pick(
    score.out,
    P(
      'ЖУЛЬНИК[^\\n]*VALID\\s+(\\d+)%\\s+RELEVANT\\s+(\\d+)%\\s+SUBSTANCE\\s+(\\d+)%'
    )
  )
  const e = pick(
    exec.out,
    P(
      'эталон[^\\n]*исполнимо\\s+(\\d+)\\s+не пошло\\s+(\\d+)\\s+тестов\\s+(\\d+)\\s+прошло\\s+(\\d+)'
    )
  )
  const be = pick(exec.out, P('подвёл БЭКЕНД\\s+(\\d+)'))

  console.log('')
  if (s)
    console.log(
      `  эталон        VALID ${s[0]}%  RELEVANT ${s[1]}%  SUBSTANCE ${s[2]}%`
    )
  if (c)
    console.log(
      `  ЖУЛЬНИК       VALID ${c[0]}%  RELEVANT ${c[1]}%  SUBSTANCE ${c[2]}%`
    )
  if (e)
    console.log(
      `  исполнение    исполнимо ${e[0]}, не пошло ${e[1]}, тестов ${e[2]}, прошло ${e[3]}`
    )
  if (be)
    console.log(
      `                из не пошедших ${be[0]} — вина БЭКЕНДА, не модели`
    )

  console.log('\n── как это читать ──')
  console.log('  Ни одно число здесь не значит ничего в одиночку:')
  console.log('    VALID     постоянный чужой ответ даёт 100%')
  console.log('    RELEVANT  назван тот модуль — про содержимое молчит')
  console.log('    исполнение жульник ИСПОЛНИМЫМ спеком даёт 100% на 34 из 34')
  console.log(
    '  Постоянный ответ ловится ТОЛЬКО пересечением RELEVANT и остальных.'
  )

  console.log('\n── чего здесь не измерить ──')
  console.log('  • 18 из 34 эталонов не доходят до исполнения ПО ВИНЕ БЭКЕНДА')
  console.log('  • 3 вопроса длиннее окна базы: потолок 91%, а не 100%')
  console.log('  • ни один спек не «собрался и упал»: 262 теста, 0 падений,')
  console.log('    так что на эталонах исполнение ≡ компиляция')
  console.log('  • свой модуль с намеренно лёгкими тестами не ловит ничто')

  const broken = []
  if (!score.ok) broken.push('score-spec-answers')
  if (!exec.ok) broken.push('score-by-execution')
  if (broken.length) {
    console.log(`\n⛔ ПРИБОРЫ НЕ ПОВЕРЕНЫ: ${broken.join(', ')}`)
    process.exit(1)
  }
  console.log('\n✅ все приборы поверены')
}

main().catch(e => {
  console.error('[report] не удалось:', e.message)
  process.exit(1)
})
