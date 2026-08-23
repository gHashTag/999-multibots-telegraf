#!/usr/bin/env node
/** Пересобирает scripts/tests-baseline.json из отчёта последнего полного
 *  прогона. Зовётся из `npm run test:baseline`. Отдельный шаг нужен, чтобы
 *  база менялась ОСОЗНАННО: молча подстраивать её под текущее состояние —
 *  значит узаконивать любую новую поломку. */
const { readFileSync, writeFileSync } = require('fs')
const { resolve } = require('path')
const root = resolve(__dirname, '..')
const rep = JSON.parse(readFileSync('/tmp/vitest-baseline.json', 'utf8'))
const files = rep.testResults || []
const failed = [
  ...new Set(
    files
      .filter(f => f.status === 'failed')
      .map(f => f.name.replace(root + '/', ''))
  ),
].sort()
const prev = JSON.parse(
  readFileSync(resolve(root, 'scripts', 'tests-baseline.json'), 'utf8')
)
writeFileSync(
  resolve(root, 'scripts', 'tests-baseline.json'),
  JSON.stringify(
    {
      ...prev,
      снято: new Date().toISOString().slice(0, 10),
      всего_файлов: files.length,
      падающих_файлов: failed.length,
      падающих_тестов: rep.numFailedTests,
      файлы: failed,
    },
    null,
    2
  ) + '\n'
)
const delta = failed.length - (prev.падающих_файлов ?? failed.length)
console.log(
  `база обновлена: ${failed.length} падающих файлов из ${files.length}` +
    (delta
      ? ` (${delta > 0 ? '+' : ''}${delta} к прошлой)`
      : ' (без изменений)')
)
