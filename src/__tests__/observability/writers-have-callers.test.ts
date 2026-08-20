/**
 * У каждого нового наблюдаемого поля есть кто-то, кто его пишет.
 *
 * ЗАЧЕМ. Четыре итерации подряд я чинил различимость: причина возврата, исход
 * генерации, признак записи видео, правда о возврате. Все правки построены на
 * предположении, что код исполняется.
 *
 * Предположение в этом проекте не бесплатное: 13 функций Inngest из 35 не
 * зарегистрированы, и три моих прошлых правки уже уезжали в такие файлы
 * (docs/audit/unregistered-functions.md). Правка в неисполняемом файле выглядит
 * как работа и не делает ничего — а обнаруживается через месяц, когда
 * оказывается, что копилась пустота.
 *
 * ЧТО ПРОВЕРЯЕТСЯ. Для каждого места, где пишется новое поле:
 *   1. правка на месте — метка в файле не исчезла;
 *   2. кто-то этот файл ЗОВЁТ по имени экспортируемого символа.
 *
 * Второе важнее первого и тоньше, чем кажется. «Файл достижим по импортам» —
 * недостаточный признак: `core/supabase/index.ts` реэкспортирует всё подряд и
 * делает достижимым что угодно. Достижимость файла и достижимость символа —
 * разные вопросы, на этом я уже обжигался (PR #515).
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/** Место, где пишется наблюдаемое поле, и метка, по которой видно правку. */
const WRITERS: { what: string; file: string; symbol: string; marker: string }[] = [
  {
    what: 'причина возврата',
    file: 'src/price/helpers/refundUser.ts',
    symbol: 'refundUser',
    marker: 'refund_reason',
  },
  {
    what: 'правда о возврате',
    file: 'src/price/helpers/refundAndTell.ts',
    symbol: 'refundAndTell',
    marker: 'REFUND FAILED',
  },
  {
    what: 'исход генерации',
    file: 'src/core/supabase/savePrompt.ts',
    symbol: 'savePrompt',
    marker: 'status: outcome',
  },
  {
    what: 'признак записи видео',
    file: 'src/core/supabase/saveVideoUrlToSupabase.ts',
    symbol: 'saveVideoUrlToSupabase',
    marker: 'РЕЗУЛЬТАТ НЕ ЗАПИСАН',
  },
  {
    what: 'проверка признака записи',
    file: 'src/modules/videoGenerator/helpers/supabaseHelper.ts',
    symbol: 'saveVideoUrlHelper',
    marker: 'if (!saved)',
  },
  {
    what: 'награда за приглашение',
    file: 'src/core/referral/rewardInviter.ts',
    symbol: 'rewardInviter',
    marker: 'REFERRAL_BONUS_STARS',
  },
]

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

const ALL = collect()

/** Имена, которые файл экспортирует. */
function exportedNames(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8')
  const names = new Set<string>()
  for (const m of text.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g))
    names.add(m[1])
  for (const m of text.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim()
      if (name) names.add(name)
    }
  }
  return [...names]
}

/**
 * Файлы, зовущие ИМЕННО этот символ.
 *
 * Сначала здесь проверялись любые имена, экспортируемые файлом. Мутация это
 * поймала: `supabaseHelper.ts` экспортирует несколько функций, и переименование
 * нужной оставляло тест зелёным — его удовлетворял соседний экспорт. Проверять
 * надо конкретное имя.
 */
function callersOf(symbol: string, file: string): string[] {
  const re = new RegExp(`\\b${symbol}\\s*\\(`)
  return ALL.filter(f => f !== file && re.test(fs.readFileSync(f, 'utf8')))
}

describe('наблюдаемость: у каждого писателя есть зовущий', () => {
  it('каждый писатель действительно экспортирует свой символ', () => {
    // Страховка от самого себя: имя в списке должно существовать, иначе
    // проверка «кто зовёт» ищет несуществующее и всегда падает — или, если
    // имя случайно совпадёт с чужим, всегда проходит.
    for (const w of WRITERS) {
      expect(exportedNames(w.file), w.file).toContain(w.symbol)
    }
  })

  it.each(WRITERS)('$what — правка на месте', ({ file, marker }) => {
    expect(fs.readFileSync(file, 'utf8')).toContain(marker)
  })

  it.each(WRITERS)('$what — кто-то зовёт именно этот символ', ({ file, symbol }) => {
    const callers = callersOf(symbol, file)
    expect(callers, `${symbol}: никто не зовёт — правка не исполняется`).not.toEqual([])
  })
})
