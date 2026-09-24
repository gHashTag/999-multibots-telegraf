#!/usr/bin/env node
/**
 * A MODULE NOTHING IMPORTS IS A FEATURE NOBODY SWITCHED ON.
 *
 * Measured 2026-09-25 on my own last tick: two modules shipped with passing
 * tests and no caller at all. A green suite on a dead module looks exactly
 * like a green suite on a live one, so "done" was reported in good faith and
 * was wrong. This is the check that cannot be passed by accident.
 *
 * THE MATCHER IS EXACT, and that is the whole difficulty. A first version
 * matched the file's basename anywhere in a source and called seven modules
 * dead; two of them were alive and imported by `render-server.ts`. A guard
 * that cries about healthy code teaches its reader to ignore it -- which
 * costs more than the guard is worth -- so a caller means an IMPORT of that
 * exact specifier, never a mention of the word.
 *
 * A file whose name ends in `-wiring` is called out separately: its whole
 * purpose is to connect something, so one that nothing imports is the
 * sharpest form of the defect rather than a merely unused helper.
 */
const { readdirSync, readFileSync } = require('node:fs')
const { basename, join, resolve } = require('node:path')

const ROOT = resolve(__dirname, '..')

/**
 * Where modules live that are supposed to be reachable from the running code.
 *
 * NARROW ON PURPOSE, AND IT SAYS SO. These three directories are where "a
 * feature written and never switched on" actually appears; widening to the
 * whole tree answers with 239 names, which is not a list anybody acts on.
 *
 * But a narrow tool that does not name its own edges is the blindness this
 * repository already paid for once (no-silent-blindness.test.ts: a secrets
 * sweep saw fifty files fewer than it thought, and every conclusion drawn
 * with it was worthless). So the scope is printed with the answer, and
 * `--all` widens it for the day somebody wants the whole picture.
 */
const WATCHED = [
  'src/services',
  'src/navigation/helpers',
  'apps/vibee-editor/render/src/agent',
]

/** Everything that could import one. Tests do not count: a test is not a user. */
const SEARCHED = [
  'src',
  'apps/vibee-editor/render/src',
  'apps/vibee-editor/render',
  'scripts',
]

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(resolve(ROOT, dir), { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue
      walk(p, out)
    } else if (/\.(ts|tsx|cjs|mjs)$/.test(e.name)) out.push(p)
  }
  return out
}

const isTest = p => p.includes('.test.') || p.includes('__tests__')

/**
 * An import OF THIS MODULE, not a mention of its name.
 *
 * `import(` belongs here beside `from` and `require(`, and leaving it out was
 * the second false alarm this file produced in one sitting: this repository
 * loads half its services with `await import('@/services/x')` on purpose --
 * a static import would pull the whole graph into a cold start -- so a
 * matcher blind to it called fifteen live modules dead, including two the
 * author had wired an hour earlier.
 */
function importerOf(base) {
  return new RegExp(
    `(?:from|require\\(|import\\()\\s*['"][^'"]*[/'"]${base}['"]`
  )
}

/**
 * WHERE THE RUNNING PROGRAM STARTS.
 *
 * `src/index.ts` is the production entry (it builds its own bots there),
 * `bot.ts` is the package's "main", and `render-server.ts` is the render's. A
 * module is alive if the program can REACH it from one of these, not merely
 * if somebody imports it.
 */
const ENTRIES = [
  'src/index.ts',
  'src/bot.ts',
  'apps/vibee-editor/render/render-server.ts',
]

/**
 * AND EVERY COMMAND IS A DOOR TOO.
 *
 * The third correction to this census, and the same shape as the first two:
 * `margin-report.ts` was reported unreachable while `tri margin` runs it
 * every day through `render/scripts/margin.ts`. A CLI script is an entry
 * point exactly like a server is -- somebody types it, and the code runs.
 *
 * Whole directories rather than a list: a census whose entry list must be
 * edited by hand every time a command is added goes stale silently, and a
 * stale entry list turns living code into a deletion list.
 */
const ENTRY_DIRS = ['scripts', 'apps/vibee-editor/render/scripts']

