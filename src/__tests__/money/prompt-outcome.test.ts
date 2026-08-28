/**
 * Каждая запись о генерации помечена исходом.
 *
 * ЦЕНА НЕЗНАНИЯ, ИЗМЕРЕННАЯ. `savePrompt` не умела записывать исход ВООБЩЕ —
 * колонка `status` оставалась пустой у всего, что шло через неё. Из-за этого
 * на вопрос «часто ли у нас не получается» ответить нечем: пустым статусом
 * помечено и удачное, и неудачное.
 *
 * Насколько это велико: в сентябре 2025 — 279 пустых при НУЛЕ возвратов, в
 * марте 2026 — 233 из 303. То есть пустой статус ничего не означает, и по нему
 * нельзя было ни считать отказы, ни опровергнуть их.
 *
 * Смежное наблюдение, ради которого всё затевалось: из 171 возврата 114
 * стоят рядом с записью о генерации, и у 112 из них статус пустой. Связь
 * есть, но доказать по ней ничего нельзя — пустых слишком много и без
 * возвратов.
 *
 * Тест следит, чтобы исход снова не перестал записываться.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const SAVE_PROMPT = 'src/core/supabase/savePrompt.ts'

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

/** Вызовы savePrompt вместе с телом вызова (аргументы могут занимать строки). */
function callSites(): { file: string; line: number; args: string }[] {
  const hits: { file: string; line: number; args: string }[] = []
  for (const f of collect()) {
    if (f.endsWith('savePrompt.ts') || f.endsWith('savePromptDirect.ts'))
      continue
    const lines = strip(fs.readFileSync(f, 'utf8')).split('\n')
    lines.forEach((l, i) => {
      if (!/\bsavePrompt\s*\(/.test(l)) return
      // собираем текст вызова до закрывающей скобки
      let depth = 0
      let started = false
      const buf: string[] = []
      for (let j = i; j < Math.min(i + 14, lines.length); j++) {
        buf.push(lines[j])
        for (const ch of lines[j]) {
          if (ch === '(') {
            depth++
            started = true
          } else if (ch === ')') depth--
        }
        if (started && depth === 0) break
      }
      hits.push({ file: f, line: i + 1, args: buf.join(' ') })
    })
  }
  return hits
}

describe('исход генерации записывается', () => {
  it('разбор находит вызовы — иначе тест пустой', () => {
    expect(callSites().length).toBeGreaterThan(10)
  })

  it('каждый вызов передаёт исход', () => {
    const without = callSites()
      .filter(h => !/'success'|'failed'|outcome|PromptOutcome/.test(h.args))
      .map(h => `${h.file}:${h.line}`)
    expect(without).toEqual([])
  })

  it('исход попадает в таблицу, а не только в подпись функции', () => {
    // Параметр, не доехавший до вставки, — это тот же пустой статус,
    // только теперь с видимостью работы.
    const src = strip(fs.readFileSync(SAVE_PROMPT, 'utf8'))
    expect(src).toMatch(/status:\s*outcome/)
  })

  it('у исхода нет значения по умолчанию', () => {
    // Умолчание рано или поздно проставит «успех» там, где успеха не было —
    // и снова сделает колонку бессмысленной, но уже незаметно.
    const src = strip(fs.readFileSync(SAVE_PROMPT, 'utf8'))
    expect(src).toMatch(/outcome:\s*PromptOutcome\s*\n?\s*\)/)
    expect(src).not.toMatch(/outcome:\s*PromptOutcome\s*=/)
    expect(src).not.toMatch(/outcome\?:/)
  })
})
