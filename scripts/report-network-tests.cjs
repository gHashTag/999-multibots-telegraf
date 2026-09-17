#!/usr/bin/env node
/**
 * Отчёт после `npm run test:network`: кто из тестов ходил в сеть по-настоящему.
 *
 * Зачем. Тест, делающий настоящий сетевой вызов, зависит от того, что ответит
 * чужой сервер, — и однажды отвечает иначе. Так `saveVideoUrlToSupabase.test.ts`
 * стал «зелёным со второго раза»: он не заглушал зеркалирование, которое
 * СКАЧИВАЕТ файл, и проходил лишь потому, что адрес не существует.
 *
 * Единичный флак обесценивает проверку постепенно: если часть красного
 * считается шумом, «регрессий нет» перестаёт что-либо значить.
 */
const fs = require('fs')

const LOG = process.env.NETWORK_LOG || '/tmp/vitest-network.log'
const MARK = LOG + '.mark'

const loads = fs.existsSync(MARK)
  ? fs.readFileSync(MARK, 'utf8').split('\n').filter(Boolean).length
  : 0

if (loads === 0) {
  console.error(
    '❌ Наблюдатель не подключился ни к одному файлу тестов — отчёт бессмыслен.\n' +
      '   Проверьте setupFiles в vitest.config.ts и переменную DETECT_NETWORK.'
  )
  process.exit(2)
}

const allLines = fs.existsSync(LOG)
  ? fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean)
  : []

// The observer's own control calls a dead local port and is NOT test traffic.
// It is counted separately: it MUST be present, and its absence means the
// control did not run -- not that the suite got cleaner.
const PROBE = '127.0.0.1:1'
const control = allLines.filter(l => l.includes(PROBE))
const calls = allLines.filter(l => !l.includes(PROBE))

if (control.length === 0) {
  console.error(
    '❌ Контрольный зонд наблюдателя не отметился — отчёт недостоверен.\n' +
      '   Ожидались вызовы на ' +
      PROBE +
      ' из network-observer-probe.test.ts.\n' +
      '   Без него «ноль вызовов» неотличим от слепого наблюдателя.'
  )
  process.exit(2)
}

console.log(`наблюдатель подключился к ${loads} файлам тестов`)
console.log(
  `контроль наблюдателя (fetch и axios): ${control.length} — оба канала видны`
)
console.log(`настоящих сетевых вызовов: ${calls.length}`)

if (!calls.length) {
  console.log('✅ Ни один тест не ходит в сеть.')
  process.exit(0)
}

const byUrl = {}
for (const c of calls) byUrl[c] = (byUrl[c] || 0) + 1
console.log('\nкуда ходили:')
for (const [u, n] of Object.entries(byUrl).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${u}`)
}
/*
 * exitCode, not exit(): process.exit throws away writes still queued on a pipe,
 * and this script prints a list that a person reads through one. Node's own
 * documentation calls the result "truncated and lost". Measured on the Cyrillic
 * gate, 2026-09-17: 966, 7706 and 8484 of the same 8484 lines on three runs.
 * Safe here because this is the last statement at the top level.
 */
process.exitCode = 1
