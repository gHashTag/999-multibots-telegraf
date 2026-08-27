#!/usr/bin/env node
/**
 * Добавить след в landed.json — с ПРОВЕРКОЙ иглы в момент записи.
 *
 * ЗАЧЕМ. Три раза подряд verify-landed.mjs кричал «ПРАВКА ПРОПАЛА С main» и
 * предлагал восстанавливать cherry-pick поверх целого main. Каждый раз правка
 * была на месте, а врала игла: то записана строчными при заглавной в файле,
 * то для файла теста вместо компонента, то по памяти — без экранирующих
 * слэшей регулярного выражения.
 *
 * Инструмент работал верно все три раза. Ошибка была в данных, которые я в
 * него клал. Значит чинить надо не внимательность, а момент записи: игла,
 * которой нет в файле СЕЙЧАС, не может быть записана вообще.
 *
 *   node .claude/loop-opus/add-trace.mjs <pr> <файл> <игла> <заметка>
 *
 * Игла ищется в версии файла на origin/main, а не в рабочем дереве: след
 * должен подтверждать, что правка ДОЕХАЛА, а не что она есть у меня локально.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const LANDED = path.join(here, 'landed.json')
const REPO = path.resolve(here, '..', '..')

const [pr, file, needle, ...noteParts] = process.argv.slice(2)
const note = noteParts.join(' ')

if (!pr || !file || !needle || !note) {
  console.error(
    'Использование: add-trace.mjs <pr> <файл> <игла> <заметка>\n' +
      '  Игла проверяется в версии файла на origin/main прямо сейчас.'
  )
  process.exit(2)
}

let content
try {
  content = execFileSync('git', ['show', `origin/main:${file}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
} catch {
  console.error(
    `\n❌ файла «${file}» нет на origin/main.\n` +
      '   Либо путь набран неверно, либо правка ещё не влита.\n'
  )
  process.exit(1)
}

// Регистр не важен — сравнение в verify-landed.mjs тоже без него.
if (!content.toLowerCase().includes(needle.toLowerCase())) {
  // Подсказка полезнее отказа: показываем строки, где встречается самое
  // длинное слово иглы, — обычно этого хватает, чтобы увидеть опечатку.
  const word =
    needle
      .split(/[^\p{L}\p{N}_]+/u)
      .filter(w => w.length > 3)
      .sort((a, b) => b.length - a.length)[0] || ''
  const hints = word
    ? content
        .split('\n')
        .map((l, i) => [i + 1, l])
        .filter(([, l]) => l.toLowerCase().includes(word.toLowerCase()))
        .slice(0, 3)
        .map(([n, l]) => `   ${n}: ${l.trim().slice(0, 100)}`)
        .join('\n')
    : ''

  console.error(
    `\n❌ иглы «${needle}» НЕТ в ${file} на origin/main — след не записан.\n` +
      '   Скопируйте иглу ИЗ ФАЙЛА, а не по памяти: три ложные тревоги\n' +
      '   подряд были именно из-за этого.\n' +
      (hints ? `\n   Похожие строки по слову «${word}»:\n${hints}\n` : '')
  )
  process.exit(1)
}

const traces = JSON.parse(fs.readFileSync(LANDED, 'utf8'))
if (traces.some(t => t.file === file && t.needle === needle)) {
  console.log(`уже записан: ${file} — «${needle}»`)
  process.exit(0)
}

traces.push({ pr: Number(pr), file, needle, note })
fs.writeFileSync(LANDED, `${JSON.stringify(traces, null, 2)}\n`)
console.log(`✅ след записан и проверен: ${file} — «${needle}» (всего ${traces.length})`)
