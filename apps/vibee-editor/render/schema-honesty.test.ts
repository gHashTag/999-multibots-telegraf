import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * ЗАЯВЛЕННАЯ СХЕМА И РАБОТАЮЩИЙ КОД ДОЛЖНЫ СОВПАДАТЬ.
 *
 * Найдено при разборе входа 07.09.2026: `ensureAuthTables` заводила таблицу
 * `oidc_auth_requests`, на которую во всём репозитории нет ни одной вставки и
 * ни одного чтения. Заготовка под вход по OIDC, который не написан.
 *
 * Пустая таблица ничего не стоит — стоит ложь. Схема описывает ДВЕРИ: тот, кто
 * её читает, видел четвёртый способ войти и был вправе считать, что он есть.
 *
 * Второй сторож, важнее первого: колонка, объявленная `NOT NULL` без
 * умолчания, обязана заполняться хоть какой-то вставкой. Иначе на СВЕЖЕЙ базе
 * таблица родится с ограничением, которого не переживёт ни один INSERT, — а на
 * старой ничего не сломается, потому что `CREATE TABLE IF NOT EXISTS` там не
 * выполняется вовсе. Дефект, невидимый до дня пересоздания базы.
 */

const КОРЕНЬ = __dirname

function собратьИсходники(каталог: string, собрано: string[] = []): string[] {
  for (const имя of fs.readdirSync(каталог)) {
    if (имя === 'node_modules' || имя === 'dist' || имя.startsWith('.')) continue
    const полный = path.join(каталог, имя)
    const инфо = fs.statSync(полный)
    if (инфо.isDirectory()) собратьИсходники(полный, собрано)
    else if (имя.endsWith('.ts') && !имя.endsWith('.test.ts')) собрано.push(полный)
  }
  return собрано
}

const ХРАНИЛИЩЕ = fs.readFileSync(path.join(КОРЕНЬ, 'session-store.ts'), 'utf8')
const ВЕСЬ_КОД = собратьИсточники()

function собратьИсточники(): string {
  return собратьИсходники(КОРЕНЬ)
    .map(f => fs.readFileSync(f, 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

interface Колонка {
  имя: string
  notNull: boolean
  umolchanie: boolean
}

/** Разбор всех `CREATE TABLE IF NOT EXISTS` из session-store. */
function таблицы(): Map<string, Колонка[]> {
  const из = new Map<string, Колонка[]>()
  for (const m of ХРАНИЛИЩЕ.matchAll(
    /CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\s*\)`/g
  )) {
    const колонки: Колонка[] = []
    for (const строка of m[2].split('\n')) {
      const s = строка.trim().replace(/,$/, '')
      const мм = /^(\w+)\s+(.+)$/.exec(s)
      if (!мм) continue
      if (/^(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT|CHECK)$/i.test(мм[1])) continue
      колонки.push({
        имя: мм[1],
        notNull: /NOT NULL/i.test(мм[2]),
        umolchanie: /DEFAULT/i.test(мм[2]),
      })
    }
    из.set(m[1], колонки)
  }
  return из
}

describe('схема входа не описывает того, чего нет', () => {
  it('таблицы вообще разобраны', () => {
    // Иначе всё ниже зеленеет на пустой карте.
    expect(таблицы().size).toBeGreaterThanOrEqual(5)
  })

  it('каждая заведённая таблица где-то используется', () => {
    const мёртвые: string[] = []
    for (const имя of таблицы().keys()) {
      const упоминания = ВЕСЬ_КОД.split(имя).length - 1
      // Одно упоминание — это сам CREATE. Работающая таблица упомянута ещё где-то.
      if (упоминания <= 1) мёртвые.push(имя)
    }
    expect(мёртвые, 'таблица заводится и не используется').toEqual([])
  })

  it('колонка NOT NULL без умолчания обязана заполняться вставкой', () => {
    const беда: string[] = []
    for (const [имя, колонки] of таблицы()) {
      const вставки = [...ВЕСЬ_КОД.matchAll(
        new RegExp(`INSERT INTO ${имя} \\(([^)]*)\\)`, 'g')
      )].map(m => m[1])
      if (!вставки.length) continue
      const заполняемые = new Set(
        вставки.flatMap(в => в.split(',').map(c => c.trim()))
      )
      for (const k of колонки) {
        if (k.notNull && !k.umolchanie && !заполняемые.has(k.имя)) {
          беда.push(`${имя}.${k.имя}`)
        }
      }
    }
    expect(беда, 'на свежей базе вставка упрётся в NOT NULL').toEqual([])
  })
})

describe('записи о запусках не копятся вечно', () => {
  it('уборка стоит в уже существующем опросе, а не в новом таймере', () => {
    /*
     * `app_launch_families` растёт по строке на каждый запуск мини-аппа, а
     * полезна ровно сутки — столько живёт сама initData.
     *
     * Проверка ТЕКСТОВАЯ, и это её предел: она видит запрос, а не то, что он
     * выполняется. Настоящее доказательство — что `pollRevocations` вызывается
     * по таймеру — уже закреплено в session-revocation-runtime.test.ts, и
     * дублировать его здесь значило бы делать вид, что проверено дважды.
     */
    const код = ХРАНИЛИЩЕ.replace(/\/\*[\s\S]*?\*\//g, '')
    const опрос = код.slice(код.indexOf('export async function pollRevocations'))
    expect(опрос).toContain('DELETE FROM app_launch_families')
  })
})
