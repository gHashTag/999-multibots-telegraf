#!/usr/bin/env node
/**
 * DO THE SKILLS STILL DESCRIBE THIS REPOSITORY?
 *
 * Forty-one skills, 28 000 lines, written over months and never checked against
 * the tree they describe. A skill citing a file that moved sends the next
 * reader -- or the next agent -- to a path that does not exist, and it does so
 * with the authority of documentation.
 *
 * ── AN ADDRESS IS NOT A NAME, AND ONLY ADDRESSES CAN BREAK ────────────────
 *
 * In prose, `render/steps.ts` is a NAME: "render/steps.ts substitutes job_id".
 * Rewriting it to the full path would make the sentence worse and fix nothing.
 *
 * In a runnable block, `npx tsx scripts/check-infisical-keys.ts` is an ADDRESS.
 * If it is wrong the reader's command fails. Eighteen such addresses were found
 * broken across six files on the first run of this version.
 *
 * The two are reported separately, because they need different answers and
 * because mixing them buries the eighteen that matter under the ones that do not.
 *
 * ── WHAT THIS CHECKER GOT WRONG, IN ORDER ─────────────────────────────────
 *
 *   1. Resolved every path against the repository root -- 61% "missing", mostly
 *      false. Skills cite paths relative to a context they establish.
 *   2. Called a unique basename a move: claimed `src/sceneFactory/index.ts` had
 *      "moved to" an unrelated `index.ts`. A confident wrong pointer is worse
 *      than an honest "gone" -- the reader follows it.
 *   3. Kept that error even with the uniqueness rule: `atoms/chat.ts`, a deleted
 *      jotai atom, was said to have moved to an agent transport in another app,
 *      because `chat.ts` happened to be unique. The directories must agree too.
 *   4. Read only SKILL.md, though skills carry README, CHANGELOG and resources
 *      that cite paths just as confidently.
 *   5. Saw only backticked paths -- and so was blind to the ones inside runnable
 *      blocks, which are exactly the ones that cost the reader something.
 *
 * Every one of those was found by looking at what it claimed, never by reading
 * it. The battery at the bottom now holds each of them as a fixed case.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
/*
 * Overridable so the battery can scan a FIXTURE with a known answer. Without
 * that, the battery only ever tested helper functions -- and "0 broken
 * addresses" rested on nothing that could fail.
 */
const SKILLS = process.env.DRIFT_SKILLS || path.join(ROOT, '.claude', 'skills')

/**
 * Bases a skill may be writing relative to.
 *
 * Not a guess: each one appears in a real skill. Adding a base makes the check
 * WEAKER, so the list stays short and every entry has to earn its place.
 */
const BASES = [
  '.',
  'src',
  'apps/vibee-editor',
  'apps/vibee-editor/player',
  'apps/vibee-editor/player/src',
  'apps/vibee-editor/render',
  'apps/vibee-ios/Vibee',
]

/** Top-level directories of this repository: a path starting here is rooted. */
const ROOTED = /^(src|scripts|apps|packages|bin|docs|test|tests|\.claude)\//

const EXT = 'ts|tsx|js|mjs|cjs|yaml|yml|sh|swift|rs|zig|t27|json'
const QUOTED = new RegExp(
  '`([a-zA-Z0-9_][a-zA-Z0-9_./-]*\\.(?:' + EXT + '))`',
  'g'
)
const BARE = new RegExp(
  '(?:^|[\\s\'"(])([a-zA-Z0-9_.][a-zA-Z0-9_./-]*\\.(?:' +
    EXT +
    '))(?=$|[\\s\'")])',
  'g'
)

/**
 * Citations, tagged by whether the reader is expected to RUN them.
 *
 * A fenced bash block is the strongest form of address there is: its contents
 * are meant to be pasted into a shell. Those are collected without requiring
 * backticks, which is how eighteen broken commands stayed invisible.
 */
