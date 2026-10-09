#!/usr/bin/env node
/**
 * THE SPEC'S LOGIC, EXECUTED -- NOT RETYPED.
 *
 * Owner, 2026-10-09: "write the logic in .t27 and in no other way" and
 * "forbid writing new logic in the bot in any language but .t27". Until this
 * script, a spec's `fn` reached the host only as a hand-written mirror pinned
 * by the spec's test vectors: `t27c gen-ts` and `gen-js` lower declarations,
 * not bodies (t27#6559), and the body lowering in t27c (t27#7872) cannot merge.
 *
 * The compiler's Zig backend (`t27c gen`) DOES lower bodies. So:
 *
 *   spec.t27 --t27c gen--> spec.zig --zig (wasm32)--> spec.wasm
 *            --this script--> <id>.logic.ts (wasm inlined, typed wrappers)
 *
 * The host imports `mayAssign` from `<id>.logic.ts` and calls the spec's own
 * compiled body. What this script adds is machinery only: one `export fn`
 * per spec `fn` that forwards to it (same file, so Zig lets it), and a typed
 * TypeScript door per export. No rule is written here.
 *
 *   node scripts/t27-logic.mjs <t27 checkout> <kind/id> --out=<spec dir>
 *
 * Needs `t27c` (the checkout's release build, or T27C) and Zig 0.16 (on PATH,
 * or T27_ZIG_DIR). The logic file records the sha256 of the spec it came
 * from; scripts/check-t27-specs.mjs (law `logic-hash`) fails when the vendored
 * spec moves on without the logic being regenerated -- offline, no Zig needed.
 *
 * Types: bool, u8/u16/u32, i8/i16/i32, f32/f64. A fn with any other type
 * (str, u64, a struct) is not lowered and is named in `__NOT_LOWERED__`.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const [t27Dir, specId, ...rest] = process.argv.slice(2)
const outArg = rest.find(a => a.startsWith('--out='))?.slice('--out='.length)
if (!t27Dir || !specId || !outArg) {
  console.error(
    'usage: t27-logic.mjs <t27 checkout> <kind/id> --out=<spec dir>'
  )
  process.exit(2)
}
const source = join(t27Dir, 'specs', `${specId}.t27`)
if (!existsSync(source)) {
  console.error(`no spec at ${source}`)
  process.exit(2)
}
const local = join(t27Dir, 'target', 'release', 't27c')
const t27c = process.env.T27C || (existsSync(local) ? local : 't27c')
const zig = process.env.T27_ZIG_DIR
  ? join(process.env.T27_ZIG_DIR, 'zig')
  : 'zig'

const NUM = new Set(['u8', 'u16', 'u32', 'i8', 'i16', 'i32', 'f32', 'f64'])
const LOWERED = new Set(['bool', ...NUM])
const RANGE = {
  u8: [0, 255],
  u16: [0, 65535],
  u32: [0, 4294967295],
  i8: [-128, 127],
  i16: [-32768, 32767],
  i32: [-2147483648, 2147483647],
}
const camel = s => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
const tsType = t => (t === 'bool' ? 'boolean' : 'number')

/** The fns of the generated Zig: name, params [[name, type]], return type. */
export function zigFns(zigSrc) {
  const out = []
  for (const m of zigSrc.matchAll(/^fn (\w+)\(([^)]*)\) (\w+) \{/gm)) {
    const [, name, params, ret] = m
    if (name.startsWith('__') || name === 'assert_eq') continue
    const ps = params
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => p.split(':').map(x => x.trim()))
    out.push({ name, params: ps, ret })
  }
  return out
}

