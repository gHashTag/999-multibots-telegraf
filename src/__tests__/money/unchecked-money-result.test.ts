/**
 * Результат денежной операции не выбрасывается молча.
 *
 * КЛАСС ДЕФЕКТА. `updateUserBalance` и `directPaymentProcessor` при неудаче НЕ
 * бросают — они возвращают `false` / `{success:false}`. Выброшенный результат
 * означает: операция могла не состояться, а код пошёл дальше как ни в чём не
 * бывало. Дальше обычно стоит `ctx.reply('Средства возвращены')`.
 *
 * Отказ не выдуманный: `updateUserBalance` отклоняет начисление, если у
 * человека нет строки в `users` — таких плательщиков 44
 * (docs/audit/ghost-payers.md). То есть «средства возвращены» говорилось тем,
 * кому их точно не вернули.
 *
 * Это продолжение того же класса, что и возврат без списания
 * (docs/audit/first-touch.md): действие, не проверившее предыдущий шаг.
 *
 * ЧЕСТНО О ГРАНИЦАХ. Мест таких было тридцать четыре в двадцати файлах —
 * прежняя шапка говорила «тридцать», пересчёт собственным счётчиком даёт
 * 6 исправленных + 28 в списке = 34. Исправлено шестнадцать: шесть, где
 * человеку прямо сообщали о возврате; три в PR #563 (реестр тогда забыли
 * уменьшить — завышенные записи держали окно для тихого регресса, найдено
 * состязательной проверкой 21.08); семь в путях обучения — там суммы крупнее
 * всего (файлы training/* и voiceTrainingWizard вычищены и удалены из
 * списка). Осталось 18 мест в 15 файлах — перечислены ниже как известный
 * долг: список не индульгенция, он не даёт добавить новые места и заставляет
 * убирать запись, когда файл почищен.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, m =>
    '\n'.repeat((m.match(/\n/g) || []).length)
  )

/** Функции, чей возврат означает «получилось / не получилось». */
const CHECKABLE = [
  'processBalanceOperation',
  'processBalanceVideoOperation',
  'processServiceBalanceOperation',
  'directPaymentProcessor',
  'updateUserBalance',
]

/**
 * Известный долг: файл → сколько выброшенных результатов в нём осталось.
 * Числа должны только уменьшаться.
 *
 * Список работает: `async-lipsync-manager.ts` был здесь с двумя записями, оба
 * места починены (PR по «утверждениям в сообщениях»), и проверка «в списке нет
 * вычищенных файлов» сама потребовала убрать запись.
 *
 * И список умеет врать: PR #563 починил по одному месту в fal-render,
 * hedra-render и ai-reels-render, не уменьшив числа, — проверка «не растёт»
 * при завышенной записи пропустила бы возврат одного места. Значения сверены
 * со счётчиком 21.08; сверяйте после каждой чистки.
 */
const DEBT: Record<string, number> = {
  'src/api_server/routes/x402.routes.ts': 2,
  'src/core/supabase/updateUserBalance.ts': 1,
  'src/handlers/handleTextToVideoDirect.ts': 1,
  'src/scenes/aiCoverWizard/index.ts': 2,
  'src/scenes/instagramParserScene/index.ts': 1,
  'src/scenes/lipSyncWizard/ai-reels-inngest-wizard.ts': 1,
  'src/scenes/lipSyncWizard/ai-reels-render-wizard.ts': 1,
  'src/scenes/lipSyncWizard/ai-reels-wizard.ts': 1,
  'src/scenes/lipSyncWizard/fal-render-wizard.ts': 2,
  'src/scenes/lipSyncWizard/hedra-render-wizard.ts': 1,
  'src/scenes/lipSyncWizard/heygen-render-wizard.ts': 1,
  'src/scenes/lipSyncWizard/index.ts': 1,
  'src/services/marketplaceService.ts': 1,
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

/** Вызов есть, а результат никуда не идёт. */
function isDiscarded(line: string, fn: string): boolean {
  if (!new RegExp(`(^|[^\\w.])(await\\s+)?${fn}\\s*\\(`).test(line))
    return false
  // объявление самой функции — не вызов
  if (new RegExp(`(function|const|export)\\s+.*\\b${fn}\\b`).test(line))
    return false
  const before = line.split(fn)[0]
  if (/[=]\s*(await\s+)?$/.test(before)) return false
  if (/\b(const|let|var|return|if|while)\b/.test(before)) return false
  return true
}

function countByFile(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of collect()) {
    for (const line of strip(fs.readFileSync(f, 'utf8')).split('\n')) {
      if (CHECKABLE.some(fn => isDiscarded(line, fn)))
        out[f] = (out[f] || 0) + 1
    }
  }
  return out
}

describe('результат денежной операции не выбрасывается', () => {
  it('разбор находит места — иначе тест пустой', () => {
    // Страховка от самого себя: если шаблон сломается, всё станет зелёным.
    expect(Object.keys(countByFile()).length).toBeGreaterThan(10)
  })

  it('разбор не считает присвоение выброшенным результатом', () => {
    expect(
      isDiscarded(
        '  const ok = await updateUserBalance(a, b)',
        'updateUserBalance'
      )
    ).toBe(false)
    expect(
      isDiscarded(
        '  if (!(await updateUserBalance(a, b))) return',
        'updateUserBalance'
      )
    ).toBe(false)
    expect(isDiscarded('  await updateUserBalance(', 'updateUserBalance')).toBe(
      true
    )
  })

  it('новых файлов с выброшенным результатом не появилось', () => {
    const found = countByFile()
    const fresh = Object.keys(found).filter(f => !(f in DEBT))
    expect(fresh).toEqual([])
  })

  it('долг не растёт ни в одном файле', () => {
    const found = countByFile()
    const grown = Object.entries(found)
      .filter(([f, n]) => f in DEBT && n > DEBT[f])
      .map(([f, n]) => `${f}: было ${DEBT[f]}, стало ${n}`)
    expect(grown).toEqual([])
  })

  it('в списке долга нет уже вычищенных файлов', () => {
    // Запись, пережившая свою причину, прикроет следующую ошибку.
    const found = countByFile()
    const stale = Object.keys(DEBT).filter(f => !(f in found))
    expect(stale).toEqual([])
  })
})
