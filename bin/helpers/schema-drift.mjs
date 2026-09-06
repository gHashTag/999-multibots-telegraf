/*
 * РАСХОЖДЕНИЕ СХЕМЫ: ЧТО ОБЪЯВЛЕНО В КОДЕ ПРОТИВ ТОГО, ЧТО ЕСТЬ В БАЗЕ.
 *
 * Написано 07.09.2026 по следам собственной ошибки. Я прочитал grep и решил,
 * что вставка кода спаривания не заполняет две колонки `NOT NULL` -- то есть
 * что выдача кодов падает. Замер показал обратное: колонки принадлежат другой
 * таблице, а живая база и вовсе старше объявления.
 *
 * Отсюда правило, ради которого этот файл существует: `CREATE TABLE IF NOT
 * EXISTS` на существующей базе НЕ ВЫПОЛНЯЕТСЯ. Объявление в коде и схема в
 * проде расходятся молча и живут так годами; заметить это можно только
 * сравнив. Ошибка вылезает в день пересоздания базы -- на новом окружении, на
 * стенде, при восстановлении -- то есть в худший день из возможных.
 */
import pg from 'pg'
import fs from 'node:fs'

const ИСХОДНИК = process.argv[2]
const src = fs.readFileSync(ИСХОДНИК, 'utf8')

const таблицы = new Map()
for (const m of src.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\s*\)`/g)) {
  const колонки = []
  for (const строка of m[2].split('\n')) {
    const s = строка.trim().replace(/,$/, '')
    const мм = /^(\w+)\s+(.+)$/.exec(s)
    if (!мм) continue
    if (/^(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT|CHECK)$/i.test(мм[1])) continue
    колонки.push({ имя: мм[1], notNull: /NOT NULL/i.test(мм[2]), def: /DEFAULT/i.test(мм[2]) })
  }
  таблицы.set(m[1], колонки)
}
console.log(`  таблиц объявлено: ${таблицы.size}`)
if (!таблицы.size) {
  // Ноль таблиц -- это НЕ «всё сходится». Разбор мог сломаться о новый отступ.
  console.log('  разбор ничего не нашёл -- проверка НЕ выполнена')
  process.exit(1)
}

const c = new pg.Client({ connectionString: process.env.DB, ssl: { rejectUnauthorized: false } })
await c.connect()
let расхождений = 0
for (const [имя, колонки] of таблицы) {
  const live = await c.query(
    'SELECT column_name FROM information_schema.columns WHERE table_name=$1', [имя])
  const есть = new Set(live.rows.map(r => r.column_name))
  if (!есть.size) {
    console.log(`  ${имя}: в базе НЕТ -- заведётся при первом запуске`)
    continue
  }
  const нет = колонки.filter(k => !есть.has(k.имя))
  if (нет.length) {
    расхождений++
    const опасно = нет.filter(k => k.notNull && !k.def)
    console.log(`  ${имя}: в коде есть, в базе нет -> ${нет.map(k => k.имя).join(', ')}`)
    if (опасно.length)
      console.log(`     ОПАСНО (NOT NULL без умолчания): ${опасно.map(k => k.имя).join(', ')}`)
  }
  const лишние = [...есть].filter(n => !колонки.some(k => k.имя === n))
  if (лишние.length) {
    расхождений++
    console.log(`  ${имя}: в базе есть, в коде нет -> ${лишние.join(', ')}`)
  }
}
await c.end()
console.log(расхождений ? `  расхождений: ${расхождений}` : '  расхождений нет')