/** The TypeScript door: argument checks, the wasm call, the typed result. */
export function door(f) {
  const args = f.params.map(([n, t]) => `${camel(n)}: ${tsType(t)}`).join(', ')
  const pass = f.params
    .map(([n, t]) => {
      const v = camel(n)
      if (t === 'bool') return `${v} ? 1 : 0`
      if (RANGE[t])
        return `int(${v}, ${RANGE[t][0]}, ${RANGE[t][1]}, '${f.name}.${n}')`
      return v
    })
    .join(', ')
  const call = `(W.t27_${f.name} as (...a: number[]) => number)(${pass})`
  const ret =
    f.ret === 'bool'
      ? `${call} !== 0`
      : f.ret.startsWith('u')
        ? `${call} >>> 0`
        : call
  return `/** spec fn ${f.name} */\nexport function ${camel(f.name)}(${args}): ${tsType(f.ret)} {\n  return ${ret}\n}`
}

function main() {
  const spec = readFileSync(source, 'utf8')
  const hash = createHash('sha256').update(spec).digest('hex')
  const dir = mkdtempSync(join(tmpdir(), 't27-logic-'))
  const zigSrc = execFileSync(t27c, ['gen', source], { encoding: 'utf8' })
  const fns = zigFns(zigSrc)
  const lowered = fns.filter(
    f => LOWERED.has(f.ret) && f.params.every(([, t]) => LOWERED.has(t))
  )
  const skipped = fns.filter(f => !lowered.includes(f)).map(f => f.name)
  const exportsZig = lowered
    .map(
      f =>
        `export fn t27_${f.name}(${f.params.map(([n, t]) => `${n}: ${t}`).join(', ')}) ${f.ret} { return ${f.name}(${f.params.map(([n]) => n).join(', ')}); }`
    )
    .join('\n')
  writeFileSync(
    join(dir, 'spec.zig'),
    `${zigSrc}\n// t27-logic exports\n${exportsZig}\n`
  )
  execFileSync(
    zig,
    [
      'build-exe',
      'spec.zig',
      '-target',
      'wasm32-freestanding',
      '-fno-entry',
      '-rdynamic',
      '-O',
      'ReleaseSmall',
      '-femit-bin=spec.wasm',
    ],
    { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] }
  )
  const wasm = readFileSync(join(dir, 'spec.wasm')).toString('base64')
  const zigVersion = execFileSync(zig, ['version'], { encoding: 'utf8' }).trim()
  const name = basename(specId)
  const needsInt = lowered.some(f => f.params.some(([, t]) => RANGE[t]))
  const file = [
    `// Generated by scripts/t27-logic.mjs from ${name}.t27. Do not edit.`,
    '//',
    "// The spec's own fn bodies, compiled: t27c gen (Zig) -> zig " +
      zigVersion +
      ' (wasm32).',
    '// Change the spec in gHashTag/t27, vendor it, regenerate. A rule written',
    '// by hand beside this file is the thing this file exists to end.',
    `// spec-sha256: ${hash}`,
    '/* eslint-disable */',
    '',
    `const WASM = '${wasm}'`,
    '',
    'const W = new WebAssembly.Instance(',
    '  new WebAssembly.Module(Uint8Array.from(atob(WASM), c => c.charCodeAt(0)))',
    ').exports as Record<string, unknown>',
    '',
    ...(needsInt
      ? [
          "/** An integer the spec's type can hold, or a thrown error: never a wrapped value. */",
          'function int(v: number, lo: number, hi: number, at: string): number {',
          '  if (!Number.isInteger(v) || v < lo || v > hi)',
          '    throw new RangeError(`${at}: ${v} is outside ${lo}..${hi}`)',
          '  return v',
          '}',
          '',
        ]
      : []),
    ...lowered.map(door).flatMap(d => [d, '']),
    `/** Spec fns this backend could not lower (types outside bool/ints/floats). */`,
    `export const __NOT_LOWERED__ = Object.freeze(${JSON.stringify(skipped)})`,
    '',
  ].join('\n')
  const out = join(resolve(outArg), `${name}.logic.ts`)
  writeFileSync(out, file)
  console.log(
    `wrote ${out}: ${lowered.length} fns lowered, ${skipped.length} not`
  )
}

if (import.meta.url === `file://${process.argv[1]}`) main()
