#!/usr/bin/env node
/**
 * TWO SERVICES AGREEING BY STRING, AND NOTHING CHECKING THE AGREEMENT.
 *
 * Measured 2026-09-24. The bot had been posting the journal kind
 * `card-auto-sent` since AUTO shipped; the render's door never knew the word,
 * so every automatic send was refused with 400 and written nowhere -- and the
 * figure built on those rows read zero by construction, the louder the
 * better the autopilot worked.
 *
 * Nothing failed loudly. The writer swallows a refusal on purpose, because a
 * journal that is down must not hold up the act it records. That mercy is
 * exactly what let it live unseen.
 *
 * Each vocabulary lives in its own file, under its own tsconfig, in a service
 * with its own runtime. A type cannot join them, so they are compared as
 * SOURCE TEXT here -- and a pattern that finds nothing is reported as a
 * broken check, never as agreement: an empty intersection is the shape every
 * one of these mistakes takes.
 */
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const ROOT = resolve(__dirname, '..')
const read = p => {
  try {
    return readFileSync(resolve(ROOT, p), 'utf8')
  } catch {
    return ''
  }
}

/** Literals inside a slice of source, in order, without duplicates. */
function literals(source, from, to) {
  if (!source) return []
  const start = from ? source.indexOf(from) : 0
  if (start < 0) return []
  const end = to ? source.indexOf(to, start + 1) : source.length
  const slice = source.slice(start, end < 0 ? source.length : end)
  return [
    ...new Set([...slice.matchAll(/'([a-z][a-z0-9-]{2,})'/g)].map(m => m[1])),
  ]
}

/** Object keys inside a slice -- bare (`payment:`) or quoted alike. */
function keys(source, from, to) {
  if (!source) return []
  const start = source.indexOf(from)
  if (start < 0) return []
  const end = source.indexOf(to, start + 1)
  const slice = source.slice(start, end < 0 ? source.length : end)
  return [
    ...new Set(
      [...slice.matchAll(/^\s*'?([a-z][a-z0-9-]{2,})'?\s*:/gm)].map(m => m[1])
    ),
  ]
}

const { readdirSync } = require('node:fs')

