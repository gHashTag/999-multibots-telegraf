#!/usr/bin/env node
/**
 * DOES OUR OWN TRAINING DATA COMPILE?
 *
 * Measured 2026-09-08: of 31 generated Verilog files in the harvested corpus,
 * TWO compile. The rest are not Verilog.
 *
 * The generator emits a transliteration of the spec rather than synthesizable
 * RTL. The failures are not typos, they are whole constructs carried over:
 *
 *     reg [31:0] freq = pow(constants::PHI, freq_exponent);
 *
 * `constants::PHI` is a t27 namespace, not a Verilog one; `pow`/`cos`/`sin` are
 * spec-level maths with no hardware meaning; declarations sit inside `while`
 * blocks where Verilog does not allow them. Six files go further and leak Zig
 * outright -- `@as`, `@intCast`, `[32]u16{...}`, `0x` literals.
 *
 * ── WHY THIS MATTERS MORE THAN THE PAIR COUNT ─────────────────────────────
 *
 * It is the stub trap at scale. Six `AUTO-GENERATED STUB` files were caught and
 * dropped because they would have taught that a ternary adder is integer plus.
 * These 29 teach something worse and quieter: that plausible-looking Verilog
 * which never compiles is an acceptable answer.
 *
 * And it inverts the plan. "Run the generator over the remaining 458 specs" was
 * the main lever for corpus size. Run today it multiplies non-compiling data.
 * The generator has to produce compilable output FIRST; only then is more of it
 * worth having.
 *
 * ── THE GATE ──────────────────────────────────────────────────────────────
 *
 * A pair earns its place by compiling, not by existing. This script is the
 * gate; it changes no data and only reports, so the number can be re-checked
 * as the generator improves rather than remembered from a report.
 *
 * Needs `iverilog` on PATH for Verilog. Rust pairs are reported but not
 * compiled -- `rustc` here would need the crate's dependencies, which is a
 * bigger promise than this script should make.
 */

import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const run = promisify(execFile)
const REPO = process.env.IGLA_REPO || 'gHashTag/t27'
const BRANCH = process.env.IGLA_BRANCH || 'main'

/** Constructs that are not Verilog at all, kept apart from ordinary errors. */
const ZIG = /@(as|intCast|import|sizeOf|truncate)\b|\[\d+\]u\d+\{/
/** t27 namespaces and spec-level maths carried into the output verbatim. */
const SPEC_LEAK = /\b\w+::\w+|(?<![\w.])(pow|cos|sin|sqrt|log)\s*\(/

/**
 * COMPILING IS NOT THE SAME AS CONTAINING ANYTHING.
 *
 * The first version of this audit reported "2 of 31 compile" and treated those
 * two as the usable corpus. Reading them killed that: both are shells.
 *
 *     function [31:0] get_golden_ratio; // -> f64
 *         // TODO: implement
 *     endfunction
 *
 * The generator marks them itself. `// TODO: implement` is in the output.
 *
 * A function with no body, no arguments and no return assignment. `constants.v`
 * carries thirteen `const` declarations in its spec and emits ZERO parameters.
 * It compiles precisely BECAUSE it is empty.
 *
 * So the audit had a false pass of its own -- the same defect class it was
 * written to find. An empty module is worse than a broken one for training: a
 * broken file is at least rejected, while an empty one looks like a clean
 * example and teaches the model to answer with nothing.
 */
/**
 * THE GENERATOR MARKS ITS OWN HOLES -- USE THAT, NOT A CLEVER REGEX.
 *
 * A structural detector was tried first: count `function ... endfunction` pairs
 * with nothing between them. It kept missing, because the gap is not empty --
 * it holds a comment:
 *
 *     function [31:0] get_golden_ratio; // -> f64
 *         // TODO: implement
 *     endfunction
 *
 * Three regex revisions later the honest answer was sitting in the output all
 * along. `TODO: implement` is written by the generator, is unambiguous, and
 * cannot drift the way a hand-tuned pattern does. Four of 31 files carry it.
 *
 * The lesson is the one this whole file is about: when a measurement will not
 * fire, look at what the thing being measured actually says about itself
 * before making the instrument cleverer.
 */
const UNIMPLEMENTED = /TODO:\s*implement/i

function bodyless(code) {
  return UNIMPLEMENTED.test(code)
}

async function fetchText(path) {
  const res = await fetch(
    `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`
  )
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.text()
}

async function compiles(code) {
  const dir = await mkdtemp(join(tmpdir(), 'igla-audit-'))
  try {
    const f = join(dir, 'm.v')
    await writeFile(f, code)
    await run('iverilog', ['-g2012', '-o', join(dir, 'a.out'), f], {
      timeout: 60_000,
    })
    return { ok: true }
  } catch (e) {
    const err = String(e.stderr || e)
    const first =
      err.split('\n').find(l => /error|syntax error/.test(l)) || 'неизвестно'
    return { ok: false, first: first.replace(/^.*\/m\.v/, 'строка') }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function main() {
  const manifest = JSON.parse(
    await readFile(process.argv[2] || 'igla-pairs-manifest.json', 'utf8')
  )
  const pairs = manifest.pairs

  let ok = 0
  const broken = []
  let zig = 0
  let leak = 0
  let rust = 0
  let hollow = 0

  for (const p of pairs) {
    if (p.target_lang !== 'v') {
      rust++
      continue
    }
    let code
    try {
      code = await fetchText(p.code_path)
    } catch {
      broken.push({ id: p.pair_id, why: 'не скачался' })
      continue
    }
    if (ZIG.test(code)) zig++
    if (SPEC_LEAK.test(code)) leak++
    const r = await compiles(code)
    if (r.ok) {
      if (bodyless(code)) {
        hollow++
        broken.push({
          id: p.pair_id,
          why: 'СОБИРАЕТСЯ, НО ПУСТ: функции без тела',
        })
      } else ok++
    } else broken.push({ id: p.pair_id, why: r.first.slice(0, 74) })
  }

  const verilog = pairs.filter(p => p.target_lang === 'v').length
  console.log(`[audit] Verilog-пар      : ${verilog}`)
  console.log(`[audit] ГОДНЫХ (собирается И не пуст): ${ok}`)
  console.log(`[audit] пустых оболочек  : ${hollow}`)
  console.log(`[audit] не компилируется : ${broken.length}`)
  console.log(`[audit] с протечкой Zig  : ${zig}`)
  console.log(`[audit] с t27-namespace/математикой спека: ${leak}`)
  console.log(`[audit] Rust-пар (не собирались здесь)   : ${rust}`)
  for (const b of broken.slice(0, 10)) {
    console.log(`         ${b.id.padEnd(24)} ${b.why}`)
  }
  if (ok < verilog) {
    console.log(
      `[audit] ⚠️  ОБУЧАТЬ НА ЭТОМ НЕЛЬЗЯ. Некомпилируемый код учит модель, ` +
        `что правдоподобный несобирающийся Verilog — приемлемый ответ. ` +
        `Сначала генератор, потом корпус.`
    )
  }
}

main().catch(e => {
  console.error('[audit] не удалось:', e.message)
  process.exit(1)
})
