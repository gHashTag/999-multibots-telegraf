#!/usr/bin/env node
/**
 * HARVEST THE IGLA CODER PAIRS THAT ALREADY EXIST.
 *
 * The published dataset (`t27/dataset/igla-coder/v0.1`) holds EIGHT pairs and
 * says so plainly: "CANNOT train a working model. This is a seed, not a
 * corpus." Its own roadmap gates a real training run on v0.5 -- at least
 * 200K tokens.
 *
 * But specs in `gHashTag/t27` already have generated code committed beside
 * them from earlier codegen runs. Pairing what is already there yields
 * **35 confirmed pairs, ~346K tokens** -- the gate is passed, without running
 * the code generator even once. Measured 2026-09-08.
 *
 * The manifest is built from the git tree, which carries every blob's size, so
 * nothing is downloaded to count. Only the verification below reads bytes.
 *
 * ── THE PAIRING IS A GUESS THAT IS THEN CHECKED ───────────────────────────
 *
 * Candidates are matched BY BASENAME (`gf16.t27` <-> `gf16.v`), which is a
 * guess. Every candidate is then CONFIRMED against the `t27c` banner inside the
 * generated file itself -- see `verify` below. Unconfirmed candidates are
 * dropped and printed with the reason.
 *
 * That check is not ceremony. On the first run it removed six `AUTO-GENERATED
 * STUB` files whose bodies were `a + b  // Temporary stub`, sitting in a
 * generated directory and pairing cleanly with a real ternary-adder spec.
 *
 * Usage:
 *   node harvest-igla-pairs.mjs                  # manifest only, no downloads
 *   node harvest-igla-pairs.mjs --out ./pairs    # also fetch the file contents
 *   GITHUB_TOKEN=... node harvest-igla-pairs.mjs # lifts the 60/hour API limit
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { basename, extname, dirname, join } from 'node:path'

const REPO = process.env.IGLA_REPO || 'gHashTag/t27'
const BRANCH = process.env.IGLA_BRANCH || 'main'

/** Extensions the code generators emit. */
const GENERATED = new Set(['.v', '.zig', '.rs'])

/**
 * Directories that hold generated output rather than hand-written source.
 *
 * Without this, every `.rs` in the repository would look like a candidate and
 * the pairing would attach specs to source nobody generated.
 *
 * MATCHED AS WHOLE PATH SEGMENTS, NOT AS SUBSTRINGS. The first version of this
 * script tested `path.includes('gen')`, which matches the "gen" inside
 * "a-gen-t-runner": `specs/server/api.t27` was paired with
 * `contrib/backend/agent-runner/src/api.rs`, hand-written source that no
 * generator ever emitted. Training on that teaches the model that a spec
 * produces whatever file happens to share its name.
 */
const GENERATED_DIRS = new Set(['gen', 'bootstrap', 'build', 'out'])

/**
 * Bytes per token. An ESTIMATE, not a measurement -- the dataset has no
 * tokenizer yet (its own v0.4 milestone), so nothing here can count tokens
 * properly. 3.5 is the usual figure for source code under a byte-level BPE and
 * is quoted so the number can be re-derived rather than trusted.
 */
const BYTES_PER_TOKEN = 3.5

function headers() {
  const h = { Accept: 'application/vnd.github+json' }
  const t = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (t) h.Authorization = `Bearer ${t}`
  return h
}

async function tree() {
  const url = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) {
    throw new Error(
      `GitHub answered ${res.status} for the tree of ${REPO}. ` +
        (res.status === 403
          ? 'That is the unauthenticated rate limit -- set GITHUB_TOKEN.'
          : '')
    )
  }
  const body = await res.json()
  if (body.truncated) {
    // Silence here would produce a quietly partial corpus.
    console.warn(
      '[igla] ВНИМАНИЕ: git tree обрезано GitHub — часть файлов не видна, ' +
        'корпус будет НЕПОЛНЫМ.'
    )
  }
  return body.tree.filter(n => n.type === 'blob')
}