/** Every file under a directory, recursively, minus the tests. */
function sources(dir, out = []) {
  let entries
  try {
    entries = readdirSync(resolve(ROOT, dir), { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = dir + '/' + e.name
    if (e.isDirectory()) sources(p, out)
    else if (/\.(ts|tsx|cjs)$/.test(e.name) && !e.name.includes('.test.'))
      out.push(p)
  }
  return out
}

/**
 * Every tool name the render registers.
 *
 * Read from the agent directory rather than from the exported TOOLS array:
 * the array is assembled at runtime from a dozen modules, and this file must
 * stay a reader of text, with no service to boot.
 */
function registeredTools() {
  const names = new Set()
  for (const f of sources('apps/vibee-editor/render/src/agent'))
    for (const m of read(f).matchAll(/name: '([a-z_0-9]+)'/g)) names.add(m[1])
  return [...names]
}

/** Tool names the app and the scripts ask for by name. */
function calledTools() {
  const names = new Set()
  for (const dir of ['apps/vibee-editor/player/src', 'scripts'])
    for (const f of sources(dir)) {
      const src = read(f)
      for (const m of src.matchAll(/callTool[^(]*\('([a-z_0-9]+)'/g))
        names.add(m[1])
      for (const m of src.matchAll(/name:\s*'([a-z_0-9]+)',\s*arguments/g))
        names.add(m[1])
    }
  return [...names]
}

/*
 * THE PAIRS. `says` is what one side can send, `hears` what the other accepts.
 *
 * `soft` marks a pair whose mismatch degrades rather than loses: an unnamed
 * kind prints as its own token instead of Russian, which is ugly and not a
 * silence. The hard pairs are the ones where a word nobody hears means a
 * record that never happened.
 */
const PAIRS = [
  {
    what: 'вид события: бот → дверь журнала', // cyrillic-ok: operator-facing
    says: () =>
      literals(
        read('src/services/hiveNote.ts'),
        'export type HiveNote',
        'severity:'
      ),
    hears: () =>
      literals(
        read('apps/vibee-editor/render/src/hive/note-route.ts'),
        'NOTABLE_KINDS',
        'const SEVERITIES'
      ),
  },
  {
    what: 'поверхность: бот → запись реплики', // cyrillic-ok: operator-facing
    says: () => {
      const out = new Set()
      for (const f of [
        'src/services/trinityAgent.ts',
        'src/services/businessBotService.ts',
      ]) {
        for (const m of read(f).matchAll(/surface:\s*'([a-z]+)'/g))
          out.add(m[1])
        for (const m of read(f).matchAll(
          /surface:\s*'([a-z]+)'\s*\|\s*'([a-z]+)'/g
        )) {
          out.add(m[1])
          out.add(m[2])
        }
      }
      return [...out]
    },
    hears: () =>
      literals(
        read('apps/vibee-editor/render/src/agent/routes.ts'),
        'KNOWN_SURFACES',
        'const surface ='
      ),
  },
  {
    what: 'вид события → имя в отчёте королевы', // cyrillic-ok: operator-facing
    soft: 'печатается своим кодом вместо слов', // cyrillic-ok: operator-facing
    says: () =>
      literals(
        read('apps/vibee-editor/render/src/hive/journal.ts'),
        'export type EventKind',
        // Severity is declared between EventKind and HiveEvent, and its three
        // words are not kinds: cutting at HiveEvent reported them as kinds
        // with no name, which is a lie in the direction of noise.
        'export type Severity'
      ),
    /*
     * Object keys, not string values: a key may be bare (`payment:`) or
     * quoted (`'sweep-idle':`), and reading only the quoted ones reported
     * seven named kinds as nameless. A guard that cries about words that
     * are fine teaches its reader to ignore it, which costs more than the
     * check is worth.
     */
    hears: () =>
      keys(
        read('apps/vibee-editor/render/src/hive/queen-report.ts'),
        'const NAMES',
        'function humanName'
      ),
  },
  {
    /*
     * A NAME ON THIS LIST THAT NO TOOL HAS PROTECTS NOTHING.
     *
     * DIRECT_CALL_ONLY is what keeps a model turn -- including one that has
     * just read a client's message -- from flipping the switch that sends
     * from the owner's account. A typo in it is not a typo: it is the guard
     * silently not being there, and every test of the guard still passes,
     * because they test the list, not the join.
     */
    what: 'только прямым вызовом → есть такой инструмент', // cyrillic-ok: operator-facing
    /*
     * Cut at the Set's own closing bracket, not at a later landmark: the
     * first attempt reached on into the prose below and reported the words
     * `provider` and `function` as unprotected tools. Form 150 again, in the
     * same hour it was written down -- a guard that cries about healthy code
     * teaches its reader to ignore it.
     */
    says: () => {
      const src = read('apps/vibee-editor/render/src/agent/tools.ts')
      const at = src.indexOf('DIRECT_CALL_ONLY: ReadonlySet')
      const end = at < 0 ? -1 : src.indexOf('])', at)
      if (at < 0 || end < 0) return []
      /*
       * Its own pattern, because tool names carry underscores and the
       * literal reader does not take them. With `literals` this pair read
       * ZERO names and was reported as a broken check -- which is exactly
       * what it was, and exactly why that rule exists: the first version of
       * this line looked like it worked while protecting nothing.
       */
      return [
        ...new Set(
          [...src.slice(at, end).matchAll(/'([a-z][a-z_0-9]{2,})'/g)].map(
            m => m[1]
          )
        ),
      ]
    },
    hears: registeredTools,
  },
  {
    /*
     * A button in the app, or a tri command, asking for a tool that is not
     * there. The answer comes back as an error the caller usually swallows,
     * so the control simply does nothing and nobody is told.
     */
    what: 'инструменты, которые зовут приложение и скрипты', // cyrillic-ok: operator-facing
    says: calledTools,
    hears: registeredTools,
  },
]

/** The whole answer, as data: the printer and the test read the same thing. */
function compare(pairs = PAIRS) {
  return pairs.map(p => {
    const says = p.says()
    const hears = p.hears()
    /*
     * A pattern that matched nothing is a BROKEN CHECK, not agreement. Every
     * defect of this class looks like an empty list, so an empty list is
     * never allowed to read as "all good".
     */
    const readable = says.length > 0 && hears.length > 0
    const unheard = readable ? says.filter(s => !hears.includes(s)) : []
    return {
      what: p.what,
      soft: p.soft || null,
      says,
      hears,
      readable,
      unheard,
    }
  })
}

function main() {
  const rows = compare()
  let bad = 0
  for (const r of rows) {
    if (!r.readable) {
      bad++
      console.log(
        `❓ ${r.what}: не смог прочитать словари (${r.says.length} / ${r.hears.length}) — проверка сломана, а не пройдена` // cyrillic-ok: operator-facing
      )
      continue
    }
    if (!r.unheard.length) {
      console.log(`✅ ${r.what}: ${r.says.length} слов, все слышат.`) // cyrillic-ok: operator-facing
      continue
    }
    if (r.soft) {
      console.log(`⚠️ ${r.what}: ${r.unheard.join(', ')} — ${r.soft}.`) // cyrillic-ok: operator-facing
      continue
    }
    bad++
    console.log(
      `🚨 ${r.what}: ${r.unheard.join(', ')} — говорит, а вторая сторона отказывает МОЛЧА.` // cyrillic-ok: operator-facing
    )
  }
  if (bad) process.exitCode = 1
}

module.exports = {
  compare,
  literals,
  keys,
  registeredTools,
  calledTools,
  PAIRS,
}

if (require.main === module) main()
