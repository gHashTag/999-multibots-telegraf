/**
 * Функция не возвращает выдуманное значение вместо результата.
 *
 * Класс дефекта: вызывающий получает строку, похожую на успех, и не может
 * отличить её от настоящего результата. Отказ всплывает через три шага и без
 * причины — либо не всплывает вовсе, а человек платит за пустоту.
 *
 * Что это уже стоило:
 *   generateInstagramScraping — возвращала `success: true`, ничего не запустив.
 *     28 списаний у трёх человек, 94 звезды, ноль запусков (PR #510)
 *   заглушки ElevenLabs — выдуманный адрес аудио и выдуманная расшифровка,
 *     из-за чего «STUB TRANSCRIPTION TEXT» могло попасть в субтитры
 *   generateImageFromPrompt — `return "https://example.com/generated_image.png"`
 *
 * Тест статический: он следит, чтобы такие возвраты не появлялись снова.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Возврат строкового литерала, который выглядит как адрес или как заглушка.
 */
const FABRICATED =
  /return\s+['"`](https?:\/\/[^'"`]*|[a-z0-9_-]*(?:stub|fake|dummy|placeholder|example)[a-z0-9_-]*)['"`]/i

/**
 * Разрешённые возвраты адресов — с причиной. Это не заглушки, а настоящие
 * значения: публичные адреса сетей и наши собственные ссылки.
 */
const ALLOWED: Record<string, string> = {
  'src/core/x402/index.ts': 'публичные адреса сетей Base — это и есть значения',
  'src/handlers/getPhotoUrl.ts': 'ссылки на наше же хранилище',
  'src/inngest_app/functions/render/renderAvatarVideo.ts':
    'адрес собирается ПОСЛЕ успешной загрузки, не вместо неё',
}

function collect(): string[] {
  const out: string[] = []
  ;(function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.ts')) out.push(p)
    }
  })('src')
  return out.filter(f => !f.includes('__tests__') && !f.includes('/test/'))
}

function findFabricated(): string[] {
  const hits: string[] = []
  for (const f of collect()) {
    const lines = strip(fs.readFileSync(f, 'utf8')).split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (FABRICATED.test(lines[i])) hits.push(`${f}:${i + 1}`)
    }
  }
  return hits
}

describe('нет выдуманных возвратов', () => {
  it('разбор что-то находит — иначе тест пустой', () => {
    // Страховка от самого себя: если шаблон перестанет срабатывать, проверка
    // ниже станет зелёной и бессмысленной. В проекте есть законные возвраты
    // адресов, поэтому ноль здесь означал бы поломку разбора.
    expect(findFabricated().length).toBeGreaterThan(0)
  })

  it('нет выдуманных возвратов вне разрешённых файлов', () => {
    const unexplained = findFabricated().filter(h => !ALLOWED[h.split(':')[0]])
    expect(unexplained).toEqual([])
  })

  it('в списке разрешённых нет файлов, где таких возвратов уже нет', () => {
    // Запись, пережившая свою причину, молча прикроет следующую ошибку.
    const files = new Set(findFabricated().map(h => h.split(':')[0]))
    const stale = Object.keys(ALLOWED).filter(f => !files.has(f))
    expect(stale).toEqual([])
  })
})