/** Every literal specifier an import in this source names. */
function specifiersIn(src) {
  const out = []
  for (const m of src.matchAll(
    /(?:from|require\(|import\()\s*['"]([^'"]+)['"]/g
  ))
    out.push(m[1])
  return out
}

/**
 * The file a specifier means, or null when it leaves this repository.
 *
 * `@/x` is the bot's alias for `src/x` (tsconfig paths). A bare name is a
 * package and ends the walk -- node_modules is not ours to census.
 */
function resolveSpec(fromFile, spec) {
  const { dirname, normalize } = require('node:path')
  let base
  if (spec.startsWith('@/')) base = join('src', spec.slice(2))
  else if (spec.startsWith('.')) base = normalize(join(dirname(fromFile), spec))
  else return null
  for (const ext of ['.ts', '.tsx', '.mjs', '.cjs', '.js']) {
    const p = base + ext
    try {
      readFileSync(resolve(ROOT, p), 'utf8')
      return p
    } catch {
      /* try the next shape */
    }
  }
  for (const idx of ['/index.ts', '/index.tsx']) {
    const p = base + idx
    try {
      readFileSync(resolve(ROOT, p), 'utf8')
      return p
    } catch {
      /* not a directory module */
    }
  }
  return null
}

/**
 * EVERY FILE THE PROGRAM CAN REACH FROM ITS ENTRIES.
 *
 * Added after the one-hop version answered the weaker question: two image
 * generators looked alive because `UniversalProviderManager` imports them --
 * and nothing imports the manager. A module reachable only through the dead
 * is dead, and a census that cannot say so hands back a list that is quietly
 * too short.
 */
function reachable() {
  const seen = new Set()
  const fromDirs = ENTRY_DIRS.flatMap(d => walk(d)).filter(
    f => !f.includes('.test.')
  )
  const queue = [...ENTRIES, ...fromDirs].filter(e => {
    try {
      readFileSync(resolve(ROOT, e), 'utf8')
      return true
    } catch {
      return false
    }
  })
  while (queue.length) {
    const f = queue.pop()
    if (seen.has(f)) continue
    seen.add(f)
    let src = ''
    try {
      src = readFileSync(resolve(ROOT, f), 'utf8')
    } catch {
      continue
    }
    for (const spec of specifiersIn(src)) {
      const next = resolveSpec(f, spec)
      if (next && !seen.has(next)) queue.push(next)
    }
  }
  return seen
}

function orphans() {
  const candidates = WATCHED.flatMap(d => walk(d)).filter(p => !isTest(p))
  const sources = [...new Set(SEARCHED.flatMap(d => walk(d)))].filter(
    p => !isTest(p)
  )
  const read = new Map()
  for (const p of sources) {
    try {
      read.set(p, readFileSync(resolve(ROOT, p), 'utf8'))
    } catch {
      /* unreadable is not a caller */
    }
  }
  /*
   * Two questions, and the second is the real one.
   *
   * `imported` is "does anybody import this" -- cheap, and too generous: a
   * module imported only by a dead module passes it. `live` is "can the
   * program reach this from its entries", which is what "switched on" means.
   */
  const live = reachable()
  const out = []
  for (const f of candidates) {
    if (live.has(f)) continue
    const re = importerOf(basename(f, f.endsWith('.tsx') ? '.tsx' : '.ts'))
    let imported = false
    for (const [p, src] of read) {
      if (p === f) continue
      if (re.test(src)) {
        imported = true
        break
      }
    }
    out.push({ file: f, imported })
  }
  return { looked: candidates.length, live: live.size, orphans: out }
}

function main() {
  const wide = process.argv.includes('--all')
  if (wide) WATCHED.splice(0, WATCHED.length, 'src', 'apps/vibee-editor/render/src')
  const { looked, live, orphans: dead } = orphans()
  console.log(
    wide
      ? 'Охват: ВЕСЬ код бота и рендера.' // cyrillic-ok: operator-facing
      : `Охват: ${WATCHED.join(', ')} (остальное дерево не смотрится — «--all» для всего).` // cyrillic-ok: operator-facing
  )
  console.log(
    `Просмотрено модулей: ${looked}. Программа достаёт ${live} файлов от точек входа. ` + // cyrillic-ok: operator-facing
      `Недостижимы: ${dead.length}.` // cyrillic-ok: operator-facing
  )
  for (const d of dead)
    console.log(
      `  ${d.file}${d.imported ? '  (импортируется — но только мёртвыми)' : ''}` // cyrillic-ok: operator-facing
    )
  const wiring = dead.filter(d => /-wiring\.ts$/.test(d.file))
  if (wiring.length) {
    console.log(
      '\n⚠️ Среди них файлы «-wiring»: они существуют, чтобы что-то подключать,' + // cyrillic-ok: operator-facing
        ' и сами не подключены.' // cyrillic-ok: operator-facing
    )
    for (const d of wiring) console.log(`  ${d.file}`)
  }
}

module.exports = { orphans, importerOf, walk, reachable, resolveSpec }

if (require.main === module) main()
