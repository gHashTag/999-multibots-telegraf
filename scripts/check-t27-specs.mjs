#!/usr/bin/env node
/**
 * SPECS OF RECORD, CHECKED STRICTLY.
 *
 * Owner, 2026-09-27: "make the specs the standard by default; create skills
 * and scripts where .t27 is checked strictly". t27 is the language this
 * project is being rewritten in. A vertical is on that road when its numbers
 * live in a .t27 spec in gHashTag/t27, the spec is vendored into the host
 * beside its `t27c gen-ts` output, the host IMPORTS the numbers, and a test
 * runs the spec's own vectors against the host. This script is the part of
 * that which a machine can hold, for every vendored spec at once, so nobody
 * has to remember it.
 *
 * WITHOUT a compiler (pre-commit, CI, `bun run verify`):
 *   ascii          the spec is ASCII only (t27 law)
 *   footer         `phi^2 + 1/phi^2 = 3 | TRINITY` in the header, and as the last line
 *   header-path    line 2 names the spec's path in gHashTag/t27
 *   module         one `module <kind>::<id>` agreeing with KIND and ID
 *   frame          KIND, ID, REPO ("999-multibots-telegraf") and VERSION are declared
 *   braced-tests   every `test "..."` opens a brace; at least one test; each asserts
 *   gen-header     the generated file says it is the compiler's, from this spec
 *   gen-values     every `pub const` has the same value in the generated file
 *   gen-extra      the generated file declares nothing else and left nothing out
 *   gen-ignored    the generated file is in .prettierignore (the compiler's bytes)
 *   binding-test   <id>.test.ts sits beside it and imports ./<id>.gen
 *   binding-titles every spec `test` title appears in that test, word for word
 *   host-imports   some host file imports the generated module (bound, not just kept)
 *   restated       a host file bound to the spec restates none of its values
 *   cited          every spec a code comment cites is bound, or named in the
 *                  manifest (scripts/t27-specs.json) as known debt
 *
 * WITH a t27 checkout (`--t27 <dir>`), also:
 *   t27-same       the vendored copy is byte-identical to the checkout's
 *   t27c-gen       `t27c gen-ts` of it is byte-identical to the generated file
 *   ratchet        every spec in the checkout whose REPO is this repo is bound or
 *                  listed as unbound; a listed one that got bound, or vanished,
 *                  must leave the list -- the list only shrinks
 * and with `--run`, `t27c test-report` of each vendored spec (needs zig on PATH).
 *
 * Exit: 0 clean, 1 a law broken, 2 could not judge (a named input missing).
 *
 *   node scripts/check-t27-specs.mjs
 *   node scripts/check-t27-specs.mjs --t27 ../t27 [--run]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const FOOTER = 'phi^2 + 1/phi^2 = 3 | TRINITY'
export const REPO = '999-multibots-telegraf'
/** Every spec has these; a host may well have its own VERSION. */
const FRAME = ['KIND', 'ID', 'REPO', 'VERSION']
const CITE = /specs\/([a-z0-9_-]+(?:\/[a-z0-9_.-]+)+)\.t27/g

// ---- parsing ------------------------------------------------------------------

/** `pub const NAME : TYPE = VALUE;` as values, in declaration order. */
export function specConsts(text) {
  const out = new Map()
  // A string literal is read whole: a `;` inside it does not end the const.
  const re =
    /^\s*pub const (\w+)\s*:\s*(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]+?)\s*;/gm
  for (const [, name, type, raw] of text.matchAll(re)) {
    const v = raw.trim()
    let value
    try {
      value =
        type === 'str'
          ? JSON.parse(v)
          : type === 'bool'
            ? v === 'true'
            : Number(v)
    } catch {
      value = v
    }
    out.set(name, value)
  }
  return out
}

/** The `test "..."` blocks: title, the line that opens it, and its body. */
export function specTests(text) {
  const lines = text.split('\n')
  const tests = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*test\s+"([^"]*)"\s*(.*)$/.exec(lines[i])
    if (!m) continue
    const braced = m[2].trim() === '{'
    let body = ''
    if (braced) {
      let depth = 1
      for (let j = i + 1; j < lines.length && depth > 0; j++) {
        for (const ch of lines[j]) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0
        body += lines[j] + '\n'
      }
    }
    tests.push({ title: m[1], line: i + 1, braced, body })
  }
  return tests
}

