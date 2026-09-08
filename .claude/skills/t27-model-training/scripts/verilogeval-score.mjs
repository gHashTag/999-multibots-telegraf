#!/usr/bin/env node
/**
 * SCORE VERILOG AGAINST VerilogEval v2 -- BY SIMULATION, NOT BY RESEMBLANCE.
 *
 * `dakies/nvlabs-verilogeval-v2-spec-to-rtl` is 156 problems under MIT whose
 * task is literally specification -> RTL, which is ours. Every problem carries
 * a TESTBENCH, so correctness is a compile-and-run fact rather than a
 * similarity score.
 *
 * That matters more than it sounds. Text similarity to the reference rewards a
 * model for imitating one particular solution; a testbench rewards it for being
 * right. Two correct modules can share almost no tokens.
 *
 * ── WHY THIS EXISTS BEFORE ANY TRAINING ───────────────────────────────────
 *
 * Our own eval set is seven pairs. Seven cannot separate a good adapter from a
 * bad one -- one lucky example moves the score by 14 points. Nothing should be
 * trained until the instrument that will judge it has itself been checked.
 *
 * ── THE SELF-TEST IS THE POINT ────────────────────────────────────────────
 *
 * Run with `--self-test` and the harness scores the benchmark's OWN reference
 * solutions. They must nearly all pass. A reference that "fails" is a defect in
 * this harness -- wrong module renaming, wrong iverilog flags, a missed
 * success marker -- and finding it that way costs nothing, whereas finding it
 * after a training run means re-reading every number.
 *
 * Requires `iverilog` on PATH. Nothing is installed by this script.
 */

import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const run = promisify(execFile)

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : fallback
}

/**
 * The testbench compares `TopModule` against `RefModule`, so a candidate must
 * be named TopModule and the reference must keep its own name. When scoring the
 * references themselves (the self-test) the module has to be RENAMED, or
 * iverilog sees two modules called RefModule and refuses to elaborate.
 */
function asTopModule(verilog) {
  return verilog.replace(/\bmodule\s+RefModule\b/, 'module TopModule')
}

/**
 * REMOVE THE WAVEFORM DUMP, OR NOTHING ELABORATES UNDER ICARUS.
 *
 * Every testbench opens with:
 *
 *     initial begin
 *       $dumpfile("wave.vcd");
 *       $dumpvars(1, stim1.clk, tb_mismatch, ...);
 *     end
 *
 * and `tb_mismatch` is declared five lines LATER. Commercial simulators accept
 * that forward reference; iverilog refuses with "Unable to bind wire/reg/memory
 * `tb_mismatch`" and every single problem fails at compile -- which is exactly
 * what the self-test reported on the first run, all 12 of 12.
 *
 * So the benchmark is not wrong and neither is the harness: the simulator is
 * stricter than the benchmark assumes. Dropping the dump block changes what is
 * RECORDED, never what is CHECKED -- the verdict comes from `tb_match` and the
 * mismatch counter, both untouched.
 *
 * Stated loudly because modifying a benchmark's own testbench is exactly the
 * kind of quiet edit that makes a score incomparable with everyone else's. This
 * one is safe; the next one might not be.
 */
function stripWaveformDump(testbench) {
  return testbench.replace(
    /initial\s+begin\s*\$dumpfile\s*\([^)]*\)\s*;\s*\$dumpvars\s*\([^)]*\)\s*;\s*end/gs,
    ''
  )
}

/**
 * The testbench prints a marker rather than setting an exit code.
 *
 * `define OK 12 / `define INCORRECT 13 in the benchmark's own testbenches, and
 * the summary line reports mismatches. Treating a zero exit code as success
 * would score a run that compiled and proved nothing.
 */
function verdict(stdout) {
  const mismatch = /Mismatches:\s*(\d+)\s+in\s+(\d+)\s+samples/i.exec(stdout)
  if (mismatch) {
    return { ok: Number(mismatch[1]) === 0, detail: mismatch[0] }
  }
  if (/ALL TESTS PASSED/i.test(stdout))
    return { ok: true, detail: 'all passed' }
  // No marker at all: the bench ran but said nothing we understand. That is
  // NOT a pass -- silence has to read as failure or the score inflates.
  return { ok: false, detail: 'нет маркера результата в выводе' }
}

async function scoreOne(problem, candidate) {
  const dir = await mkdtemp(join(tmpdir(), 'veval-'))
  try {
    const src = join(dir, 'dut.v')
    const tb = join(dir, 'tb.v')
    const ref = join(dir, 'ref.v')
    const out = join(dir, 'a.out')
    await writeFile(src, candidate)
    await writeFile(ref, problem.ref)
    await writeFile(tb, stripWaveformDump(problem.test))
    try {
      await run('iverilog', ['-g2012', '-o', out, src, ref, tb], {
        timeout: 60_000,
      })
    } catch (e) {
      return {
        ok: false,
        stage: 'compile',
        detail: String(e.stderr || e).slice(0, 200),
      }
    }
    try {
      const { stdout } = await run('vvp', [out], { timeout: 60_000 })
      const v = verdict(stdout)
      return { ok: v.ok, stage: 'run', detail: v.detail }
    } catch (e) {
      return {
        ok: false,
        stage: 'run',
        detail: String(e.stderr || e).slice(0, 200),
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function main() {
  const benchPath = arg('--bench', 'verilogeval.json')
  const selfTest = process.argv.includes('--self-test')
  const limit = Number(arg('--limit', '0'))
  const candidatesPath = arg('--candidates', null)

  const bench = JSON.parse(await readFile(benchPath, 'utf8'))
  const problems = limit ? bench.slice(0, limit) : bench

  let candidates = null
  if (!selfTest) {
    if (!candidatesPath) {
      console.error(
        'Нужен --candidates <файл.jsonl> с {problem_id, verilog}, ' +
          'или --self-test для проверки самого прибора.'
      )
      process.exit(2)
    }
    candidates = new Map()
    const text = await readFile(candidatesPath, 'utf8')
    for (const line of text.split('\n').filter(Boolean)) {
      const r = JSON.parse(line)
      candidates.set(r.problem_id, r.verilog)
    }
  }

  let pass = 0
  let missing = 0
  const failures = []
  for (const p of problems) {
    const cand = selfTest ? asTopModule(p.ref) : candidates.get(p.problem_id)
    if (cand == null) {
      missing++
      failures.push({ id: p.problem_id, stage: 'нет ответа', detail: '' })
      continue
    }
    const r = await scoreOne(p, cand)
    if (r.ok) pass++
    else failures.push({ id: p.problem_id, stage: r.stage, detail: r.detail })
  }

  const total = problems.length
  console.log(`[veval] задач        : ${total}`)
  console.log(
    `[veval] прошло       : ${pass}  (${((pass / total) * 100).toFixed(1)}%)`
  )
  if (missing) console.log(`[veval] без ответа   : ${missing}`)
  if (failures.length) {
    console.log(`[veval] не прошло    : ${failures.length}`)
    for (const f of failures.slice(0, 12)) {
      console.log(
        `         ${f.id.padEnd(30)} ${f.stage}: ${f.detail.slice(0, 70)}`
      )
    }
  }
  if (selfTest && pass / total < 0.95) {
    console.log(
      `[veval] ⚠️  САМОПРОВЕРКА НЕ СОШЛАСЬ. Эталонные решения обязаны ` +
        `проходить свой же стенд; значит сломан ПРИБОР, а не решения. ` +
        `Чинить его до любых замеров модели.`
    )
    process.exit(1)
  }
}

main().catch(e => {
  console.error('[veval] не удалось:', e.message)
  process.exit(1)
})