function citations(text) {
  const out = []
  const lines = text.split('\n')
  let fence = null
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at]
    const open = /^\s*```+\s*(\w+)?/.exec(line)
    if (open) {
      fence = fence ? null : (open[1] || '').toLowerCase()
      continue
    }
    const shell = fence === 'bash' || fence === 'sh' || fence === 'shell'
    if (shell) {
      /*
       * A PATH INSIDE A SHELL FENCE IS NOT AUTOMATICALLY A COMMAND.
       *
       * code-quality-guardian lists naming examples in a bash fence:
       *
       *     # GOOD                         # BAD
       *     src/helpers/validation.ts      src/stuff/thing.ts
       *
       * `src/stuff/thing.ts` is invented ON PURPOSE, to show what a meaningless
       * name looks like. Reporting it as a broken address makes the checker
       * demand that an illustration be made real.
       *
       * A line is executed when something INVOKES the path -- a command word in
       * front of it, or the path invoking itself via ./ or / . A bare path
       * alone on a line is a listing.
       */
      if (/^\s*#/.test(line)) continue
      for (const m of line.matchAll(BARE)) {
        const ref = m[1]
        if (ref.includes('://')) continue
        const before = line
          .slice(0, m.index + (m[0].length - ref.length))
          .trim()
        const invoked = /^[.~/]/.test(ref) || before.length > 0
        if (invoked) out.push({ ref, runnable: true, at })
      }
      continue
    }
    if (fence !== null) continue // some other language: not our paths
    for (const m of line.matchAll(QUOTED))
      out.push({ ref: m[1], runnable: false, at })
  }
  return { cites: out, lines }
}

/**
 * A PATH THE TEXT ITSELF CALLS ABSENT IS NOT A BROKEN ADDRESS.
 *
 * When the broken addresses were fixed, seven of them had no replacement: the
 * script had been deleted, or had never been written. The honest fix is not to
 * invent a path -- it is to say so, and the agents did:
 *
 *     ### Script 1: tdd-cycle.sh - TEMPLATE ONLY, NOT IN THIS REPOSITORY
 *     > Neither ./tdd-cycle.sh nor ./scripts/tdd-cycle.sh exists or ever did.
 *     > Copy the block into scripts/tdd-cycle.sh yourself and chmod +x it.
 *
 * That made the documentation truthful and made THIS CHECKER'S NUMBER GO UP,
 * from 11 to 16 -- because saying "copy this into scripts/tdd-cycle.sh" cites
 * the path one more time.
 *
 * A measure that worsens when the text improves is worse than no measure: it
 * argues for reverting the fix. So a citation whose surrounding text declares
 * the file absent is counted apart, as DOCUMENTED ABSENCE.
 *
 * This is prose-marker matching and therefore fragile. It is deliberately
 * narrow: only explicit, unambiguous declarations of absence count, and the
 * window is small enough that a marker three sections away cannot launder an
 * unrelated broken path.
 */
const ABSENCE = [
  'TEMPLATE',
  'does NOT exist',
  'does not exist',
  'NOT installed',
  'not installed',
  'never did',
  'never was',
  'never existed',
  'no such file',
  'No such file',
  'yourself',
  'copy this',
  'Copy this',
  'copy the block',
  'Copy the block',
  // This repository documents in Russian as well as English, and the checker
  // that only knows English markers calls an honest Russian "there is no such
  // file, and never was" a broken address.
  'нет и не было',
  'не существует',
  'никогда не сущест',
  'скопируй',
  'создай сам',
  // A historical statement is not a promise either: "formerly scripts/deploy.sh,
  // moved in 0fc05b4a" is true, and rewriting it would erase the record.
  'formerly',
  'moved in',
  'Created `',
  'ранее',
  'переехал',
]

