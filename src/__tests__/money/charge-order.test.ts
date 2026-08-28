/**
 * Порядок денег и работы.
 *
 * Правило: **списание идёт после подтверждённой работы, а если раньше — рядом
 * обязан быть возврат при неудаче.** Иначе человек платит за то, что не
 * случилось.
 *
 * Что это уже стоило:
 *   - парсинг Instagram: списание до вызова, вызов возвращал успех, ничего не
 *     сделав. 28 списаний у трёх человек на 94 звезды при нуле запусков (#510)
 *   - heygen: списание до отправки события без возврата. Дыру открыл я сам в
 *     #506 — до него списание молча не происходило, и неудачная отправка
 *     ничего не стоила; починив списание, я сделал путь платным
 *
 * Тест разбирает исходники и не доказывает дефект — он не даёт появиться
 * НОВЫМ местам, где деньги уходят раньше работы и не возвращаются.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const CHARGE =
  /updateUserBalance\s*\(|processBalanceOperation\s*\(|processServiceBalanceOperation\s*\(|processBalanceVideoOperation\s*\(/
const OUTCOME = /MONEY_OUTCOME|SERVICE_PAYMENT/

const RISKY: Array<[RegExp, string]> = [
  [/\baxios\.(post|get|put)\b/, 'сетевой запрос axios'],
  [/\bfetch\s*\(/, 'сетевой запрос fetch'],
  [/inngest\.send\s*\(/, 'отправка события'],
  [/sendRenderAvatarVideoEvent\s*\(/, 'отправка события рендера'],
  [/generateInstagramScraping\s*\(/, 'запуск парсинга'],
  [/\breplicate\./, 'вызов Replicate'],
  [/\bfal\.(subscribe|run|queue)/, 'вызов Fal'],
  [/generate[A-Z]\w*\s*\(/, 'вызов генерации'],
]

const WINDOW = 60
const TAIL = 220

/**
 * Места, где списание идёт раньше работы и возврата рядом НЕТ, но это
 * зафиксировано осознанно. Значение — причина; она обязана объяснять, почему
 * человек не теряет деньги (или почему потеря принята).
 */
const KNOWN: Record<string, string> = {
  'src/scenes/aiPhotoshopScene/index.ts':
    'Списание за ВСЮ пачку изображений до цикла, а неудача отдельного ' +
    'изображения только логируется («Continue with next image even if this ' +
    'one failed»). Частичного возврата нет во всём файле. Зафиксировано в ' +
    'docs/audit/charge-order.md: сколько возвращать при частичном отказе — ' +
    'решение владельца, а не арифметика внутри сцены.',
  'src/services/generateGeminiImage.ts':
    'Списание 12 звёзд до генерации, в catch возврата нет. Вызывающих у ' +
    'функции НОЛЬ — мёртвый код, дыра латентная. Правку не делаю вслепую: ' +
    'если функцию будут подключать, возврат надо писать вместе с проводкой.',
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

function findChargeBeforeWork(): Array<{
  file: string
  line: number
  what: string
}> {
  const hits: Array<{ file: string; line: number; what: string }> = []

  for (const f of collect()) {
    const lines = strip(fs.readFileSync(f, 'utf8')).split('\n')

    for (let i = 0; i < lines.length; i++) {
      if (!CHARGE.test(lines[i])) continue

      const near = lines.slice(i, Math.min(i + 8, lines.length)).join('\n')
      if (
        !OUTCOME.test(near) &&
        !/processBalance|processService/.test(lines[i])
      )
        continue

      const after: Array<[number, string]> = []
      for (let j = i + 1; j < Math.min(i + WINDOW, lines.length); j++) {
        if (/^\}/.test(lines[j])) break
        after.push([j, lines[j]])
      }

      for (const [rx, what] of RISKY) {
        const found = after.find(([, l]) => rx.test(l))
        if (!found) continue

        const tail = lines
          .slice(found[0], Math.min(found[0] + TAIL, lines.length))
          .join('\n')
        // `refundAndTell` — общая функция возврата, появившаяся позже этой
        // проверки (PR #544). Без неё в списке разбор считал возвратом только
        // прямые вызовы и объявлял нарушением как раз те места, где возврат
        // сделан правильнее прежнего.
        const hasRefund =
          /MONEY_INCOME|PaymentType\.REFUND|refund/i.test(tail) &&
          /updateUserBalance|refundUser|refundAndTell|processBalance/.test(tail)

        if (!hasRefund) hits.push({ file: f, line: i + 1, what })
        break
      }
    }
  }
  return hits
}

describe('деньги не уходят раньше работы', () => {
  it('разбор вообще что-то находит — иначе тест пустой', () => {
    // Страховка от самого себя: если регулярки перестанут срабатывать, все
    // проверки станут зелёными и бессмысленными.
    const charges = collect().filter(f =>
      CHARGE.test(strip(fs.readFileSync(f, 'utf8')))
    )
    expect(charges.length).toBeGreaterThan(20)
  })

  it('нет новых мест, где списание раньше работы и возврата нет', () => {
    const unexplained = findChargeBeforeWork()
      .filter(h => !KNOWN[h.file])
      .map(h => `${h.file}:${h.line} (${h.what})`)

    expect(unexplained).toEqual([])
  })

  it('в списке известных нет тех, где возврат уже появился', () => {
    // Иначе запись переживёт свою причину и молча прикроет следующую ошибку —
    // тот же урок, что со списками непримонтированных роутеров и внешних
    // событий.
    const stillBroken = new Set(findChargeBeforeWork().map(h => h.file))
    const stale = Object.keys(KNOWN).filter(f => !stillBroken.has(f))
    expect(stale).toEqual([])
  })
})
