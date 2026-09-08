#!/usr/bin/env node
/**
 * SCORE GENERATED SPECS -- VALIDITY IS NOT CORRECTNESS.
 *
 * ── THE HOLE THIS EXISTS TO CLOSE ─────────────────────────────────────────
 *
 * The first gate was `t27c parse` + `spec-status IMPLEMENTED`. Measured against
 * a deliberate cheat -- answer EVERY question with the same unrelated but valid
 * spec taken from the training set -- it scored **34 of 34, 100%**.
 *
 * That gate measures "is this valid t27", never "is this the right t27". Any
 * training result read off it would have been meaningless, and it would have
 * looked like success.
 *
 * ── WHAT IS MEASURED INSTEAD ──────────────────────────────────────────────
 *
 * Three things, reported separately because they fail for different reasons:
 *
 *   VALID      parses and holds functions            (the old gate)
 *   RELEVANT   declares the module that was ASKED FOR
 *   SUBSTANCE  share of the reference's declared names that appear
 *
 * RELEVANT alone kills the constant-answer cheat: it cannot claim to be
 * `github::issues` and `nn::attention` at once.
 *
 * SUBSTANCE is deliberately a fraction and not a pass/fail. Two correct specs
 * can name things differently, so demanding an exact set would punish a good
 * answer; reporting overlap says how much of the asked-for surface is present
 * without pretending to judge style.
 *
 * ── THE SELF-TEST IS THE POINT ────────────────────────────────────────────
 *
 * `--self-test` runs three synthetic answerers whose scores are known in
 * advance:
 *
 *   the reference itself   must score ~100 on all three
 *   the constant cheat     must score ~0 on RELEVANT
 *   empty answers          must score 0 on everything
 *
 * If the cheat scores well, this file has the same defect as the gate it
 * replaces, and nothing measured with it can be believed.
 */

import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const run = promisify(execFile)
const T27C = process.env.T27C || 't27c'
const REAL = new Set(['IMPLEMENTED', 'PARTIAL'])

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : fallback
}

/** `module github::issues {` -> `github::issues` */
function moduleOf(text) {
  const m = /^\s*module\s+([A-Za-z0-9_:\-]+)/m.exec(text || '')
  return m ? m[1].replace(/;$/, '') : null
}

/**
 * NEAR-RELEVANCE: DID THE ANSWER IDENTIFY THE SUBJECT, EVEN IF NOT THE NAME?
 *
 * RELEVANT is exact module equality, and that is the right gate -- but measured
 * against real answers it turned out to have no middle at all.
 *
 * Measured 08.09.2026 on 34 eval tasks, two tiers of honest attempt:
 *
 *   no examples shown   exact  0%   near 74%   miss 26%
 *   three examples      exact 15%   near 59%   miss 26%
 *   constant cheat      exact  0%   near  0%   miss 100%
 *
 * Asked for `base/debounce.t27`, the answer declared `module debounce` while
 * the reference declares `module base-debounce`. The subject is right; the path
 * prefix convention is not knowable from the description, and is exactly what
 * 207 training examples teach.
 *
 * Binary RELEVANT reported all three rows above as 0% -- so it could not tell a
 * model that found the subject in three cases out of four from a constant
 * unrelated answer. That is the range a base measurement lives in.
 *
 * NEAR is not free: the cheat scores 0 on it, which the battery asserts. It
 * shares a name-part of length > 2, so `axi4` matches `fpga-axi4` and nothing
 * matches `debounce` by accident.
 */
function nearModule(want, got) {
  if (!want || !got) return false
  const a = want.toLowerCase()
  const b = got.toLowerCase()
  if (a === b) return true
  const parts = n => new Set(n.split(/[-:_.]+/).filter(x => x.length > 2))
  const A = parts(a)
  for (const x of parts(b)) if (A.has(x)) return true
  return false
}

/** Names the spec declares: functions, structs, constants. */
function declared(text) {
  const names = new Set()
  for (const re of [
    /\bfn\s+([A-Za-z0-9_]+)/g,
    /\bstruct\s+([A-Za-z0-9_]+)/g,
    /\bconst\s+([A-Za-z0-9_]+)/g,
  ]) {
    let m
    while ((m = re.exec(text || ''))) names.add(m[1])
  }
  return names
}

