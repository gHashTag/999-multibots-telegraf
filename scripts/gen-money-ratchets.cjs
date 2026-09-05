#!/usr/bin/env node
/**
 * Generates the index of money ratchets: every file with the statement its
 * author already wrote in the describe title.
 *
 * WHY GENERATED AND NOT WRITTEN
 *
 * it.181 built the map of twelve invariants by hand and it was right to: those
 * twelve are families, and a family is a judgement. Extending the same shape to
 * all 98 was measured and refused twice over:
 *
 *   - classifying by keyword put 42 of 97 into three or more families at once,
 *     because mentioning `refund` is not enforcing a refund invariant;
 *   - classifying by the authored "(no ...)" clause covers only 25 files, and
 *     those 25 carry 20 distinct clauses -- per-file consequences, not families.
 *
 * Any taxonomy over the remaining files would have been my invention presented
 * as the repository's structure. What the repository DOES already state, for
 * every ratchet, is the describe title. So the index is flat and complete
 * rather than grouped and confident.
 *
 * Because it is generated, moneyRatchetsIndexIsCurrent.test.ts can regenerate
 * it and compare: a renamed file or a retitled describe reddens the test
 * instead of leaving a document quietly false.
 *
 * WHY THE MATCHER IS NOT A SINGLE SPELLING
 *
 * The first extractor read `describe('...')` only, and reported one file as
 * having no title at all. It had one -- written as
 * `describe.each(SCENES)('%s credits a TON payment once', ...)`. A population
 * defined by one spelling of a thing is the defect this repository keeps
 * finding; here it would have put a false "no statement" row into the index.
 */

const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname, '..', 'src', '__tests__', 'money')

/** `describe(...)`, `describe.each(...)(...)`, `describe.skip(...)` alike. */
const DESCRIBE = /describe(?:\.\w+)?\s*\([^)]*?\)?\s*\(?\s*(['"`])([^'"`]+)\1/

function titleOf(source) {
  const direct = source.match(/describe\s*\(\s*(['"`])([^'"`]+)\1/)
  if (direct) return direct[2]
  const each = source.match(DESCRIBE)
  return each ? each[2] : null
}

function rows() {
  return fs
    .readdirSync(DIR)
    .filter(f => f.endsWith('.test.ts'))
    .sort()
    .map(f => ({
      file: f,
      title: titleOf(fs.readFileSync(path.join(DIR, f), 'utf8')),
    }))
}

function render() {
  const all = rows()
  const untitled = all.filter(r => !r.title)
  const lines = [
    '# Реестр денежных ратчетов',
    '',
    '**Файл сгенерирован.** Правки руками будут стёрты: источник — заголовки',
    '`describe` самих тестов, а сверку делает',
    '`src/__tests__/money/moneyRatchetsIndexIsCurrent.test.ts`.',
    '',
    'Зачем плоский список, а не группировка по семьям: группировка измерялась',
    'дважды и оба раза оказалась выдумкой (по ключевым словам 42 файла из 97',
    'попадали сразу в три семьи; по авторской оговорке «(no ...)» покрывается 25',
    'файлов на 20 разных оговорок). Двенадцать НАСТОЯЩИХ семей живут в',
    '[карте инвариантов](money-invariants.md) — они выведены чтением, а не',
    'матчером. Здесь — полный список того, что репозиторий уже утверждает сам.',
    '',
    `Ратчетов: ${all.length}. Без заголовка: ${untitled.length}.`,
    '',
    '| файл | что утверждает |',
    '|---|---|',
    ...all.map(r => `| \`${r.file}\` | ${r.title || '**заголовка нет**'} |`),
    '',
  ]
  return lines.join('\n')
}

module.exports = { rows, render, titleOf }

if (require.main === module) {
  const out = path.join(__dirname, '..', 'docs', 'money-ratchets.md')
  fs.writeFileSync(out, render())
  const all = rows()
  console.log(`записано: ${out}`)
  console.log(
    `ратчетов: ${all.length}, без заголовка: ${all.filter(r => !r.title).length}`
  )
}
