/**
 * Швы событий Inngest: кто шлёт и кто слушает.
 *
 * Тот же класс дефекта, что и адреса маршрутов (docs/audit/route-seams.md), и
 * он ещё коварнее: Inngest ПРИНИМАЕТ любое событие и молча не находит
 * подписчика. Ошибки нет, отправка «успешна», работа не выполняется.
 *
 * Что это уже стоило:
 *   - MCP-сервер: неверны были ВСЕ ДЕВЯТЬ имён в карте — ни одну функцию из
 *     тех, что он перечисляет, запустить было нельзя
 *   - INNGEST_EVENTS: 17 из 24 констант «для типобезопасности» называли
 *     события, на которые никто не подписан
 *   - instagram/scraper против instagram/scraper-v2
 *
 * Тест разбирает исходники: нужен статический факт «объявлено там, шлём
 * отсюда», без сети и без БД.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

function collectFiles(root: string): string[] {
  const out: string[] = []
  ;(function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.ts')) out.push(p)
    }
  })(root)
  return out
}

/**
 * Комментарии вырезаем: в них намеренно цитируются СТАРЫЕ неверные имена,
 * чтобы объяснить правку. Без этого тест ловил бы собственные объяснения.
 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const isTestFile = (f: string) =>
  f.includes('__tests__') || f.includes('/test/') || f.endsWith('.test.ts')

const files = collectFiles('src')
const prodFiles = files.filter(f => !isTestFile(f))

/** Имена, на которые действительно кто-то подписан: `{ event: '...' }`. */
function collectListeners(): Set<string> {
  const set = new Set<string>()
  for (const f of prodFiles) {
    const src = strip(fs.readFileSync(f, 'utf8'))
    for (const m of src.matchAll(/\bevent:\s*['"]([a-zA-Z0-9_./-]+)['"]/g)) {
      set.add(m[1])
    }
  }
  return set
}

/** Значения карты-константы вида KEY: 'event/name'. */
function collectMapValues(
  file: string,
  marker: string
): Array<[string, string, number]> {
  const src = strip(fs.readFileSync(file, 'utf8'))
  const start = src.indexOf(marker)
  if (start === -1) return []
  const end = src.indexOf('}', start + marker.length)
  const block = src.slice(start, end)
  const out: Array<[string, string, number]> = []
  for (const m of block.matchAll(
    /([A-Za-z0-9_'-]+):\s*['"]([a-zA-Z0-9_./-]+)['"]/g
  )) {
    const line = src.slice(0, start + (m.index ?? 0)).split('\n').length
    out.push([m[1].replace(/'/g, ''), m[2], line])
  }
  return out
}

const listeners = collectListeners()

describe('швы событий Inngest', () => {
  it('нашлись подписчики — иначе тест ничего не проверяет', () => {
    // Страховка от самого себя: если регулярка перестанет что-то находить,
    // все проверки ниже станут зелёными и бессмысленными.
    expect(listeners.size).toBeGreaterThan(20)
  })

  it('каждое имя в INNGEST_EVENTS соответствует реальному подписчику', () => {
    const bad: string[] = []
    // Считаем осмотренные файлы: если оба исчезнут или переедут, цикл станет
    // пустым и проверка пройдёт, ничего не проверив. Такая слепота уже
    // случалась в осмотре секретов (docs/audit/tool-blindness.md).
    let looked = 0
    for (const file of [
      'src/inngest_app/client.ts',
      'src/inngest_app/inngestClient.ts',
    ]) {
      if (!fs.existsSync(file)) continue
      looked++
      for (const [key, value, line] of collectMapValues(
        file,
        'export const INNGEST_EVENTS'
      )) {
        if (!listeners.has(value))
          bad.push(`${file}:${line}  ${key} = '${value}'`)
      }
    }
    // Константа «для типобезопасности», указывающая в пустоту, хуже голой
    // строки: ей доверяют.
    expect(
      looked,
      'ни одного файла с INNGEST_EVENTS не открыто'
    ).toBeGreaterThan(0)
    expect(bad).toEqual([])
  })

  it('карта MCP-сервера ведёт на реальных подписчиков', () => {
    const file = 'src/inngest_app/mcp-server.ts'
    const bad: string[] = []
    for (const [key, value, line] of collectMapValues(
      file,
      'const eventMap: Record<string, string>'
    )) {
      if (!listeners.has(value))
        bad.push(`${file}:${line}  ${key} -> '${value}'`)
    }
    expect(bad).toEqual([])
  })

  it('в рабочем коде нет отправок на имена без подписчика', () => {
    /**
     * Имена, которые уходят наружу или приходят снаружи и потому не обязаны
     * иметь подписчика ЗДЕСЬ. Каждая запись — с причиной.
     */
    const EXTERNAL: Record<string, string> = {
      'test/hello.world':
        'демо-событие из handleHelloWorld, подписчик не нужен',
      'instagram/scrape-similar-users':
        'событие ветвления внутри instagramScraper-v2; подписчик не заведён — ' +
        'зафиксировано в docs/audit/event-seams.md как незакрытая работа',
      'telegram/send-admin-notification':
        'уведомление админам из kieAiWebhookMonitor; подписчика нет — ' +
        'зафиксировано в docs/audit/event-seams.md',
      'neuro/photo.failed':
        'событие отказа генерации; подписчика нет — зафиксировано в аудите',
      'render/execute':
        'потребитель живёт в отдельном рендер-сервере, не в этом репозитории',
    }

    const bad: string[] = []
    for (const f of prodFiles) {
      const src = strip(fs.readFileSync(f, 'utf8'))
      for (const m of src.matchAll(
        /\bname:\s*['"]([a-z0-9_-]+\/[a-z0-9_.-]+)['"]/gi
      )) {
        const name = m[1]
        if (listeners.has(name)) continue
        if (EXTERNAL[name]) continue
        const line = src.slice(0, m.index).split('\n').length
        bad.push(`${f}:${line}  ${name}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('в списке внешних имён нет тех, у кого подписчик уже появился', () => {
    // Иначе исключение переживёт свою причину и молча прикроет следующую
    // ошибку — тот же урок, что и со списком непримонтированных роутеров.
    const EXTERNAL_KEYS = [
      'test/hello.world',
      'instagram/scrape-similar-users',
      'telegram/send-admin-notification',
      'neuro/photo.failed',
      'render/execute',
    ]
    const stale = EXTERNAL_KEYS.filter(k => listeners.has(k))
    expect(stale).toEqual([])
  })
})
