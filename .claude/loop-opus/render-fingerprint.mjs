// Локальный отпечаток композиций — тот же расчёт, что и в render-server.ts.
//
//   node .claude/loop-opus/render-fingerprint.mjs [путь-к-render]
//   node .claude/loop-opus/render-fingerprint.mjs --compare   # сверить с продом
//
// Совпало с полем `compositions` в /health — образ свежий.
// Разошлось — сервис крутит не тот код, и зелёный статус деплоя этого не меняет.

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const compare = args.includes('--compare')
const base = args.find(a => !a.startsWith('--')) || 'apps/vibee-editor/render'

function fingerprint(renderDir) {
  const dir = path.resolve(renderDir, 'src/compositions')
  if (!fs.existsSync(dir)) return null
  const files = fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
    .sort()
  if (files.length === 0) return null
  const h = createHash('sha1')
  for (const f of files) {
    h.update(f)
    h.update(fs.readFileSync(path.join(dir, f)))
  }
  return `${h.digest('hex').slice(0, 12)}+${files.length}`
}

const local = fingerprint(base)
console.log('локальный отпечаток:', local ?? 'НЕ ПОСЧИТАН')

if (!compare) process.exit(local ? 0 : 2)

const res = await fetch('https://vibee-render-production.up.railway.app/health')
  .then(r => r.json())
  .catch(e => ({ error: String(e) }))

if (res.error) {
  console.log('прод недоступен:', res.error)
  process.exit(2)
}

console.log('отпечаток прода: ', res.compositions ?? 'ПОЛЕ ОТСУТСТВУЕТ (правка ещё не задеплоена)')
console.log('поднят:          ', res.startedAt ?? '—')

if (res.compositions == null) {
  // Не 0: отсутствие поля означает «сравнить нечем», а не «всё совпало».
  console.log('ВЫВОД: сверить нечем')
  process.exit(2)
}
if (res.compositions === local) {
  console.log('ВЫВОД: совпало — прод крутит те же исходники')
  process.exit(0)
}
console.log('ВЫВОД: РАСХОЖДЕНИЕ — прод рисует НЕ из этого кода')
process.exit(1)