function isGenerated(path) {
  if (!GENERATED.has(extname(path))) return false
  return path.split('/').some(segment => GENERATED_DIRS.has(segment))
}

function build(blobs) {
  const specs = new Map()
  for (const b of blobs) {
    if (b.path.endsWith('.t27')) {
      const key = basename(b.path, '.t27')
      // Keep the LARGEST spec for a name: duplicates across directories are
      // usually a stub and the real thing.
      const prev = specs.get(key)
      if (!prev || b.size > prev.size) specs.set(key, b)
    }
  }

  const outputs = new Map()
  for (const b of blobs) {
    if (!isGenerated(b.path)) continue
    const key = basename(b.path, extname(b.path))
    const list = outputs.get(key) || []
    list.push(b)
    outputs.set(key, list)
  }

  const pairs = []
  for (const [key, files] of outputs) {
    const spec = specs.get(key)
    if (!spec) continue
    // The largest generated file for the name: a stub and a full emission can
    // share a basename, and the stub teaches nothing.
    const code = files.reduce((a, b) => (b.size > a.size ? b : a))
    pairs.push({
      pair_id: key,
      spec_path: spec.path,
      spec_bytes: spec.size,
      code_path: code.path,
      code_bytes: code.size,
      target_lang: extname(code.path).slice(1),
      other_outputs: files.filter(f => f !== code).map(f => f.path),
    })
  }
  pairs.sort((a, b) => a.pair_id.localeCompare(b.pair_id))
  return { pairs, specCount: specs.size, outputCount: outputs.size }
}

