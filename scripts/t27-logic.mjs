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
 * Types: bool, u8/u16/u32, i8/i16/i32, f32/f64, and str (`[]const u8`). A
 * fn with any other type (u64, a struct) is not lowered and is named in
 * `__NOT_LOWERED__`.
 *
 * A str cannot cross the wasm boundary as a value, so it crosses as bytes
 * (#3941): the module exports an allocator (`t27__alloc` / `t27__free`, on
 * std.heap.wasm_allocator), the TypeScript door encodes each str argument as
 * UTF-8 into memory it allocated and passes (ptr, len), and the Zig export
 * rebuilds the slice. A str result is written as (ptr, len) into a fixed
 * two-u32 slot (`t27__ret_at`) and decoded with TextDecoder before the
 * arguments are freed -- every call frees what it allocated, thrown or not,
 * so repeated calls do not grow the module's memory. These helpers are
 * emitted only for a spec that has a str fn: the others stay byte-for-byte.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const NUM = new Set(['u8', 'u16', 'u32', 'i8', 'i16', 'i32', 'f32', 'f64'])
/** A spec `str`, as t27c gen writes it in Zig. */
export const STR = '[]const u8'
const LOWERED = new Set(['bool', STR, ...NUM])
const RANGE = {
  u8: [0, 255],
  u16: [0, 65535],
  u32: [0, 4294967295],
  i8: [-128, 127],
  i16: [-32768, 32767],
  i32: [-2147483648, 2147483647],
}
const camel = s => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
const tsType = t => (t === 'bool' ? 'boolean' : t === STR ? 'string' : 'number')

/**
 * The fns of the generated Zig: name, params [[name, type]], return type.
 * Any return type is read, `[]const u8` (a spec `str`) included: a fn the
 * pattern did not see would be neither lowered nor named in __NOT_LOWERED__,
 * and the host would keep its copy with no record that it must (course-outreach
 * v2, 2026-10-09: seven str fns vanished that way). A spec's `pub fn` is
 * emitted as `pub fn` (isa/ternary_encoding, 2026-10-11: the whole spec read
 * as zero fns and wrote an empty module without a word).
 */
