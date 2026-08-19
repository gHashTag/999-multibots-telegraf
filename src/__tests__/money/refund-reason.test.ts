/**
 * Каждый возврат денег называет причину.
 *
 * ЦЕНА НЕЗНАНИЯ, ИЗМЕРЕННАЯ. В реестре 171 возврат у 126 человек, из них 89 за
 * один декабрь 2025 — месяц, когда возвращаемость упала с 25% до 12%. Что это
 * было — всплеск отказов генерации или всплеск нажатий «Отмена» — установить
 * УЖЕ НЕЛЬЗЯ: 21 место в коде писало одну и ту же строку «Refund for cancelled
 * generation», и человек, передумавший сам, неотличим от человека, у которого
 * не получилось.
 *
 * Отдельно: 120 из 154 «однодневок» (тех, кто потратил ровно один раз и
 * исчез) имеют такой возврат. То есть вопрос «мы их прогнали или они сами
 * ушли» — про большинство ушедших, а не про край выборки.
 *
 * Тест следит, чтобы неотличимость не вернулась.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const KNOWN_REASONS = ['user_cancelled', 'generation_failed', 'partial_failure']

const HELPER = 'src/price/helpers/refundUser.ts'

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

/** Вызовы refundUser во всём проекте, кроме самого объявления. */
function callSites(): { file: string; line: number; text: string }[] {
  const hits: { file: string; line: number; text: string }[] = []
  for (const f of collect()) {
    if (f.endsWith('refundUser.ts')) continue
    const lines = strip(fs.readFileSync(f, 'utf8')).split('\n')
    lines.forEach((l, i) => {
      if (/\brefundUser\s*\(/.test(l)) hits.push({ file: f, line: i + 1, text: l })
    })
  }
  return hits
}

describe('возврат денег называет причину', () => {
  it('разбор находит вызовы — иначе тест пустой', () => {
    // Их два десятка. Ноль означал бы сломанный разбор, а не чистый код.
    expect(callSites().length).toBeGreaterThan(15)
  })

  it('каждый вызов передаёт причину', () => {
    const without = callSites()
      .filter(h => !/reason\s*:/.test(h.text))
      .map(h => `${h.file}:${h.line}`)
    expect(without).toEqual([])
  })

  it('причины — только из известного списка', () => {
    // Новая причина сама по себе не беда, но она должна появиться осознанно:
    // по ней потом считают, а значит её надо знать в лицо.
    const unknown: string[] = []
    for (const h of callSites()) {
      const m = h.text.match(/reason\s*:\s*['"]([a-z_]+)['"]/)
      if (m && !KNOWN_REASONS.includes(m[1])) unknown.push(`${h.file}:${h.line} → ${m[1]}`)
    }
    expect(unknown).toEqual([])
  })

  it('причина доезжает до реестра, а не остаётся в коде', () => {
    // Разделение бесполезно, если в payments_v2 снова одна строка на всех.
    const src = strip(fs.readFileSync(HELPER, 'utf8'))
    expect(src).toMatch(/description|Refund \(\$\{reason\}\)|`Refund/)
    expect(src).toMatch(/refund_reason:\s*reason/)
  })

  it('человеку говорят разное при отмене и при отказе', () => {
    // «Возвращено за отменённую генерацию» в ответ на НАШУ поломку — это
    // перекладывание вины на человека.
    const src = strip(fs.readFileSync(HELPER, 'utf8'))
    expect(src).toMatch(/reason === 'user_cancelled'/)
    expect(src).toMatch(/Генерация не удалась/)
  })

  it('и хотя бы два разных вида причин действительно используются', () => {
    // Если бы все 21 место писали одно и то же значение, разделение было бы
    // декоративным.
    const used = new Set<string>()
    for (const h of callSites()) {
      const m = h.text.match(/reason\s*:\s*['"]([a-z_]+)['"]/)
      if (m) used.add(m[1])
    }
    expect(used.size).toBeGreaterThanOrEqual(2)
    expect(used.has('user_cancelled')).toBe(true)
    expect(used.has('generation_failed')).toBe(true)
  })
})
