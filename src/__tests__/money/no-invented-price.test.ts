/**
 * Цена не выдумывается: не смогли посчитать — не списываем.
 *
 * ЧТО БЫЛО. Два места подставляли число «на всякий случай»:
 *
 *   handleImageToVideoDirect.ts:  return 40 // Fallback price
 *   core/openai/requests.ts:      nanoBananaPrice?.costPerImage || 10
 *
 * Первое срабатывало, когда расчёт цены падал; второе — когда запись о модели
 * исчезала или переименовывалась. В обоих случаях с человека списывалась
 * ВЫДУМАННАЯ сумма, а в сообщении стояло то же выдуманное число — то есть
 * заметить подмену он не мог. Настоящая цена этих услуг бывает и впятеро
 * меньше, и впятеро больше.
 *
 * Асимметрия та же, что и в остальных денежных местах (docs/audit/money-map.md):
 * отказать — человек попробует ещё раз; списать не ту сумму — деньги ушли.
 *
 * Родственный класс уже закрыт для строк: no-fabricated-returns.test.ts следит
 * за выдуманными адресами. Этот — за выдуманными числами в деньгах.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m =>
      '\n'.repeat((m.match(/\n/g) || []).length)
    )
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

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

const FILES = collect()

/**
 * Число, подставленное ВМЕСТО непосчитанной цены.
 *
 * Ровно `??` или `||` с ненулевым числом. Первая версия шаблона брала и
 * обычное присваивание, из-за чего в находки попали `let totalCost = 0`
 * (накопитель) и `const costPerImage = 12` (цена, записанная константой) — а
 * это другие вещи. Ноль тоже исключён: нулевое умолчание не может списать
 * лишнего.
 */
const INVENTED =
  /(costPerImage|paymentAmount|totalCost|upscaleCost)\s*=\s*[^=\n]*(\?\?|\|\|)\s*[1-9][0-9]*(\.[0-9]+)?/

/**
 * Места, где число рядом со словом «цена» законно: объявления самих прайсов,
 * расчёты и константы. Список с причиной у каждого.
 */
const ALLOWED = [
  /^src\/price\//,
  /^src\/config\//,
  /^src\/interfaces\//,
  /^src\/modules\/videoGenerator\/config/,
]

function invented(): string[] {
  const hits: string[] = []
  for (const f of FILES) {
    if (ALLOWED.some(re => re.test(f))) continue
    const lines = strip(fs.readFileSync(f, 'utf8')).split('\n')
    lines.forEach((l, i) => {
      if (!INVENTED.test(l)) return
      // Присвоение результата вызова — не выдумка.
      if (/=\s*(await\s+)?\w+\s*\(/.test(l)) return
      // Сравнение, а не присвоение.
      if (/[=!<>]==|[<>]=?\s/.test(l.split('=')[0] || '')) return
      hits.push(`${f}:${i + 1}  ${l.trim().slice(0, 70)}`)
    })
  }
  return hits
}

describe('цена не выдумывается', () => {
  it('в двух починенных местах выдуманных чисел больше нет', () => {
    // Комментарии вырезаем: пояснение к правке цитирует старую строку, и без
    // этого проверка падала бы на собственном объяснении. Такое уже было.
    const itv = strip(
      fs.readFileSync('src/handlers/handleImageToVideoDirect.ts', 'utf8')
    )
    expect(itv).not.toMatch(/return 40\s*\/\/\s*Fallback price/)
    expect(itv).toMatch(/return null/)
    // И отказ доходит до человека, а не только в журнал.
    expect(itv).toMatch(/price === null/)
    expect(itv).toMatch(/Деньги не списаны/)
  })

  it('перед списанием цена проверяется, а не подставляется', () => {
    const req = fs.readFileSync('src/core/openai/requests.ts', 'utf8')
    expect(req).toMatch(
      /typeof costPerImage !== 'number' \|\| costPerImage <= 0/
    )
    expect(req).toMatch(/СПИСАНИЯ НЕ БЫЛО/)
  })

  it('разбор ловит выдуманную цену на заведомом образце', () => {
    // Страховка от самого себя. В коде таких мест больше не осталось, поэтому
    // «нашлось ноль» ничего не доказывает — проверяем шаблон на образце.
    const samples = [
      'const costPerImage = price?.costPerImage || 10',
      'const totalCost = cfg.cost ?? 240',
      'paymentAmount = session.paymentAmount || 40',
    ]
    for (const s of samples) expect(INVENTED.test(s), s).toBe(true)

    // И не ловит того, что выдумкой не является.
    const fine = [
      'let totalCost = 0',
      'const costPerImage = 12',
      'const paymentAmount = ctx.session.paymentAmount || 0',
    ]
    for (const s of fine) expect(INVENTED.test(s), s).toBe(false)
  })

  it('в денежных путях не появилось новых выдуманных цен', () => {
    // Узко: только там, где число попадает в списание.
    const MONEY_PATH = /^src\/(handlers|scenes|core\/openai|services)\//
    const CHARGE = /(costPerImage|paymentAmount|totalCost|upscaleCost)/
    // A floor before the bound. `expect(fresh).toEqual([])` is satisfied by an
    // empty scan, so a broken walk or a renamed directory would turn this
    // money ratchet green at the moment it stopped looking. Measured
    // 2026-09-06: the walk finds 718 production sources.
    expect(FILES.length, 'the source walk found nothing').toBeGreaterThan(500)
    const fresh = invented().filter(h => {
      const file = h.split(':')[0]
      return MONEY_PATH.test(file) && CHARGE.test(h)
    })
    expect(fresh).toEqual([])
  })
})
