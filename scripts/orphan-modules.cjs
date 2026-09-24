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

/** Where modules live that are supposed to be reachable from the running code. */
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
  const out = []
  for (const f of candidates) {
    const re = importerOf(basename(f, f.endsWith('.tsx') ? '.tsx' : '.ts'))
    let used = false
    for (const [p, src] of read) {
      if (p === f) continue
      if (re.test(src)) {
        used = true
        break
      }
    }
    if (!used) out.push(f)
  }
  return { looked: candidates.length, orphans: out }
}

function main() {
  const { looked, orphans: dead } = orphans()
  const wiring = dead.filter(f => /-wiring\.ts$/.test(f))
  console.log(
    `Просмотрено модулей: ${looked}. Никем не импортируются: ${dead.length}.` // cyrillic-ok: operator-facing
  )
  for (const f of dead) console.log(`  ${f}`)
  if (wiring.length) {
    console.log(
      '\n⚠️ Среди них файлы «-wiring»: они существуют, чтобы что-то подключать,' + // cyrillic-ok: operator-facing
        ' и сами не подключены.' // cyrillic-ok: operator-facing
    )
    for (const f of wiring) console.log(`  ${f}`)
  }
}

module.exports = { orphans, importerOf, walk }

if (require.main === module) main()
