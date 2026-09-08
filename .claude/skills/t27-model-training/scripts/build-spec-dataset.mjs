#!/usr/bin/env node
/**
 * THE DATASET FOR THE REAL TASK: WRITING A .t27 SPEC.
 *
 * Four iterations went into "spec -> Verilog", where the usable pair count is
 * zero. The owner corrected it: the point is to WRITE the spec, and `t27c`
 * translates onward. That makes the corpus the specs themselves.
 *
 *     spec -> Verilog   0 usable pairs
 *     writing .t27      317 IMPLEMENTED in t27 alone, 237 of them described
 *
 * ── WHAT THE MODEL IS ASKED, AND WHY THE ANSWER IS CUT ────────────────────
 *
 * Prompt: the module path and the description comment the spec already carries.
 * Target: the spec FROM `module` ONWARD.
 *
 * The description is dropped from the target on purpose. Leave it in and the
 * first thing the model learns is to copy back text it was just handed -- the
 * cheapest possible way to lower the loss and worth nothing. The same shape of
 * mistake as the `t27c` banner in the earlier dataset, which taught the model
 * to sign work it had not done.
 *
 * ── ONLY IMPLEMENTED ──────────────────────────────────────────────────────
 *
 * UNWRITTEN specs are skeletons and NOFN ones hold no functions. Both parse,
 * both look like clean examples, and both teach a model to answer with
 * nothing -- exactly what the hollow Verilog shells would have done.
 *
 * ── THE SELF-CHECK THAT MATTERS ───────────────────────────────────────────
 *
 * Every target is put through `validate-t27.mjs`, the same gate that will score
 * the model. A target that fails it means either the data or the gate is wrong,
 * and finding out here costs a minute instead of a training run.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, relative } from 'node:path'
import { readdirSync, statSync } from 'node:fs'

const run = promisify(execFile)
const T27C = process.env.T27C || 't27c'

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : fallback
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      if (e === 'scratch') continue
      walk(p, out)
    } else if (p.endsWith('.t27')) out.push(p)
  }
  return out
}

async function statusOf(file) {
  try {
    const { stdout } = await run(T27C, ['spec-status', file], {
      timeout: 60_000,
    })
    return stdout.trim().split(/\s+/).pop()
  } catch {
    return 'NOSTATUS'
  }
}

/**
 * Split a spec into the description a person would have written and the code.
 *
 * SPDX and the path line are dropped from both sides: they are boilerplate the
 * model should not be asked to reproduce, and including them in the prompt
 * would put the file's own name in front of it.
 */
function cut(text) {
  const lines = text.split('\n')
  const idx = lines.findIndex(l => /^\s*module\b/.test(l))
  if (idx < 0) return null
  const head = lines
    .slice(0, idx)
    .filter(l => /^\s*(\/\/|;)/.test(l))
    .map(l => l.replace(/^\s*(\/\/|;)\s?/, '').trim())
    .filter(l => l && !/SPDX/i.test(l) && !/\.t27$/.test(l))
  return { description: head.join('\n'), code: lines.slice(idx).join('\n') }
}

function render(modulePath, description, code) {
  return {
    messages: [
      {
        role: 'system',
        content:
          'You write .t27 specifications for Trinity. Emit only the spec, ' +
          'starting at `module`. No prose, no code fences.',
      },
      {
        role: 'user',
        content: `Write the .t27 spec for ${modulePath}.\n\n${description}`,
      },
      { role: 'assistant', content: code },
    ],
  }
}