async function fetchText(path) {
  const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} для ${path}`)
  return res.text()
}

/**
 * THE GENERATOR SIGNS ITS OWN WORK -- USE THAT INSTEAD OF GUESSING.
 *
 * Every emitted file opens with a banner naming its source:
 *
 *     // Generated from .t27 spec: enrichment::audio_overview
 *     // DO NOT EDIT — generated by t27c
 *
 * That turns the basename guess into a CHECK. A file with no banner was not
 * emitted by `t27c` and does not belong in a spec->code corpus whatever its
 * path suggests.
 *
 * One request per candidate is the cheapest honesty available: the alternative
 * is training on pairs nobody confirmed.
 *
 * THREE HEADER DIALECTS, MEASURED -- do not tighten this without re-reading
 * the files. `gen-verilog` writes "Generated from t27 spec: SacredAttention"
 * (no dot, module name present); the Rust emitter writes "Generated from .t27
 * spec" with no name at all.
 *
 * The declared name is therefore RECORDED, NEVER REQUIRED TO MATCH the file
 * name: the generator names the MODULE, and `nn/attention.t27` legitimately
 * declares `SacredAttention`. Requiring equality rejected 41 of 42 real pairs
 * on the first run.
 */
const HEADER = /Generated from \.?t27 spec(?::\s*([A-Za-z0-9_:]+))?/

/**
 * A STUB IS NOT A GENERATED IMPLEMENTATION, AND IT IS THE WORST THING IN HERE.
 *
 *   // AUTO-GENERATED STUB
 *   pub fn ternary_add(a: i32, b: i32) -> i32 { a + b  // Temporary stub }
 *
 * It sits in a generated directory, carries a generated-looking banner, and
 * pairs cleanly with a real spec. Train on it and the model learns that a
 * ternary adder is integer `+` -- a confident, plausible, wrong answer, which
 * is exactly the failure a spec-driven corpus exists to prevent.
 */
const STUB = /AUTO-GENERATED STUB|Temporary stub|todo!\(\)|unimplemented!\(\)/

async function verify(pair) {
  let text
  try {
    text = await fetchText(pair.code_path)
  } catch {
    return { ...pair, verified: false, why: 'файл недоступен' }
  }
  const head = text.slice(0, 600)

  if (STUB.test(head)) {
    return { ...pair, verified: false, why: 'заглушка, а не реализация' }
  }
  const m = HEADER.exec(head)
  if (!m) return { ...pair, verified: false, why: 'нет заголовка t27c' }

  return {
    ...pair,
    verified: true,
    declared_module: m[1] || null,
    code_lines: text.split('\n').length,
  }
}

async function main() {
  const outIdx = process.argv.indexOf('--out')
  const outDir = outIdx > -1 ? process.argv[outIdx + 1] : null

  const blobs = await tree()
  const { pairs: candidates, specCount, outputCount } = build(blobs)

  const checked = []
  for (const c of candidates) checked.push(await verify(c))
  const rejected = checked.filter(p => !p.verified)
  const pairs = checked.filter(p => p.verified)

  if (rejected.length) {
    console.log(`[igla] отброшено кандидатов: ${rejected.length}`)
    for (const r of rejected.slice(0, 10)) {
      console.log(`         ${r.pair_id.padEnd(24)} ${r.why}`)
    }
  }

  const specBytes = pairs.reduce((n, p) => n + p.spec_bytes, 0)
  const codeBytes = pairs.reduce((n, p) => n + p.code_bytes, 0)
  const total = specBytes + codeBytes
  const tokens = Math.round(total / BYTES_PER_TOKEN)

  const byLang = {}
  for (const p of pairs)
    byLang[p.target_lang] = (byLang[p.target_lang] || 0) + 1

  console.log(`[igla] репозиторий      : ${REPO}@${BRANCH}`)
  console.log(`[igla] спеков .t27      : ${specCount}`)
  console.log(`[igla] имён с кодогенерацией: ${outputCount}`)
  console.log(`[igla] СОБРАНО ПАР      : ${pairs.length}`)
  console.log(`[igla] не сопоставлено  : ${outputCount - pairs.length}`)
  console.log(`[igla] по языкам        : ${JSON.stringify(byLang)}`)
  console.log(
    `[igla] объём            : ${(total / 1024).toFixed(0)} КБ ` +
      `(спеки ${(specBytes / 1024).toFixed(0)}, код ${(codeBytes / 1024).toFixed(0)})`
  )
  console.log(
    `[igla] токенов          : ~${(tokens / 1000).toFixed(0)}K ` +
      `(ОЦЕНКА при ${BYTES_PER_TOKEN} байт/токен, токенизатора у датасета нет)`
  )
  console.log(
    `[igla] порог v0.5 (>=200K): ${tokens >= 200000 ? 'ПРОЙДЕН' : 'НЕ пройден'}`
  )

  const manifest = {
    generated_by: 'harvest-igla-pairs.mjs',
    repo: `${REPO}@${BRANCH}`,
    pair_count: pairs.length,
    spec_bytes: specBytes,
    code_bytes: codeBytes,
    estimated_tokens: tokens,
    bytes_per_token_assumption: BYTES_PER_TOKEN,
    matching:
      'basename candidate, CONFIRMED against the t27c header in each file',
    pairs,
  }

  if (!outDir) {
    await writeFile(
      'igla-pairs-manifest.json',
      JSON.stringify(manifest, null, 2)
    )
    console.log(
      '[igla] записан igla-pairs-manifest.json (файлы НЕ скачивались)'
    )
    return
  }

  await mkdir(outDir, { recursive: true })
  for (const p of pairs) {
    const dir = join(outDir, 'pairs', p.pair_id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `spec.t27`), await fetchText(p.spec_path))
    await writeFile(
      join(dir, `gen.${p.target_lang}`),
      await fetchText(p.code_path)
    )
    await writeFile(join(dir, 'metadata.json'), JSON.stringify(p, null, 2))
  }
  await writeFile(
    join(outDir, 'MANIFEST.json'),
    JSON.stringify(manifest, null, 2)
  )
  console.log(`[igla] выгружено в ${outDir}/pairs (${pairs.length} пар)`)
}

main().catch(e => {
  console.error('[igla] не удалось:', e.message)
  process.exit(1)
})
