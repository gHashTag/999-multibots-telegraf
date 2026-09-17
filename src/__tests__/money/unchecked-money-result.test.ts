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
  // All remaining entries are DEAD/unreachable code (verified #1347), not live
  // money bugs -- there is no live unchecked-money site left. Do not 're-inspect'
  // these each loop; fix means DELETING the dead code, tracked separately.
  //   x402.routes.ts: router imported + setX402BotInstance called but NEVER
  //     app.use'd (unmounted); settle endpoint returns 'not implemented'.
  //   fal-render-wizard.ts: dead branch (long-standing); tsc confirms it with
  //     TS7027 under --allowUnreachableCode false.
  // (updateUserBalance.ts removed: it was a // comment, false positive #1347.)
  //
  // ai-reels-inngest-wizard.ts left this list when its charge was fixed: the
  // debit result is now bound and tested, and the catch refunds what was
  // actually taken. The scene is still unregistered, so this was not a live
  // bug -- but a dead site that stays broken becomes a live bug the day
  // somebody registers the scene, and until then it kept the last entry on
  // scripts/probe-claims.cjs's "live money claims" line, where a non-zero
  // number should always mean something.
  'src/api_server/routes/x402.routes.ts': 2,
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
  it('the scan actually reads the repository', () => {
    /**
     * Safety against myself, and it had to be rebuilt.
     *
     * This used to be a floor on the NUMBER OF DIRTY FILES
     * (`toBeGreaterThan(2)`), loosened every time the campaign cleaned a
     * sibling: 10 -> 8 -> 2. That floor has the cleanup backwards -- it fails
     * BECAUSE the code got better, and it reaches zero meaning exactly when
     * the debt reaches zero, which is when a broken detector would matter
     * most. It fired on this very change.
     *
     * The thing actually worth guarding is different: if `collect()` ever
     * returns an empty list (a renamed directory, a broken walk), every other
     * test here passes over nothing at all. That check never goes stale, and
     * the detection pattern itself is pinned by the synthetic cases below.
     */
    expect(collect().length).toBeGreaterThan(500)
    expect(collect().some(f => f.endsWith('.ts'))).toBe(true)
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
