#!/usr/bin/env node
/**
 * Ставит git-хуки после npm install — но ТОЛЬКО там, где они имеют смысл.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ СКРИПТ, А НЕ `prepare: lefthook install`.
 * Прямой вызов уронил три сборки подряд. В образе бота `.git/` исключён
 * .dockerignore, а сам lefthook — devDependency, которую `npm install
 * --omit=dev` не ставит. Итог: `fatal: not a git repository`, exit 128,
 * и вся сборка падает на установке зависимостей. Хуки в продакшн-контейнере
 * не нужны вообще — там некому делать коммиты.
 *
 * ЗАЧЕМ НЕ `lefthook install || true`. Это ровно тот приём, из-за которого
 * гейты в этом репозитории годами отчитывались об успехе, ничего не проверив:
 * ошибка проглатывается ВСЯ, включая настоящую поломку. Здесь условие названо
 * явно — «нет репозитория или нет lefthook», — а любой ДРУГОЙ сбой установки
 * по-прежнему валит процесс с ненулевым кодом.
 */
const { existsSync } = require('fs')
const { execFileSync } = require('child_process')
const { resolve } = require('path')

const root = resolve(__dirname, '..')

// Условие 1: это рабочая копия разработчика, а не контекст сборки образа.
if (!existsSync(resolve(root, '.git'))) {
  console.log(
    '[hooks] .git отсутствует — сборка образа, хуки не нужны. Пропускаю.'
  )
  process.exit(0)
}

// Условие 2: lefthook установлен. При --omit=dev его нет, и это нормально.
const bin = resolve(root, 'node_modules', '.bin', 'lefthook')
if (!existsSync(bin)) {
  console.log('[hooks] lefthook не установлен (--omit=dev?) — пропускаю.')
  process.exit(0)
}

// Дальше любая ошибка — настоящая, и она должна быть видна.
/*
 * Condition 3: clear somebody else's core.hooksPath, or the install does
 * NOTHING.
 *
 * This was the hole that cost a day. `core.hooksPath` pointed at `.husky`, git
 * ran husky, and lefthook printed "Custom hooks paths are not supported by
 * default" and "Skipping hook sync" on every single commit -- then skipped the
 * sync. Not one of the six pre-commit checks ran, while `npm install` reported
 * success, and the only hint was a warning nobody read.
 *
 * The setting is LOCAL, so it survives in the working copy of anyone who ever
 * installed husky here. It is cleared out loud: silently rewriting somebody's
 * git config is the next mystery, not a fix.
 */
/*
 * Both scopes (2026-10-03): a worktree's own config.worktree can carry the
 * same setting, and `--local` does not see it. 11 of 63 worktrees committed
 * with no gate at all that way. `tri hooks` finds them across every tree.
 */
for (const scope of ['--local', '--worktree']) {
  let hooksPath = ''
  try {
    hooksPath = execFileSync('git', ['config', scope, 'core.hooksPath'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // Not set (or no worktree config in this repo): the normal case.
  }
  if (!hooksPath) continue
  console.log(
    `[hooks] core.hooksPath (${scope}) points at ${hooksPath}. lefthook skips` +
      ' its sync when that is set, so no hook actually runs. Clearing it.'
  )
  execFileSync('git', ['config', '--unset-all', scope, 'core.hooksPath'], {
    stdio: 'inherit',
    cwd: root,
  })
}

execFileSync(bin, ['install'], { stdio: 'inherit', cwd: root })