async function validity(text) {
  const dir = await mkdtemp(join(tmpdir(), 't27score-'))
  try {
    const f = join(dir, 'a.t27')
    await writeFile(f, text || '')
    if (!(text || '').trim()) return false
    try {
      await run(T27C, ['parse', f], {
        timeout: 60_000,
        maxBuffer: 256 * 1024 * 1024,
      })
    } catch {
      return false
    }
    try {
      const { stdout } = await run(T27C, ['spec-status', f], {
        timeout: 60_000,
        maxBuffer: 256 * 1024 * 1024,
      })
      return REAL.has(stdout.trim().split(/\s+/).pop())
    } catch {
      return false
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function scoreOne(reference, answer) {
  const valid = await validity(answer)
  const wantModule = moduleOf(reference)
  const gotModule = moduleOf(answer)
  const relevant = Boolean(wantModule && gotModule && wantModule === gotModule)
  const near = relevant || nearModule(wantModule, gotModule)

  const want = declared(reference)
  const got = declared(answer)
  let hit = 0
  for (const n of want) if (got.has(n)) hit++
  const substance = want.size ? hit / want.size : 0

  return { valid, relevant, near, substance }
}

async function scoreAll(pairs, label) {
  let valid = 0
  let relevant = 0
  let near = 0
  let substance = 0
  for (const { reference, answer } of pairs) {
    const s = await scoreOne(reference, answer)
    if (s.valid) valid++
    if (s.relevant) relevant++
    if (s.near) near++
    substance += s.substance
  }
  const n = pairs.length || 1
  const pct = x => ((x / n) * 100).toFixed(0).padStart(3)
  console.log(
    `  ${label.padEnd(26)} VALID ${pct(valid)}%  RELEVANT ${pct(relevant)}%  ` +
      `NEAR ${pct(near)}%  ` +
      `SUBSTANCE ${((substance / n) * 100).toFixed(0).padStart(3)}%`
  )
  return {
    valid: valid / n,
    relevant: relevant / n,
    near: near / n,
    substance: substance / n,
  }
}

/**
 * ANSWERS ARE MATCHED BY TASK NUMBER, NOT BY MODULE NAME.
 *
 * The module-name path exists above and is kept, but it has a failure mode that
 * looks exactly like a bad model: an answer declaring the WRONG module never
 * matches, is scored as empty, and the panel reports a low number with no hint
 * that the harness -- not the model -- dropped it.
 *
 * A directory of `NN.t27` files keyed to the eval row index cannot do that. And
 * because a silent zero-match would read as "the model wrote nothing", the
 * count of matched answers is printed and asserted on: zero matched is a BROKEN
 * HARNESS, not a score of zero.
 */
async function loadAnswerDir(dir, n) {
  const { readdir } = await import('node:fs/promises')
  const files = (await readdir(dir)).filter(f => /^\d+\./.test(f))

  /*
   * NUMBERING FROM 1 IS THE MISTAKE A PERSON MAKES ONCE, AND IT LOOKS LIKE A BAD MODEL.
   *
   * Measured with the 34 REFERENCE answers, renamed 01..34 instead of 00..33:
   *
   *     RELEVANT 0%   NEAR 35%   SUBSTANCE 20%
   *
   * Perfect answers, scored as a failing model. The only hint was a line
   * reading "33 of 34", which reads as one missing answer rather than as every
   * answer being attached to the wrong question.
   *
   * A contiguous run 1..n against n tasks is not ambiguous -- it is off by one,
   * and it must stop the run rather than shift it.
   */
  const nums = files
    .map(f => parseInt(f, 10))
    .filter(Number.isInteger)
    .sort((a, b) => a - b)
  if (nums.length === n && nums[0] === 1 && nums[nums.length - 1] === n) {
    console.log(
      `\n⛔ ФАЙЛЫ ПРОНУМЕРОВАНЫ С 01, А ЗАДАЧИ С 00 — сдвиг на единицу.\n` +
        `   Так каждый ответ достаётся ЧУЖОЙ задаче, и эталонные ответы\n` +
        `   получают RELEVANT 0%. Переименуйте в 00..${String(n - 1).padStart(2, '0')}.`
    )
    process.exit(1)
  }

  const byIndex = new Array(n).fill('')
  let matched = 0
  for (const f of files) {
    const i = parseInt(f, 10)
    if (!Number.isInteger(i) || i < 0 || i >= n) continue
    byIndex[i] = await readFile(`${dir}/${f}`, 'utf8')
    if (byIndex[i].trim()) matched++
  }
  console.log(`  ответов найдено: ${matched} из ${n}`)
  if (matched === 0) {
    console.log(
      '\n⛔ НИ ОДИН ответ не сцепился с задачей. Это поломка сцепки, а не ' +
        'оценка модели:\n   файлы обязаны называться NN.t27, где NN — номер ' +
        'задачи от 00.'
    )
    process.exit(1)
  }
  if (matched < n) {
    console.log(`  (${n - matched} задач без ответа считаются пустыми)`)
  }
  return byIndex
}

async function main() {
  const evalPath = arg('--eval', 'spec-dataset/eval.jsonl')
  const trainPath = arg('--train', 'spec-dataset/train.jsonl')
  const answersPath = arg('--answers', null)

  const ev = (await readFile(evalPath, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse)
  const references = ev.map(r => r.messages[2].content)

  if (process.argv.includes('--self-test')) {
    const tr = (await readFile(trainPath, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
    const cheat = tr[0].messages[2].content

    console.log(`  оценочных задач: ${references.length}\n`)
    const perfect = await scoreAll(
      references.map(r => ({ reference: r, answer: r })),
      'эталон (сам ответ)'
    )
    const cheater = await scoreAll(
      references.map(r => ({ reference: r, answer: cheat })),
      'ЖУЛЬНИК (одно на всё)'
    )
    const empty = await scoreAll(
      references.map(r => ({ reference: r, answer: '' })),
      'пустые ответы'
    )

    /*
     * VALID NEEDED A FLOOR THAT ONLY A REAL COMPILER CAN PRODUCE.
     *
     * Measured 08.09.2026: with `t27c` replaced by a script that answers
     * IMPLEMENTED to everything, this battery still printed "прибор поверен".
     * The reference scores 100 either way, the cheat is a valid spec so it
     * scores 100 either way, and the empty row is rejected before the compiler
     * is ever called. Not one row could tell the two compilers apart.
     *
     * This row can. It is prose -- non-empty, so the empty-check does not catch
     * it, and not a spec, so a real t27c refuses it. A stub that approves
     * everything turns this column green and the battery red, which is the
     * only arrangement that makes VALID mean anything.
     */
    const GARBAGE =
      'This paragraph is prose, not a specification.\n' +
      'It has several lines and no module declaration at all.\n' +
      'A compiler that calls this valid is not being consulted.\n'
    const garbage = await scoreAll(
      references.map(r => ({ reference: r, answer: GARBAGE })),
      'мусор (не спек)'
    )

    /*
     * ASSERT ON EVERY NUMBER THE BATTERY PRINTS.
     *
     * The maxBuffer bug was VISIBLE here before it was found: the reference row
     * read VALID 79% instead of 100%, which is exactly the 7 of 34 eval specs
     * whose AST exceeds a megabyte. The battery measured it correctly and then
     * said "прибор поверен", because the verdict only looked at `relevant`.
     *
     * A number printed and not asserted on is decoration. Every column now has
     * a claim attached to it.
     */
    const bad = []
    if (perfect.valid < 0.98) {
      bad.push(
        `эталон валиден лишь на ${(perfect.valid * 100).toFixed(0)}% — ` +
          `сами эталоны обязаны проходить ворота`
      )
    }
    if (perfect.substance < 0.98)
      bad.push('эталон не совпал сам с собой по существу')
    if (cheater.substance > 0.1) bad.push('ЖУЛЬНИК набирает существо')
    if (empty.relevant > 0) bad.push('пустой ответ признан релевантным')
    if (perfect.relevant < 0.95) bad.push('эталон не признан релевантным')
    if (cheater.relevant > 0.1) bad.push('ЖУЛЬНИК проходит по релевантности')
    // NEAR was added because RELEVANT had no middle. If the cheat can
    // score on it, it has no floor either, and the whole column is noise.
    if (cheater.near > 0.1)
      bad.push('ЖУЛЬНИК набирает БЛИЗОСТЬ — мера бесплатна')
    if (perfect.near < 0.98) bad.push('эталон не близок сам себе')
    if (empty.near > 0) bad.push('пустой ответ признан близким')
    if (empty.valid > 0) bad.push('пустой ответ признан валидным')
    // The floor. Without it the whole column passes with no compiler at all.
    if (garbage.valid > 0)
      bad.push(
        'ПРОЗА признана валидным спеком — компилятор либо подставной, ' +
          'либо не вызывается вовсе'
      )
    if (bad.length) {
      console.log(`\n[score] ⚠️  ПРИБОР НЕ ГОДЕН: ${bad.join('; ')}`)
      process.exit(1)
    }
    console.log(
      '\n[score] прибор поверен: эталон проходит, жульник и пустота — нет'
    )
    return
  }

  const answersDir = arg('--answers-dir', null)
  if (answersDir) {
    const answers = await loadAnswerDir(answersDir, references.length)
    await scoreAll(
      references.map((r, i) => ({ reference: r, answer: answers[i] })),
      'модель'
    )
    return
  }

  if (!answersPath) {
    console.error(
      'Нужен --answers <файл.jsonl> со строками {module_path, spec}, ' +
        '--answers-dir <каталог с NN.t27>, или --self-test.'
    )
    process.exit(2)
  }
  const answers = new Map()
  for (const line of (await readFile(answersPath, 'utf8')).split('\n')) {
    if (!line.trim()) continue
    const r = JSON.parse(line)
    answers.set(r.module_path || r.id, r.spec || r.answer || '')
  }
  const pairs = ev.map((r, i) => ({
    reference: references[i],
    answer: answers.get(moduleOf(references[i])) || '',
  }))
  await scoreAll(pairs, 'модель')
}

main().catch(e => {
  console.error('[score] не удалось:', e.message)
  process.exit(1)
})