/** `export const NAME = <literal> satisfies T;` of a gen-ts file, and its lists. */
export function genModule(text) {
  const consts = new Map()
  const re = /^export const (\w+) = (.+?) satisfies \w+;$/gm
  for (const [, name, raw] of text.matchAll(re))
    consts.set(name, JSON.parse(raw))
  const list = name => {
    const m = new RegExp(
      `^export const ${name} = (?:Object\\.freeze\\()?(\\[.*?\\]) as const`,
      'm'
    ).exec(text)
    return m ? JSON.parse(m[1]) : null
  }
  return {
    header: text.split('\n', 1)[0],
    consts,
    declOrder: list('__DECL_ORDER__'),
    structOrder: list('__STRUCT_ORDER__'),
    notEmitted: list('__NOT_EMITTED__'),
  }
}

/** A string or number literal as its value, or undefined when it is not one. */
function literal(raw) {
  const v = raw
    .trim()
    .replace(/;$/, '')
    .replace(/ as const$/, '')
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  const q = /^(['"`])([^'"`\\$]*)\1$/.exec(v)
  return q ? q[2] : undefined
}

// ---- the laws of one vendored spec -------------------------------------------------

/**
 * Every law that needs no compiler, over texts only (tests build fixtures).
 * `hostFiles`: [{ path, text }] of the host's own code, tests excluded.
 */
export function checkSpec({
  file,
  spec,
  gen,
  test,
  hostFiles = [],
  ignore = '',
}) {
  const bad = []
  const say = (law, what) => bad.push({ spec: file, law, what })
  const lines = spec.split('\n')
  const consts = specConsts(spec)
  const id = consts.get('ID')

  const nonAscii = [...spec].findIndex(c => c.charCodeAt(0) > 0x7f)
  if (nonAscii >= 0) say('ascii', `a non-ASCII character at offset ${nonAscii}`)
  const head = lines.slice(
    0,
    lines.findIndex(l => !l.startsWith('//'))
  )
  if (!head.some(l => l.includes(FOOTER)))
    say('footer', 'the header block does not carry the TRINITY line')
  const last = lines.filter(l => l.trim()).pop() ?? ''
  if (last.trim() !== `// ${FOOTER}`)
    say('footer', `the last line is not "// ${FOOTER}"`)
  const pathLine = /^\/\/ specs\/([a-z0-9_/-]+)\.t27\b/.exec(lines[1] ?? '')
  if (!pathLine) say('header-path', 'line 2 does not name specs/<path>.t27')
  else if (basename(pathLine[1]) !== basename(file, '.t27'))
    say(
      'header-path',
      `line 2 names ${pathLine[1]}, the file is ${basename(file)}`
    )

  for (const f of FRAME) if (!consts.has(f)) say('frame', `no pub const ${f}`)
  if (consts.has('REPO') && consts.get('REPO') !== REPO)
    say('frame', `REPO is "${consts.get('REPO')}", not "${REPO}"`)
  if (
    consts.has('VERSION') &&
    !(Number.isInteger(consts.get('VERSION')) && consts.get('VERSION') >= 1)
  )
    say('frame', 'VERSION is not a whole number from 1')
  if (id !== undefined && id !== basename(file, '.t27'))
    say('frame', `ID "${id}" is not the file name`)
  const modules = [...spec.matchAll(/^module\s+(\w+)::(\w+)\s*\{/gm)]
  if (modules.length !== 1)
    say('module', `${modules.length} module declarations`)
  else if (consts.has('KIND') && id) {
    const [, kind, name] = modules[0]
    if (kind !== consts.get('KIND') || name !== String(id).replace(/-/g, '_'))
      say('module', `module ${kind}::${name} does not agree with KIND and ID`)
  }

  const tests = specTests(spec)
  if (!tests.length) say('braced-tests', 'the spec has no test')
  for (const t of tests) {
    if (!t.braced)
      say('braced-tests', `line ${t.line}: test "${t.title}" opens no brace`)
    else if (!/\bassert\s*\(/.test(t.body))
      say('braced-tests', `line ${t.line}: test "${t.title}" asserts nothing`)
  }

  if (gen === null) say('gen-header', 'no generated module beside the spec')
  else {
    const g = genModule(gen)
    const want = `// Generated by \`t27c gen-ts\` from ${basename(file)}. Do not edit.`
    if (g.header !== want) say('gen-header', `the first line is not "${want}"`)
    for (const [name, value] of consts) {
      if (!g.consts.has(name))
        say('gen-values', `${name} is missing from the generated module`)
      else if (g.consts.get(name) !== value)
        say(
          'gen-values',
          `${name} is ${JSON.stringify(g.consts.get(name))} there, ${JSON.stringify(value)} in the spec`
        )
    }
    const declared = (g.declOrder ?? []).filter(
      n => !(g.structOrder ?? []).includes(n)
    )
    if (JSON.stringify(declared) !== JSON.stringify([...consts.keys()]))
      say(
        'gen-extra',
        'the declared names are not the spec constants, in order'
      )
    if (!g.notEmitted || g.notEmitted.length)
      say('gen-extra', 'the compiler left declarations out (__NOT_EMITTED__)')
    const genPath = file.replace(/\.t27$/, '.gen.ts')
    const dir = dirname(genPath)
    const ignored = ignore
      .split('\n')
      .map(l => l.trim())
      .some(l => l === genPath || l === `${dir}/*.gen.ts`)
    if (!ignored) say('gen-ignored', `${genPath} is not in .prettierignore`)
  }

  const genImport = `./${basename(file, '.t27')}.gen`
  if (test === null)
    say('binding-test', `no ${basename(file, '.t27')}.test.ts beside the spec`)
  else {
    if (!test.includes(`'${genImport}'`))
      say('binding-test', `the test does not import ${genImport}`)
    for (const t of tests)
      if (!test.includes(t.title))
        say(
          'binding-titles',
          `spec test "${t.title}" is not run against the host`
        )
  }

  const genName = `spec/${basename(file, '.t27')}.gen'`
  const bound = hostFiles.filter(f => f.text.includes(genName))
  if (!bound.length)
    say('host-imports', 'no host file imports the generated module')
  // A file of this vertical: it imports the module or cites the spec.
  const cite = `${pathLine?.[1] ?? basename(file, '.t27')}.t27`
  for (const f of hostFiles) {
    if (!f.text.includes(genName) && !f.text.includes(cite)) continue
    for (const [, name, raw] of f.text.matchAll(
      /^export const (\w+)(?:\s*:\s*[^=]+)?\s*=\s*(.+)$/gm
    )) {
      const v = literal(raw)
      if (v === undefined) continue
      for (const [c, value] of consts) {
        if (FRAME.includes(c) || typeof value === 'boolean') continue
        if ((name === c || name.endsWith(`_${c}`)) && v === value)
          say(
            'restated',
            `${f.path}: ${name} = ${JSON.stringify(v)} restates ${c}; import it from the spec`
          )
      }
    }
  }
  return bad
}

// ---- the repository ---------------------------------------------------------------

export function readManifest(root = ROOT) {
  return JSON.parse(
    readFileSync(join(root, 'scripts', 't27-specs.json'), 'utf8')
  )
}

function trackedCode(root) {
  const all = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  return all
    .split('\n')
    .filter(p => /\.(ts|tsx|mjs|cjs|js)$/.test(p))
    .filter(p => !/(^|\/)(node_modules|dist|build)\//.test(p))
    .filter(p => !p.endsWith('.gen.ts'))
}

/** Every vendored spec, and every law over it and over the citations. */
export function checkRepo({ root = ROOT, t27 = null, run = false } = {}) {
  const bad = []
  const manifest = readManifest(root)
  const ignore = existsSync(join(root, '.prettierignore'))
    ? readFileSync(join(root, '.prettierignore'), 'utf8')
    : ''
  const code = trackedCode(root)
  const read = p => readFileSync(join(root, p), 'utf8')
  const bound = new Map()

  for (const host of manifest.hosts) {
    const dir = host.specDir
    if (!existsSync(join(root, dir))) {
      bad.push({
        spec: dir,
        law: 'judge',
        what: 'the spec directory is missing',
      })
      continue
    }
    const hostFiles = code
      .filter(p => p.startsWith(host.root + '/') && !/\.test\.tsx?$/.test(p))
      .map(p => ({ path: p, text: read(p) }))
    for (const name of readdirSync(join(root, dir)).filter(n =>
      n.endsWith('.t27')
    )) {
      const file = `${dir}/${name}`
      const spec = read(file)
      const at = p => (existsSync(join(root, p)) ? read(p) : null)
      bad.push(
        ...checkSpec({
          file,
          spec,
          gen: at(file.replace(/\.t27$/, '.gen.ts')),
          test: at(file.replace(/\.t27$/, '.test.ts')),
          hostFiles,
          ignore,
        })
      )
      const path = /^\/\/ specs\/([a-z0-9_/-]+)\.t27\b/.exec(
        spec.split('\n')[1] ?? ''
      )?.[1]
      if (path) bound.set(path, file)
    }
  }

  // Citations: a spec named in code is bound, or known debt.
  const known = new Set([
    ...(manifest.unbound ?? []),
    ...(manifest.foreign ?? []),
    ...(manifest.citedMissing ?? []),
  ])
  for (const p of code) {
    if (manifest.hosts.some(h => p.startsWith(h.specDir + '/'))) continue
    const text = read(p)
    for (const [, id] of text.matchAll(CITE)) {
      if (bound.has(id) || known.has(id)) continue
      bad.push({
        spec: `specs/${id}.t27`,
        law: 'cited',
        what: `${p} cites it; bind it (sync-t27-spec.mjs) or name it in scripts/t27-specs.json`,
      })
    }
  }
  for (const id of manifest.unbound ?? [])
    if (bound.has(id))
      bad.push({
        spec: `specs/${id}.t27`,
        law: 'ratchet',
        what: 'bound now: remove it from "unbound"',
      })

  if (t27) bad.push(...checkAgainstT27({ root, t27, bound, manifest, run }))
  return bad
}

/** The laws that need the t27 checkout: identity, the compiler, the ratchet. */
function checkAgainstT27({ root, t27, bound, manifest, run }) {
  const bad = []
  if (!existsSync(join(t27, 'specs')))
    return [{ spec: t27, law: 'judge', what: 'not a t27 checkout' }]
  const local = join(t27, 'target', 'release', 't27c')
  const t27c = process.env.T27C || (existsSync(local) ? local : 't27c')
  for (const [id, file] of bound) {
    const theirs = join(t27, 'specs', `${id}.t27`)
    if (!existsSync(theirs)) {
      bad.push({
        spec: file,
        law: 't27-same',
        what: `specs/${id}.t27 is not in the checkout`,
      })
      continue
    }
    if (readFileSync(theirs, 'utf8') !== readFileSync(join(root, file), 'utf8'))
      bad.push({
        spec: file,
        law: 't27-same',
        what: `differs from specs/${id}.t27 in the checkout`,
      })
    try {
      const gen = execFileSync(t27c, ['gen-ts', join(root, file)], {
        encoding: 'utf8',
      })
      if (
        gen !==
        readFileSync(join(root, file.replace(/\.t27$/, '.gen.ts')), 'utf8')
      )
        bad.push({
          spec: file,
          law: 't27c-gen',
          what: 'the compiler writes a different module: re-run sync-t27-spec.mjs',
        })
    } catch (e) {
      bad.push({
        spec: file,
        law: 'judge',
        what: `t27c gen-ts failed: ${String(e.message).slice(0, 120)}`,
      })
    }
    if (run) bad.push(...testReport(t27c, t27, theirs, file))
  }
  const ours = []
  const walk = d => {
    for (const n of readdirSync(d, { withFileTypes: true })) {
      if (n.isDirectory()) walk(join(d, n.name))
      else if (n.name.endsWith('.t27')) {
        const p = join(d, n.name)
        if (specConsts(readFileSync(p, 'utf8')).get('REPO') === REPO)
          ours.push(relative(join(t27, 'specs'), p).replace(/\.t27$/, ''))
      }
    }
  }
  walk(join(t27, 'specs'))
  const unbound = new Set(manifest.unbound ?? [])
  for (const id of ours)
    if (!bound.has(id) && !unbound.has(id))
      bad.push({
        spec: `specs/${id}.t27`,
        law: 'ratchet',
        what: 'a spec of this repo, neither bound nor listed: bind it',
      })
  for (const id of unbound)
    if (!ours.includes(id))
      bad.push({
        spec: `specs/${id}.t27`,
        law: 'ratchet',
        what: 'listed as unbound but not a spec of this repo in the checkout',
      })
  for (const id of manifest.citedMissing ?? [])
    if (existsSync(join(t27, 'specs', `${id}.t27`)))
      bad.push({
        spec: `specs/${id}.t27`,
        law: 'ratchet',
        what: 'listed as missing but it exists now: move it',
      })
  return bad
}

/**
 * `t27c test-report`, judged by its TABLE. Measured 2026-09-27: it exits 0
 * with "FAIL 2" in the table -- a gate reading its exit code passes every
 * broken spec. So the counts are read, and a table that cannot be read, or
 * that ran no test, is a failure too.
 */
export function readTestReport(out) {
  const n = key => {
    const m = new RegExp(`^\\s*${key}\\s+(\\d+)\\s*$`, 'm').exec(out)
    return m ? Number(m[1]) : null
  }
  return {
    tests: n('tests'),
    fail: n('FAIL'),
    failed: out
      .split('\n')
      .filter(l => /^\s*FAIL\s{2}\S/.test(l))
      .map(l => l.trim().slice(6)),
  }
}

function testReport(t27c, t27, spec, file) {
  let out = ''
  try {
    out = execFileSync(
      t27c,
      ['test-report', '--specs-dir', join(t27, 'specs'), spec],
      {
        encoding: 'utf8',
        stdio: 'pipe',
      }
    )
  } catch (e) {
    out = String(e.stdout || '')
    if (!out)
      return [
        {
          spec: file,
          law: 'judge',
          what: `t27c test-report did not run: ${String(e.message).slice(0, 120)}`,
        },
      ]
  }
  const r = readTestReport(out)
  if (r.tests === null || r.fail === null)
    return [
      {
        spec: file,
        law: 'judge',
        what: 'the test-report table could not be read',
      },
    ]
  if (!r.tests)
    return [{ spec: file, law: 't27c-test', what: 'test-report ran no test' }]
  if (r.fail)
    return [
      {
        spec: file,
        law: 't27c-test',
        what: `${r.fail} of ${r.tests} fail: ${r.failed.join('; ')}`,
      },
    ]
  return []
}

// ---- the command --------------------------------------------------------------------

const main = import.meta.url === `file://${process.argv[1]}`
if (main) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--t27')
  const t27 = at >= 0 ? args[at + 1] : null
  let bad
  try {
    bad = checkRepo({ t27, run: args.includes('--run') })
  } catch (e) {
    console.error(`t27 specs: could not judge: ${e.message}`)
    process.exit(2)
  }
  const judge = bad.filter(b => b.law === 'judge')
  for (const b of bad) console.error(`${b.spec}: [${b.law}] ${b.what}`)
  const manifest = readManifest()
  const n = manifest.hosts.reduce(
    (s, h) =>
      s +
      readdirSync(join(ROOT, h.specDir)).filter(x => x.endsWith('.t27')).length,
    0
  )
  if (!bad.length) {
    console.log(
      `t27 specs: ${n} bound, every law holds${t27 ? ' (and against the t27 checkout)' : ''}; ${manifest.unbound.length} of this repo still unbound`
    )
    process.exit(0)
  }
  process.exit(judge.length === bad.length ? 2 : 1)
}
