#!/usr/bin/env node
/**
 * THE PLAYER'S OWN LINT, WHICH NOTHING WAS RUNNING.
 *
 * Found 25.09.2026 while auditing the gates for the shape "success is
 * indistinguishable from nothing to check" (form 196). The player has an
 * eslint config, it works, and it catches real things -- and no gate calls
 * it. The root `lint` step runs eslint from the repository root, whose
 * config carries `ignorePatterns: ['apps/']`, so every player file it is
 * handed prints "File ignored because of a matching ignore pattern" and the
 * step passes. Measured: 448 problems, 425 of them errors, in code that has
 * been shipping for months.
 *
 * WHY A RATCHET AND NOT A GATE. Blocking on 425 pre-existing errors would
 * stop the owner's next commit for something he did not write. The errors
 * are spread across the tree -- 155 unused variables, 148 explicit `any`,
 * and no single file worth a night -- so there is no quick cleanup either.
 *
 * So the number may only go DOWN. A new error fails the push; fixing any of
 * the old ones lowers the line for good. And the other direction is checked
 * too: a baseline that has drifted ABOVE the real count is stale and says
 * so, because a ratchet that quietly allows more than it claims is worse
 * than none -- it reads as a promise nobody is keeping.
 *
 * Runs on push, not on commit: the player's lint takes tens of seconds, and
 * that is the wrong price for every `git commit`.
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const PLAYER = path.join(ROOT, 'apps/vibee-editor/player')
const BASELINE = path.join(__dirname, 'player-lint-baseline.json')

/*
 * The player's own binary, never `npx`: `npx eslint` in a directory without
 * its own install fetches something from the network and lints nothing --
 * the same trap check-player-types.cjs records for tsc.
 */
const BIN = path.join(PLAYER, 'node_modules', '.bin', 'eslint')

function fail(msg) {
  console.error(`\n${msg}\n`)
  process.exit(1)
}

if (!fs.existsSync(BIN)) {
  console.log('player lint: eslint не установлен в плеере — пропускаю') // cyrillic-ok: operator copy
  process.exit(0)
}

const res = spawnSync(BIN, ['.', '-f', 'json'], {
  cwd: PLAYER,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})

let report
try {
  report = JSON.parse(res.stdout || '[]')
} catch {
  fail(`player lint: не удалось прочитать отчёт eslint\n${res.stderr || ''}`) // cyrillic-ok: operator copy
}

const errors = report.reduce(
  (n, f) => n + f.messages.filter(m => m.severity === 2).length,
  0
)

/*
 * A count of zero with no files read means the lint saw nothing at all --
 * an ignored tree, a broken config, a wrong directory. "Clean" and "blind"
 * print the same number, so they are told apart here (form 196).
 */
if (report.length === 0) {
  fail('player lint: проверено НОЛЬ файлов — это слепота, а не чистота') // cyrillic-ok: operator copy
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
const allowed = Number(baseline.errors)
const seenBefore = Number(baseline.files ?? 0)

/*
 * PARTIAL BLINDNESS IS THE ONE WAY A RATCHET TIGHTENS ITSELF WRONGLY.
 *
 * Zero files is caught above, but a config change that quietly stops reading
 * half the tree also lowers the count -- and the baseline would follow it
 * down, so the day the files come back the push fails for work nobody did.
 * A large drop in the number of FILES is therefore refused rather than
 * recorded.
 */
if (seenBefore && report.length < seenBefore * 0.9) {
  fail(
    `player lint: прочитано ${report.length} файлов против ${seenBefore} — ` + // cyrillic-ok: operator copy
      `проверка ослепла на части дерева, уровень не трогаю` // cyrillic-ok
  )
}

if (errors > allowed) {
  fail(
    `player lint: ошибок ${errors}, а разрешено ${allowed}.\n` + // cyrillic-ok: operator copy
      `Новая ошибка в плеере. Посмотреть:\n` + // cyrillic-ok
      `  cd apps/vibee-editor/player && npx eslint .` // cyrillic-ok
  )
}

/*
 * AN IMPROVEMENT TIGHTENS THE LINE, AND DOES NOT FAIL THE PUSH.
 *
 * The first version refused a push that had FEWER errors, telling the author
 * to record the new level by hand. A gate that complains about good work is
 * a gate people learn to skip. It records it itself; a lower line is always
 * safe, and the one way it could be recorded wrongly is guarded above.
 */
if (errors < allowed) {
  fs.writeFileSync(
    BASELINE,
    `${JSON.stringify(
      { errors, files: report.length, measured: today(), note: baseline.note },
      null,
      2
    )}\n`
  )
  console.log(
    `player lint: было ${allowed}, стало ${errors} — уровень опущен, ` + // cyrillic-ok
      `закоммить scripts/player-lint-baseline.json` // cyrillic-ok
  )
  process.exit(0)
}

console.log(`player lint: ${errors} ошибок, как и записано (${allowed})`) // cyrillic-ok

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}