export function zigFns(zigSrc) {
  const out = []
  for (const m of zigSrc.matchAll(
    /^(?:pub )?fn (\w+)\(([^)]*)\) ([^{\n]+?) \{/gm
  )) {
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
  const strIn = f.params.some(([, t]) => t === STR)
  const pass = f.params
    .map(([n, t]) => {
      const v = camel(n)
      if (t === 'bool') return `${v} ? 1 : 0`
      if (t === STR) return `...str(${v}, held, '${f.name}.${n}')`
      if (RANGE[t])
        return `int(${v}, ${RANGE[t][0]}, ${RANGE[t][1]}, '${f.name}.${n}')`
      return v
    })
    .join(', ')
  const head = `/** spec fn ${f.name} */\nexport function ${camel(f.name)}(${args}): ${tsType(f.ret)} {\n`
  if (f.ret === STR) {
    // The result is read from the slot before strCall frees the arguments:
    // a body may return a slice of its own argument.
    const call = `(W.t27_${f.name} as (...a: number[]) => void)(${pass})`
    if (!strIn) return `${head}  ${call}\n  return strOut()\n}`
    return `${head}  return strCall(held => {\n    ${call}\n    return strOut()\n  })\n}`
  }
  const call = `(W.t27_${f.name} as (...a: number[]) => number)(${pass})`
  const ret =
    f.ret === 'bool'
      ? `${call} !== 0`
      : f.ret.startsWith('u')
        ? `${call} >>> 0`
        : call
  if (strIn) return `${head}  return strCall(held => ${ret})\n}`
  return `${head}  return ${ret}\n}`
}

/** The Zig export that forwards to one spec fn: a str crosses as (ptr, len). */
export function zigExport(f) {
  const params = f.params
    .map(([n, t]) => (t === STR ? `${n}__p: u32, ${n}__n: u32` : `${n}: ${t}`))
    .join(', ')
  const args = f.params
    .map(([n, t]) => (t === STR ? `t27__in(${n}__p, ${n}__n)` : n))
    .join(', ')
  if (f.ret === STR)
    return `export fn t27_${f.name}(${params}) void { t27__out(${f.name}(${args})); }`
  return `export fn t27_${f.name}(${params}) ${f.ret} { return ${f.name}(${args}); }`
}

/** The str boundary in Zig: the module's allocator and the result slot. */
const ZIG_STR = [
  '// t27-logic str boundary: a str crosses as (ptr, len) in this memory',
  'var t27__ret: [2]u32 = .{ 0, 0 };',
  'export fn t27__alloc(n: u32) u32 {',
  '    const b = @import("std").heap.wasm_allocator.alloc(u8, @max(n, 1)) catch return 0;',
  '    return @intCast(@intFromPtr(b.ptr));',
  '}',
  'export fn t27__free(p: u32, n: u32) void {',
  '    const b: [*]u8 = @ptrFromInt(p);',
  '    @import("std").heap.wasm_allocator.free(b[0..@max(n, 1)]);',
  '}',
  'export fn t27__ret_at() u32 {',
  '    return @intCast(@intFromPtr(&t27__ret));',
  '}',
  'fn t27__in(p: u32, n: u32) []const u8 {',
  '    const b: [*]const u8 = @ptrFromInt(p);',
  '    return b[0..n];',
  '}',
  'fn t27__out(s: []const u8) void {',
  '    t27__ret = .{ @intCast(@intFromPtr(s.ptr)), @intCast(s.len) };',
  '}',
].join('\n')

/** The same boundary on the TypeScript side. */
const TS_STR = [
  'const MEM = W.memory as WebAssembly.Memory',
  'const UTF8_IN = new TextEncoder()',
  'const UTF8_OUT = new TextDecoder()',
  '',
  '/**',
  " * A spec str crosses into wasm as UTF-8 bytes at (ptr, len) in the module's",
  ' * memory, allocated for one call and freed by strCall after it. Anything',
  ' * but a string is a thrown error, never a coerced value.',
  ' */',
  'function str(v: string, held: number[], at: string): [number, number] {',
  "  if (typeof v !== 'string')",
  '    throw new TypeError(`${at}: ${typeof v} is not a str`)',
  '  const bytes = UTF8_IN.encode(v)',
  '  const ptr = (W.t27__alloc as (n: number) => number)(bytes.length) >>> 0',
  '  if (ptr === 0)',
  '    throw new RangeError(`${at}: no wasm memory for ${bytes.length} bytes`)',
  '  held.push(ptr, bytes.length)',
  '  // Read MEM.buffer after the allocation: growing memory replaces it.',
  '  new Uint8Array(MEM.buffer, ptr, bytes.length).set(bytes)',
  '  return [ptr, bytes.length]',
  '}',
  '',
  '/** One call; the str arguments it allocated are freed after it, thrown or not. */',
  'function strCall<T>(call: (held: number[]) => T): T {',
  '  const held: number[] = []',
  '  try {',
  '    return call(held)',
  '  } finally {',
  '    for (let i = 0; i < held.length; i += 2)',
  '      (W.t27__free as (p: number, n: number) => void)(held[i], held[i + 1])',
  '  }',
  '}',
  '',
  '/** The str a call returned, as (ptr, len) in the slot t27__ret_at points to. */',
  'function strOut(): string {',
  '  const at = (W.t27__ret_at as () => number)() >>> 0',
  '  const slot = new DataView(MEM.buffer)',
  '  const ptr = slot.getUint32(at, true)',
  '  const len = slot.getUint32(at + 4, true)',
  '  return UTF8_OUT.decode(new Uint8Array(MEM.buffer, ptr, len))',
  '}',
  '',
]

function main() {
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
  const spec = readFileSync(source, 'utf8')
  const hash = createHash('sha256').update(spec).digest('hex')
  const dir = mkdtempSync(join(tmpdir(), 't27-logic-'))
  const zigSrc = execFileSync(t27c, ['gen', source], { encoding: 'utf8' })
  const fns = zigFns(zigSrc)
  const declared = (spec.match(/^\s*(?:pub\s+)?fn\s+\w+/gm) || []).length
  if (declared > 0 && fns.length === 0) {
    console.error(
      `${source} declares ${declared} fn(s) but none was read from the generated Zig; nothing written`
    )
    process.exit(1)
  }
  const lowered = fns.filter(
    f => LOWERED.has(f.ret) && f.params.every(([, t]) => LOWERED.has(t))
  )
  const skipped = fns.filter(f => !lowered.includes(f)).map(f => f.name)
  const usesStr = lowered.some(
    f => f.ret === STR || f.params.some(([, t]) => t === STR)
  )
  const exportsZig = [
    ...(usesStr ? [ZIG_STR] : []),
    ...lowered.map(zigExport),
  ].join('\n')
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
    ...(usesStr ? TS_STR : []),
    ...lowered.map(door).flatMap(d => [d, '']),
    `/** Spec fns this backend could not lower (types outside bool/ints/floats/str). */`,
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
