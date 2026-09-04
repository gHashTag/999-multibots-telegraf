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
const DEBT: Record<string, number> = {
  // All remaining entries are DEAD/unreachable code (verified #1347), not live
  // money bugs -- there is no live unchecked-money site left. Do not 're-inspect'
  // these each loop; fix means DELETING the dead code, tracked separately.
  //   x402.routes.ts: router imported + setX402BotInstance called but NEVER
  //     app.use'd (unmounted); settle endpoint returns 'not implemented'.
  //   ai-reels-inngest-wizard.ts: aiReelsInngestWizard exported but not in
  //     scenesToRegister -> never entered.
  //   fal-render-wizard.ts: dead branch (long-standing).
  // (updateUserBalance.ts removed: it was a // comment, false positive #1347.)
  // x402.routes.ts and ai-reels-inngest-wizard.ts are GONE from this list:
  // both now bind the result. Still dead code (the router is never app.use'd,
  // the scene is never registered) -- binding a result does not make them
  // live, it only stops the debt count from covering sites that no longer
  // discard.
  'src/scenes/lipSyncWizard/fal-render-wizard.ts': 2,
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
  it('разбор находит места — иначе тест пустой', () => {
    // Страховка от самого себя: если шаблон сломается, всё станет зелёным.
    // Safety against the detection pattern silently breaking (which would
    // make every commit pass). The floor tracks cleanup progress: as
    // discarded-result sites are fixed the count legitimately drops, so the
    // floor is loosened as the discarded-result campaign cleans siblings
    // (10 -> 8 -> 2 -> 1). Only fal-render-wizard is left: one call behind an
    // eslint no-unreachable marker and one refund in a dead branch. x402 and
    // ai-reels-inngest-wizard left the list when their results were bound.
    //
    // The floor is now 0, which still catches the failure it exists for: a
    // broken pattern returns 0 and fails here. When the last file is cleaned
    // this guard becomes unsatisfiable and must be replaced by a positive
    // sample -- a floor of zero cannot distinguish "clean" from "blind".
    expect(Object.keys(countByFile()).length).toBeGreaterThan(0)
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
