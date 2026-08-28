#!/usr/bin/env node
/**
 * Один прогон всего, что должно быть зелёным перед релизом.
 *
 * ЗАЧЕМ. GitHub Actions в этом репозитории не запускается: задания падают за
 * секунды с «The job was not started because recent account payments have
 * failed or your spending limit needs to be increased». Последний успешный
 * прогон — 2026-06-02. Пока это так, «зелёный CI» проверить нечем, а сломанные
 * шаги копятся незамеченными: голый `bun test` давал 548 падений, а
 * `prettier --check` падал на 456 файлах — и никто этого не видел месяцами.
 *
 * Этот скрипт повторяет набор проверок локально и судит ТОЛЬКО по кодам
 * возврата. Не по выводу: grep по тексту уже дважды давал ложный зелёный
 * (шаблон ловил не то, а код возврата брался у последней команды конвейера).
 *
 * Провалившиеся шаги НЕ прерывают прогон — иначе после первой же ошибки
 * остальное остаётся неизмеренным, и вторая правка вскрывает третью проблему.
 * Выходной код ненулевой, если провалился хоть один.
 */
const { spawnSync } = require('child_process')

const STEPS = [
  ['typecheck', 'bun', ['run', 'typecheck']],
  ['lint', 'bun', ['run', 'lint']],
  ['prettier', 'bunx', ['prettier', '--check', 'src/**/*.ts']],
  ['build', 'bun', ['run', 'build']],
  ['check:dead-domain', 'bun', ['run', 'check:dead-domain']],
  ['check:events', 'bun', ['run', 'check:events']],
  ['check:player-types', 'bun', ['run', 'check:player-types']],
  ['security:scan', 'bun', ['run', 'security:scan']],
  ['audit', 'bun', ['audit', '--audit-level=critical']],
  ['test:bun', 'bun', ['run', 'test:bun']],
  ['test:player', 'bun', ['run', 'test:player']],
  ['test:vitest', 'bun', ['run', 'test:vitest']],
  ['test-gate', 'node', ['scripts/test-gate.cjs']],
]

const results = []
for (const [name, cmd, args] of STEPS) {
  process.stdout.write(`… ${name}`)
  const started = Date.now()
  const r = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8' })
  // Команда, которую не удалось запустить, — это НЕ успех. spawnSync в таком
  // случае отдаёт status === null; без этой ветки отсутствующий bun выглядел
  // бы как пройденная проверка.
  const code = r.error ? -1 : r.status === null ? -1 : r.status
  const secs = ((Date.now() - started) / 1000).toFixed(1)
  results.push({ name, code, secs, out: (r.stdout || '') + (r.stderr || '') })
  process.stdout.write(`\r${code === 0 ? '✅' : '❌'} ${name} (${secs}s)\n`)
}

const failed = results.filter(r => r.code !== 0)
if (failed.length) {
  console.error(`\n❌ провалено шагов: ${failed.length} из ${results.length}\n`)
  for (const f of failed) {
    console.error(`--- ${f.name} (код ${f.code}) ---`)
    console.error(f.out.split('\n').filter(Boolean).slice(-12).join('\n'))
    console.error('')
  }
  process.exit(1)
}

console.log(`\n✅ все ${results.length} шагов зелёные`)
