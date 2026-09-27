#!/usr/bin/env node
/**
 * A TYPE-ERROR RATCHET FOR ONE APP UNDER apps/: the count may only fall.
 *
 * Shared by the player and the render gates -- shared for the same reason a
 * rule is never hand-copied into a second file: the three counting traps below
 * each cost a full cycle to learn, and a second copy of this code would have
 * known about them only until its first edit.
 *
 * WHY A RATCHET AND NOT ZERO. "46 errors, same as on main" closed the gate for
 * several cycles in a row and meant exactly nothing. Inside it sat two real
 * ReferenceErrors and three silently dropped values. A constant number reads as
 * background right up until somebody reads it -- so the condition is not "must
 * be 0" but "no more than yesterday".
 *
 * WHY A SCRIPT AND NOT A LINE IN lefthook. The root type check excludes
 * `^apps/` entirely: every app there has its own tsconfig and its own
 * node_modules, so a plain `tsc --noEmit` from the root cannot count them.
 *
 * The text printed to the owner is Russian on purpose -- he reads it.
 */

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..')

function fail(msg) {
  console.error(`\n❌ ${msg}\n`)
  process.exit(1)
}

/**
 * THE GUARD AGAINST "CHECKED THE WRONG TREE".
 *
 * Four times over two cycles: the edits live in a worktree, the script runs in
 * the main checkout -- and cheerfully prints "exactly the baseline" without
 * having looked at the changes at all. Nothing gives it away: the number is
 * right, the exit code is zero, it just measured the wrong copy. A lesson in a
 * skill did not save us from this four times running, so it takes a check, not
 * a lesson.
 *
 * A warning, not a refusal: a clean tree is checked on purpose when taking a
 * baseline. Staying silent about it is what is not allowed.
 */
function warnIfWrongTree(scope) {
  const dirty = tree => {
    const r = spawnSync(
      'git',
      /*
       * `-uno` -- untracked excluded. The first version counted those as
       * changes and fired on the node_modules symlink that every worktree has
       * and that means nothing. A false alarm kills trust in a warning faster
       * than its absence: one "oh, it always says that" and the real one gets
       * scrolled past too.
       */
      ['status', '--porcelain', '-uno', '--', ...scope],
      { cwd: tree, encoding: 'utf8' }
    )
    return r.status === 0 && r.stdout.trim().length > 0
  }

  if (dirty(ROOT)) return /* changes are here -- all good */

  const wt = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (wt.status !== 0) return

  const elsewhere = wt.stdout
    .split('\n')
    .filter(l => l.startsWith('worktree '))
    .map(l => l.slice('worktree '.length).trim())
    .filter(d => path.resolve(d) !== path.resolve(ROOT))
    .filter(dirty)
  if (!elsewhere.length) return

  console.warn(
    '\n⚠️  ВОЗМОЖНО, ПРОВЕРЯЕТСЯ НЕ ТО ДЕРЕВО.\n' +
      `   Здесь (${ROOT}) правок нет,\n` +
      '   а вот тут есть:\n' +
      elsewhere.map(d => `     ${d}`).join('\n') +
      '\n   Запустите копию скрипта ОТТУДА, иначе число ниже ничего не значит.\n'
  )
}

/**
 * One ratchet pass.
 *
 * @param {object} o
 * @param {string} o.label      how to name it in the output, in Russian
 * @param {string} o.dir        the app's directory, from the repository root
 * @param {string} o.project    which tsconfig to pass to `-p`
 * @param {number} o.baseline   how many errors are tolerated today
 * @param {string[]} o.scope    paths for the wrong-tree guard
 * @param {string} o.self       the calling script, for the baseline hint
 * @param {(file: string) => boolean} [o.mine]
 *        whether an error in that file is ours. Render pulls sibling packages
 *        into its program and their debt is not its debt: a gate that fails
 *        over somebody else's file gets removed wholesale, not triaged.
 * @param {string} [o.lesson]   what past findings here turned out to be
 */
function ratchet(o) {
  const dir = path.join(ROOT, o.dir)

  /*
   * TRAP 1. `npx tsc` in a directory without its own node_modules INSTALLS an
   * unrelated `tsc@2.0.4` from the network, prints "This is not the tsc
   * command you are looking for" and exits with zero errors. The check looks
   * passed. So: an explicit path to the binary, and its existence is checked.
   */
  const TSC = path.join(dir, 'node_modules', '.bin', 'tsc')
  if (!fs.existsSync(TSC))
    fail(
      `не найден ${path.relative(process.cwd(), TSC)}\n` +
        `   Зависимости (${o.dir}) не установлены. Это НЕ «проверка пройдена»:\n` +
        '   гейт, который не может отработать, должен падать громко.'
    )

  /*
   * TRAP 2. `--pretty false` is mandatory. Coloured output puts ANSI escapes
   * between the word "error" and the code "TS2304", and a literal search for
   * "error TS" does NOT match it. That once reported 0 errors where there were
   * 1230.
   */
  const res = spawnSync(
    TSC,
    ['--noEmit', '-p', o.project, '--pretty', 'false'],
    { cwd: dir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  )
  if (res.error) fail(`не удалось запустить tsc: ${res.error.message}`)

  const out = `${res.stdout || ''}${res.stderr || ''}`
  const all = out.split('\n').filter(l => / error TS\d+: /.test(l))

  /*
   * TRAP 3. Zero matches is indistinguishable from "the check did not run":
   * empty output gives the same number. So the EXIT CODE is read too -- tsc
   * exits zero only when there really are no errors.
   */
  if (!all.length && res.status !== 0)
    fail(
      `tsc завершился с кодом ${res.status}, но ни одной строки вида ` +
        '«error TSxxxx» в выводе нет.\n' +
        '   Это не чистый прогон, а сломанный запуск. Первые строки вывода:\n' +
        out
          .split('\n')
          .slice(0, 5)
          .map(l => `   | ${l}`)
          .join('\n')
    )

  const lines = o.mine ? all.filter(l => o.mine(l.split('(')[0])) : all
  const count = lines.length

  /* Per file, so it is visible WHERE the debt is, not only how much. */
  const byFile = new Map()
  for (const l of lines) {
    const file = l.split('(')[0]
    byFile.set(file, (byFile.get(file) || 0) + 1)
  }

  warnIfWrongTree(o.scope)
  console.log(`Дерево: ${ROOT}`)
  console.log(`Ошибок типов ${o.label}: ${count} (порог ${o.baseline})`)
  if (o.mine && all.length !== count)
    console.log(
      `  (ещё ${all.length - count} в чужих файлах программы — не наш долг)`
    )
  for (const [file, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(3)}  ${file}`)

  if (count > o.baseline)
    fail(
      `стало БОЛЬШЕ: ${count} против порога ${o.baseline}.\n` +
        '   Новые ошибки типов — это находки, а не фон.\n' +
        (o.lesson ? `   ${o.lesson}\n` : '') +
        '   Разберите их, а не поднимайте порог.'
    )

  if (count < o.baseline) {
    console.log(
      `\n✅ стало меньше: ${count} < ${o.baseline}.\n` +
        `   Опустите BASELINE до ${count} в ${o.self} —\n` +
        '   иначе храповик разболтается и пропустит возврат долга.'
    )
    process.exit(0)
  }

  console.log('\n✅ не выросло')
}

module.exports = { ratchet, ROOT }