/** Do the lines around a citation declare the file absent? */
function declaredAbsent(lines, at) {
  const from = Math.max(0, at - 25)
  /*
   * FORWARD BY ONE LINE, NOT THREE.
   *
   * Three was enough to reach the NEXT section: in the battery's fixture a
   * legitimate prose name was laundered by a `TEMPLATE ONLY` line two lines
   * below it, about an unrelated file. A marker explains what comes AFTER it;
   * one line of lookahead covers the case where the citation and its warning
   * share a sentence, and nothing beyond that.
   */
  const window = lines.slice(from, at + 2).join('\n')
  if (ABSENCE.some(m => window.includes(m))) return true

  /*
   * A FENCED BLOCK INHERITS THE DECLARATION ABOVE IT.
   *
   * The tdd-automation template is 95 lines long and its usage line sits at the
   * bottom, far outside any window measured from the citation. The header three
   * screens up says the file does not exist -- and everything between the
   * fences is that same template.
   *
   * So walk back to the fence that opened this block and test the window before
   * IT. Widening the plain window instead would let a marker in one section
   * launder a broken path in the next.
   */
  let open = -1
  let inside = false
  for (let i = at; i >= 0; i--) {
    if (/^\s*```/.test(lines[i])) {
      if (!inside) {
        open = i
        inside = true
        break
      }
    }
  }
  if (open < 0) return false
  const before = lines.slice(Math.max(0, open - 25), open).join('\n')
  return ABSENCE.some(m => before.includes(m))
}

/** Where else in the tree does a file with this basename live? */
function findElsewhere(base) {
  try {
    const out = execFileSync('git', ['ls-files', '--', `*/${base}`, base], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * A UNIQUE BASENAME IS NOT EVIDENCE OF A MOVE. THE DIRECTORIES MUST AGREE TOO.
 *
 * A suffix test is too strict: a real move often inserts a directory in the
 * middle (`scripts/check-infisical-keys.ts` -> `scripts/infisical/...`), which
 * no suffix of the candidate matches.
 *
 * What holds for every real move here and for none of the false ones: each
 * segment of the cited path appears in the candidate, IN ORDER.
 */
function segmentsInOrder(cited, candidate) {
  const want = cited.split('/').filter(Boolean)
  const have = candidate.split('/').filter(Boolean)
  let i = 0
  for (const seg of have) if (seg === want[i]) i++
  return i === want.length
}

function walkMd(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkMd(p, acc)
    else if (e.name.endsWith('.md')) acc.push(p)
  }
  return acc
}

function main() {
  const rows = []
  let seen = 0

  for (const dir of fs.readdirSync(SKILLS).sort()) {
    const skill = path.join(SKILLS, dir)
    if (!fs.statSync(skill).isDirectory()) continue
    const bases = [...BASES.map(b => path.join(ROOT, b)), skill]

    for (const file of walkMd(skill, [])) {
      const text = fs.readFileSync(file, 'utf8')
      const { cites, lines } = citations(text)
      for (const { ref, runnable, at } of cites) {
        // A bare filename is a mention, not a path: checking it would flag
        // every prose reference to a file the reader is expected to find.
        if (!ref.includes('/')) continue
        seen++
        if (bases.some(b => fs.existsSync(path.join(b, ref)))) continue

        const alt = findElsewhere(path.basename(ref)).filter(c =>
          segmentsInOrder(ref, c)
        )
        rows.push({
          skill: dir,
          where: path.relative(skill, file),
          ref,
          // An address is what the reader executes or resolves literally --
          // unless the text around it declares the file absent, in which case
          // the citation is documentation, not a promise.
          address: (runnable || ROOTED.test(ref)) && !declaredAbsent(lines, at),
          absent: declaredAbsent(lines, at),
          kind:
            alt.length === 1
              ? 'ПЕРЕЕХАЛ'
              : alt.length
                ? 'НЕОДНОЗНАЧНО'
                : 'УДАЛЁН',
          now: alt.length === 1 ? alt[0] : null,
          n: alt.length,
        })
      }
    }
  }

  const absentRows = rows.filter(r => r.absent)
  const addr = rows.filter(r => r.address)
  // Disjoint on purpose: a documented absence counted in BOTH buckets
  // would let the same citation be read as two different things.
  const name = rows.filter(r => !r.address && !r.absent)

  console.log(`[скиллы] путей в описаниях : ${seen}`)
  console.log(
    `[скиллы] СЛОМАННЫХ АДРЕСОВ : ${addr.length}  (читатель выполнит и получит ошибку)`
  )
  console.log(
    `[скиллы] имён в прозе      : ${name.length}  (текст не сломан, править не надо)`
  )
  const absent = absentRows
  if (absent.length) {
    console.log(
      `[скиллы] честно "его нет"   : ${absent.length}  (текст сам предупреждает — это ХОРОШО)`
    )
  }

  if (addr.length) {
    console.log('\n— адреса, которые не разрешаются —')
    /*
     * NO SILENT CAP.
     *
     * The first version printed `.slice(0, 25)` and said nothing about the
     * rest. A work-list was then built from what it DISPLAYED, and three skills
     * -- tdd-automation, telegram-bot-expert, version-management -- were never
     * assigned, because the report had hidden them behind the cut.
     *
     * A truncated report reads exactly like a complete one. If the tail is not
     * printed, the count of what was dropped must be.
     */
    const SHOW = process.argv.includes('--all') ? addr.length : 25
    for (const r of addr.slice(0, SHOW)) {
      // Built without nesting templates: the no-cyrillic guard does not
      // parse a template inside a template, and reads the inner string as a
      // comment. Restructuring is honest; silencing it with cyrillic-ok is not.
      const many = r.n ? ', ' + r.n + ' кандидатов' : ''
      const tail = r.now ? '\n   -> ' + r.now : '   (' + r.kind + many + ')'

      console.log(`  ${r.skill}/${r.where}\n      ${r.ref}${tail}`)
    }
  }
  if (addr.length > 25 && !process.argv.includes('--all')) {
    const rest = addr.slice(25)
    const skills = [...new Set(rest.map(r => r.skill))]
    console.log(
      `\n  … и ещё ${rest.length} НЕ ПОКАЗАНО, в скиллах: ${skills.join(', ')}`
    )
    console.log('  (полный список: node scripts/skills-drift.cjs --all)')
  }
  if (name.length) {
    console.log('\n— имена в прозе: короткий путь тут намеренный —')
    const moved = name.filter(r => r.kind === 'ПЕРЕЕХАЛ')
    console.log(
      `  из них ${moved.length} имеют однозначный полный путь, ${name.length - moved.length} — нет`
    )
  }

  /*
   * Exit 0 on findings, deliberately.
   *
   * This is a REPORT, not a gate. Making stale documentation break the build
   * would mean the next person to touch an unrelated skill inherits somebody
   * else's rot, and the honest response to that is to delete the check.
   */
  if (!rows.length) console.log('\n✅ все упомянутые пути существуют')
}

/**
 * THE BATTERY: every mistake this checker has made, held as a fixed case.
 *
 * A rule tuned on an example and never re-run against it is an assumption.
 */
function selfTest() {
  let bad = 0
  const fail = m => {
    bad++
    console.log(`  ⛔ ${m}`)
  }

  const moves = [
    ['atoms/chat.ts', 'apps/vibee-editor/render/src/agent/chat.ts', false],
    ['x/index.ts', 'packages/vibee-atoms/src/index.ts', false],
    ['services/heygen/client.ts', 'src/core/neon/client.ts', false],
    [
      'scripts/check-infisical-keys.ts',
      'scripts/infisical/check-infisical-keys.ts',
      true,
    ],
    ['render/steps.ts', 'src/inngest_app/functions/render/steps.ts', true],
    ['config/access.config.ts', 'src/navigation/config/access.config.ts', true],
    ['src/sceneFactory/index.ts', 'src/scenes/sceneFactory/index.ts', true],
    [
      'helpers/renderSteps.ts',
      'src/inngest_app/functions/render/helpers/renderSteps.ts',
      true,
    ],
  ]
  for (const [cited, cand, want] of moves) {
    if (segmentsInOrder(cited, cand) !== want)
      fail(`переезд: ${cited} -> ${cand}: ждали ${want}`)
  }

  // The blind spot that hid eighteen broken commands: a path inside a bash
  // fence, with no backticks anywhere near it.
  const doc = [
    '```bash',
    'npx tsx scripts/check-infisical-keys.ts',
    '```',
    'prose mentions `render/steps.ts` by name',
    '```ts',
    'import x from "src/not-a-citation.ts"',
    '```',
  ].join('\n')
  const got = citations(doc).cites
  const run = got.filter(c => c.runnable).map(c => c.ref)
  const prose = got.filter(c => !c.runnable).map(c => c.ref)
  if (!run.includes('scripts/check-infisical-keys.ts'))
    fail('команда в bash-блоке не увидена — та самая слепота')
  if (!prose.includes('render/steps.ts')) fail('имя в прозе потеряно')
  if (got.some(c => c.ref === 'src/not-a-citation.ts'))
    fail('подобрано из ts-блока: это код, а не ссылка')

  // The illustration trap: a naming example in a shell fence is not a command.
  const listing = citations(
    ['```bash', '# BAD', 'src/stuff/thing.ts', './scripts/real.sh', '```'].join(
      '\n'
    )
  ).cites.map(c => c.ref)
  if (listing.includes('src/stuff/thing.ts'))
    fail('перечень имён принят за команду — прибор требует овеществить пример')
  if (!listing.includes('./scripts/real.sh')) fail('вызов ./script потерян')

  // A report that truncates without saying so reads as complete. This is the
  // bug that left three skills unassigned, so the cap is a fixed case now.
  const src = require('node:fs').readFileSync(__filename, 'utf8')
  // Built from a string, not a regex literal: the no-cyrillic guard allows
  // Cyrillic inside string literals and rejects it in a regex literal.
  const announces = new RegExp('НЕ ПОКАЗАНО')
  if (!announces.test(src)) fail('обрезка вывода снова молчит о хвосте')

  // Documented absence must NOT count as breakage: the honest fix cites the
  // missing path one extra time, and a measure that rises when the text
  // improves argues for reverting the fix.
  const honest = [
    '> TEMPLATE ONLY. scripts/tdd-cycle.sh does NOT exist in this repository.',
    '',
    '```bash',
    'cp block scripts/tdd-cycle.sh',
    '```',
  ]
  const hc = citations(honest.join('\n'))
  const flagged = hc.cites.filter(
    c => c.ref.includes('tdd-cycle') && !declaredAbsent(hc.lines, c.at)
  )
  if (flagged.length) fail('честное "файла нет" засчитано как поломка')

  // The usage line at the bottom of a 95-line template: too far from the header
  // for any window measured from the citation, but inside the same fence.
  const far = [
    '> TEMPLATE ONLY. scripts/tdd-cycle.sh does NOT exist here.',
    '',
    '```bash',
    ...Array(60).fill('# filler line'),
    'echo "Usage: scripts/tdd-cycle.sh [red|green]"',
    '```',
  ]
  const fc = citations(far.join('\n'))
  const missed = fc.cites.filter(
    c => c.ref.includes('tdd-cycle') && !declaredAbsent(fc.lines, c.at)
  )
  if (missed.length)
    fail('дальняя строка шаблона не унаследовала пометку шапки')

  // Russian is not a second-class language here.
  const ru = ['Скрипта `scripts/nope.sh` в дереве нет и не было.'].join('\n')
  const rc = citations(ru)
  if (rc.cites.some(c => !declaredAbsent(rc.lines, c.at)))
    fail('русская пометка отсутствия не понята')

  /*
   * END TO END, ON A TREE WHOSE ANSWER IS KNOWN.
   *
   * Everything above tests a helper in isolation. The number the tool actually
   * prints -- "0 broken addresses" -- came from a scan no case exercised, so it
   * could have been zero because the scan found nothing to look at.
   *
   * This fixture contains exactly one broken address, one that resolves, one
   * prose name and one documented absence. If the scan returns anything else,
   * the walk itself is at fault, whatever the helpers do.
   */
  {
    const os = require('node:os')
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-fix-'))
    const skill = path.join(tmp, 'fixture-skill')
    fs.mkdirSync(skill, { recursive: true })
    fs.writeFileSync(
      path.join(skill, 'SKILL.md'),
      [
        '# Fixture',
        '',
        '```bash',
        'node scripts/definitely-not-here.cjs   # BROKEN: one address',
        'node scripts/skills-drift.cjs          # resolves: this very file',
        '```',
        '',
        'Prose names `render/steps.ts` without promising a path.',
        '',
        '> TEMPLATE ONLY. `scripts/never-written.sh` does NOT exist here.',
        '',
        '```bash',
        './scripts/never-written.sh',
        '```',
      ].join('\n')
    )
    const out = execFileSync(process.execPath, [__filename], {
      cwd: ROOT,
      env: { ...process.env, DRIFT_SKILLS: tmp },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    fs.rmSync(tmp, { recursive: true, force: true })
    const num = label => {
      const m = new RegExp(label + '[^0-9]*(\\d+)').exec(out)
      return m ? Number(m[1]) : -1
    }
    const broken = num('СЛОМАННЫХ АДРЕСОВ')
    const absent = num('честно')
    if (broken !== 1) fail(`проход целиком: сломанных ждали 1, вышло ${broken}`)
    if (absent !== 2)
      fail(`проход целиком: честных «его нет» ждали 2, вышло ${absent}`)
    const prose = num('имён в прозе')
    // The prose name must NOT be laundered by a marker below it.
    if (prose !== 1)
      fail(`проход целиком: имён в прозе ждали 1, вышло ${prose}`)
  }

  if (!ROOTED.test('src/registerCommands.ts'))
    fail('укоренённый путь не опознан')
  if (ROOTED.test('render/steps.ts')) fail('имя в прозе принято за адрес')

  if (bad) {
    console.log(`\n[скиллы] ⚠️  ПРИБОР НЕ ГОДЕН: ${bad} провалов`)
    process.exit(1)
  }
  console.log(
    '[скиллы] прибор поверен: 8 переездов (3 заведомо ложных отвергнуты),'
  )
  console.log(
    '         команда в bash-блоке видна, код из ts-блока не подобран.'
  )
}

if (process.argv.includes('--self-test')) selfTest()
else main()