async function main() {
  const specsDir = arg('--specs', 'specs')
  const outDir = arg('--out', 'spec-dataset')
  const evalRatio = Number(arg('--eval-ratio', '0.15'))
  const minDescLines = Number(arg('--min-desc', '2'))

  const files = walk(specsDir)
  const rows = []
  const skipped = { status: 0, nodesc: 0, nocut: 0 }

  for (const f of files) {
    if ((await statusOf(f)) !== 'IMPLEMENTED') {
      skipped.status++
      continue
    }
    const parts = cut(await readFile(f, 'utf8'))
    if (!parts) {
      skipped.nocut++
      continue
    }
    if (parts.description.split('\n').filter(Boolean).length < minDescLines) {
      skipped.nodesc++
      continue
    }
    rows.push({
      id: relative(specsDir, f),
      area: relative(specsDir, f).split('/')[0],
      ...render(relative(specsDir, f), parts.description, parts.code),
    })
  }

  /*
   * Deterministic and stratified BY AREA (specs/github, specs/nn, ...).
   * A random split can leave a whole area unseen in evaluation, and areas are
   * where the vocabulary differs most -- an eval with no `nn` spec cannot
   * notice a model that forgot how they are written.
   */
  const byArea = new Map()
  for (const r of rows) {
    if (!byArea.has(r.area)) byArea.set(r.area, [])
    byArea.get(r.area).push(r)
  }
  const train = []
  const evalSet = []
  for (const [, list] of [...byArea].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => a.id.localeCompare(b.id))
    const want =
      list.length >= 4 ? Math.max(1, Math.round(list.length * evalRatio)) : 0
    list.forEach((r, i) => (i < want ? evalSet : train).push(r))
  }

  const trainIds = new Set(train.map(r => r.id))
  const leaked = evalSet.filter(r => trainIds.has(r.id))
  if (leaked.length) {
    console.error(`[spec] УТЕЧКА: ${leaked.length} спеков по обе стороны`)
    process.exit(1)
  }

  await mkdir(outDir, { recursive: true })
  const jsonl = rs =>
    rs.map(r => JSON.stringify({ messages: r.messages })).join('\n') + '\n'
  await writeFile(join(outDir, 'train.jsonl'), jsonl(train))
  await writeFile(join(outDir, 'eval.jsonl'), jsonl(evalSet))
  await writeFile(
    join(outDir, 'REPORT.json'),
    JSON.stringify(
      {
        specs_dir: specsDir,
        kept: rows.length,
        skipped,
        train: train.length,
        eval: evalSet.length,
        areas: [...byArea.keys()],
        ids_eval: evalSet.map(r => r.id),
      },
      null,
      2
    )
  )

  console.log(`[spec] файлов просмотрено : ${files.length}`)
  console.log(
    `[spec] отброшено          : не IMPLEMENTED ${skipped.status}, ` +
      `без описания ${skipped.nodesc}, без module ${skipped.nocut}`
  )
  console.log(`[spec] примеров           : ${rows.length}`)
  console.log(`[spec] обучение / оценка  : ${train.length} / ${evalSet.length}`)
  console.log(`[spec] областей           : ${byArea.size}`)

  /*
   * LEAKAGE, CHECKED IN THE DIRECTION IT ACTUALLY HAPPENS.
   *
   * The first version asked "does the PROMPT contain the start of the ANSWER".
   * That is the wrong way round and it caught nothing: a mutation putting the
   * description back into the target -- the exact defect this dataset was built
   * to avoid -- passed it cleanly, because the target then began with an SPDX
   * line the prompt never had.
   *
   * The leak that matters is the reverse: the ANSWER repeating text the model
   * was just handed. That is what makes copying the cheapest way to lower the
   * loss.
   */
  const copyable = train.filter(r => {
    const ask = r.messages[1].content
    const ans = r.messages[2].content
    const desc = ask.split('\n').slice(2).join('\n').trim()
    return desc.length > 40 && ans.includes(desc.slice(0, 60))
  })
  console.log(
    `[spec] запрос содержит ответ: ${copyable.length} ` +
      `${copyable.length ? '⚠️ УТЕЧКА' : '(нет)'}`
  )

  const tiny = rows.filter(r => r.messages[2].content.length < 120)
  console.log(`[spec] подозрительно коротких ответов: ${tiny.length}`)

  /*
   * A NUMBER PRINTED AND NOT ASSERTED ON IS DECORATION.
   *
   * This script printed leakage and short-answer counts for three iterations
   * and would have exited 0 with either of them non-zero -- handing over
   * corrupted training data while reporting success.
   *
   * The same defect was found one file over: the scorer's battery displayed
   * `VALID 79%` for the references, which was the maxBuffer bug in plain sight,
   * and still concluded "прибор поверен" because the verdict only inspected a
   * different column.
   *
   * So every count this script prints now carries a claim, and a violated claim
   * is a non-zero exit.
   */
  const problems = []
  if (copyable.length)
    problems.push(`${copyable.length} запросов содержат ответ`)
  if (tiny.length) problems.push(`${tiny.length} ответов короче 120 символов`)
  if (train.length + evalSet.length !== rows.length) {
    problems.push('обучение + оценка не равны числу примеров')
  }
  if (!evalSet.length) problems.push('оценочная выборка пуста')
  if (problems.length) {
    console.error(`[spec] ⛔ ДАТАСЕТ НЕ ГОДЕН: ${problems.join('; ')}`)
    process.exit(1)
  }
}

main().catch(e => {
  console.error('[spec] не удалось:', e.message)
  process.exit(1)
})
