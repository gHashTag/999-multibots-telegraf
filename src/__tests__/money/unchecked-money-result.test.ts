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

/**
 * Functions whose return value means "it worked / it did not".
 *
 * THIS LIST DEFINES THE POPULATION. The ratchet is blind to exactly the charge
 * primitives that are absent from it, and a blind ratchet reads as a clean one.
 * `deductBalanceAfterSuccess` (priceHelper.ts, `Promise<boolean>`) charges AFTER
 * the video is delivered, so a discarded `false` means delivered-and-not-charged
 * -- a silent free generation. PR #1663 fixed two such sites in
 * generateImageToVideo.ts and NO gate watched them until the primitive was
 * listed here (it.71 audit: that fix had no pinning test at all).
 *
 * NOT added, deliberately:
 *   `processBalanceVideoOperation` -- zero call sites in src; a ratchet over
 *      dead code guards nothing and manufactures a feeling of coverage;
 *   `refundUser` -- the REFUND direction, not a charge: best-effort by design
 *      (12+ bare `await refundUser(...)` sites) with its own ledger guard.
 *      Including it is a separate campaign, not a widening of this invariant.
 */
const CHECKABLE = [
  'processBalanceOperation',
  'directPaymentProcessor',
  'updateUserBalance',
  'deductBalanceAfterSuccess',
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
/*
 * EMPTY SINCE 2026-09-18, AND THAT IS THE POINT.
 *
 * The last two entries were fal-render-wizard's dead sketch: a charge behind an
 * eslint no-unreachable marker and a refund in the same dead branch. They moved
 * no money, which is why they were left -- and exactly why they were finally
 * fixed: a sketch is what a future edit wakes up, and it would have woken up as
 * a free generation and a silently swallowed refund.
 *
 * An empty debt list makes the old self-check ("the parser found something, so
 * it is not blind") unsatisfiable, which the comment below anticipated. It is
 * replaced by a POSITIVE SAMPLE over invented source: the parser is shown a
 * discarded call it must find, so blindness still fails the suite without
 * requiring a real defect to exist somewhere.
 */
const DEBT: Record<string, number> = {}

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
      // strip() removes /* */ but not // line comments; a full-line // that
      // mentions a money fn is not a call. Skip it (was a false positive:
      // updateUserBalance.ts:248). #1347
      if (line.trim().startsWith('//')) continue
      if (CHECKABLE.some(fn => isDiscarded(line, fn)))
        out[f] = (out[f] || 0) + 1
    }
  }
  return out
}

describe('результат денежной операции не выбрасывается', () => {
  it('разбор видит выброшенный результат на заведомом образце', () => {
    /*
     * A guard against this file going blind, on INVENTED source.
     *
     * It used to say "the repository holds more than zero such places": while
     * the debt existed, that told a broken matcher from clean code. The debt
     * is now empty and a floor of zero cannot tell "clean" from "blind" --
     * exactly as the old comment warned. A sample does not depend on a defect
     * existing somewhere in the tree.
     */
    expect(
      isDiscarded('  await updateUserBalance(a, b)', 'updateUserBalance')
    ).toBe(true)
    expect(
      isDiscarded(
        '    await processBalanceOperation({',
        'processBalanceOperation'
      )
    ).toBe(true)
    expect(CHECKABLE.length, 'список примитивов опустел').toBeGreaterThan(1)
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

  it('charge-after-delivery is in the population and is detected', () => {
    // A self-check of the LIST, not of the code: a primitive that drops out of
    // CHECKABLE makes the ratchet silent, and silence is indistinguishable from
    // cleanliness. Assert both membership and that the pattern really sees a
    // discarded call.
    expect(CHECKABLE).toContain('deductBalanceAfterSuccess')
    expect(
      isDiscarded(
        '    await deductBalanceAfterSuccess(',
        'deductBalanceAfterSuccess'
      )
    ).toBe(true)
    expect(
      isDiscarded(
        '    const deductSuccess = await deductBalanceAfterSuccess(',
        'deductBalanceAfterSuccess'
      )
    ).toBe(false)
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
