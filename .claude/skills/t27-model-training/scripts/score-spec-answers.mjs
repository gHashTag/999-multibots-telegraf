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

  const want = declared(reference)
  const got = declared(answer)
  let hit = 0
  for (const n of want) if (got.has(n)) hit++
  const substance = want.size ? hit / want.size : 0

  return { valid, relevant, substance }
}

async function scoreAll(pairs, label) {
  let valid = 0
  let relevant = 0
  let substance = 0
  for (const { reference, answer } of pairs) {
    const s = await scoreOne(reference, answer)
    if (s.valid) valid++
    if (s.relevant) relevant++
    substance += s.substance
  }
  const n = pairs.length || 1
  const pct = x => ((x / n) * 100).toFixed(0).padStart(3)
  console.log(
    `  ${label.padEnd(26)} VALID ${pct(valid)}%  RELEVANT ${pct(relevant)}%  ` +
      `SUBSTANCE ${((substance / n) * 100).toFixed(0).padStart(3)}%`
  )
  return { valid: valid / n, relevant: relevant / n, substance: substance / n }
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
    if (empty.valid > 0) bad.push('пустой ответ признан валидным')
    if (bad.length) {
      console.log(`\n[score] ⚠️  ПРИБОР НЕ ГОДЕН: ${bad.join('; ')}`)
      process.exit(1)
    }
    console.log(
      '\n[score] прибор поверен: эталон проходит, жульник и пустота — нет'
    )
    return
  }

  if (!answersPath) {
    console.error(
      'Нужен --answers <файл.jsonl> со строками {module_path, spec}, ' +
        'или --self-test.'
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
