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
execFileSync(bin, ['install'], { stdio: 'inherit', cwd: root })
