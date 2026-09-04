/**
 * Деньги обучения: чем закончилась операция — известно, и сказано ровно это.
 *
 * Семь мест в четырёх файлах обучения выбрасывали результат денежной операции
 * (см. unchecked-money-result.test.ts, откуда эти файлы удалены). Помимо
 * выброшенного результата там нашлись:
 *
 *   — возврат СТАРОГО БАЛАНСА вместо суммы операции
 *     (generateModelTraining: при балансе 1000 и цене 500 неудача давала
 *     1500 вместо 1000);
 *   — возврат по условию «денег хватало», а не «деньги списаны» — ошибка
 *     внутри самого шага списания вела к возврату несписанного
 *     (класс docs/audit/first-touch.md: 126 из 171 возврата без списания);
 *   — «Средства возвращены» человеку без проверки начисления.
 *
 * Тесты статические: они читают исходники и стерегут конкретные свойства
 * правок. Каждое свойство проверено мутацией: верни старую строку — падает
 * именно тот тест, который её стережёт.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ifElseBlocks } = require('../../../scripts/lib/call-args.cjs')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { blank } = require('../../../scripts/lib/blank-code.cjs')

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const read = (f: string) => strip(fs.readFileSync(f, 'utf8'))

const GEN = 'src/inngest_app/functions/training/generateModelTraining.ts'
const V2 = 'src/inngest_app/functions/training/modelTrainingV2.ts'
const RVC = 'src/inngest_app/functions/training/voiceTrainingRVC.ts'
const WIZ = 'src/scenes/voiceTrainingWizard/index.ts'

describe('generateModelTraining: списание и возврат', () => {
  const src = read(GEN)

  it('разбор находит денежные вызовы — иначе тест пустой', () => {
    expect(src).toMatch(/updateUserBalance\s*\(/)
  })

  it('возврат — суммой операции, а не старым балансом', () => {
    // Мутация: верни balanceCheck.currentBalance вторым аргументом — упадёт.
    expect(src).toMatch(
      /updateUserBalance\(\s*eventData\.telegram_id,\s*refundAmount,\s*PaymentType\.MONEY_INCOME/
    )
    expect(src).not.toMatch(
      /updateUserBalance\(\s*eventData\.telegram_id,\s*balanceCheck/
    )
  })

  it('возврат разрешён по «списание состоялось», а не по «денег хватало»', () => {
    expect(src).toMatch(/if \(charged && paymentAmount\)/)
    expect(src).not.toMatch(/if \(balanceCheck\?\.success && paymentAmount\)/)
  })

  it('отказ списания останавливает запуск обучения — без ретраев', () => {
    // The body of the `if (!ok)` guard, not 1200 characters after the charge.
    // That width carried the verdict -- halving it turned this red -- and it
    // accepted a throw from anywhere nearby, including outside this branch.
    const at = src.indexOf('const ok = await updateUserBalance(')
    expect(at).toBeGreaterThan(-1)
    const g = ifElseBlocks(blank(src), 'if \\(!ok\\)')
    expect(g.conStart, 'нет охраны if (!ok)').toBeGreaterThan(at)
    // Sliced from the RAW source: the message is a string literal, and the
    // mask blanks literal contents.
    const body = src.slice(g.conStart, g.conEnd)
    // Именно NonRetriableError: обычный Error заставил бы Inngest ретраить
    // неидемпотентное списание — двойная строка MONEY_OUTCOME.
    expect(body).toMatch(
      /throw new NonRetriableError\(\s*'Balance charge failed/
    )
  })

  it('«возвращены» пишется по результату, невозврат — с алертом', () => {
    expect(src).toMatch(/if \(refundResult\.success\)/)
    expect(src).toMatch(/REFUND FAILED/)
  })
})

describe('modelTrainingV2: возврат', () => {
  const src = read(V2)

  it('разбор находит денежные вызовы — иначе тест пустой', () => {
    expect(src).toMatch(/updateUserBalance\s*\(/)
  })

  it('результат возврата не выбрасывается и виден в шаге', () => {
    expect(src).toMatch(/const refunded = await step\.run\('refund-balance'/)
    expect(src).toMatch(/const ok = await updateUserBalance\(/)
    expect(src).toMatch(/REFUND FAILED/)
  })

  it('человеку говорится настоящий исход возврата', () => {
    // Мутация: сделай refundLine безусловной строкой «Средства возвращены» —
    // упадёт: строка обязана зависеть от refunded.
    expect(src).toMatch(/const refundLine = refunded/)
    expect(src).toMatch(/\$\{refundLine\}/)
  })
})

describe('voiceTrainingRVC: возвраты и уведомление', () => {
  const src = read(RVC)

  it('разбор находит денежные вызовы — иначе тест пустой', () => {
    expect(src).toMatch(/updateUserBalance\s*\(/)
  })

  it('оба возврата возвращают результат из шага', () => {
    expect(src).toMatch(/const refunded = await step\.run\('refund-user'/)
    expect(src).toMatch(/const refunded = await step\.run\('refund'/)
    expect(
      (src.match(/const ok = await updateUserBalance\(/g) || []).length
    ).toBe(2)
  })

  it('уведомление о провале получает настоящий исход возврата', () => {
    // Регексы терпимы к переносам строк: prettier (printWidth 80) переносит
    // эти вызовы, и однострочная форма падала бы на верном коде.
    expect(src).toMatch(
      /notifyUser\(\s*telegram_id,\s*false,\s*finalStatus\.error,\s*bot_name,\s*refunded,?\s*\)/
    )
    expect(src).toMatch(
      /notifyUser\(\s*voiceModel\.telegram_id,\s*false,\s*error,\s*undefined,\s*refunded,?\s*\)/
    )
  })

  it('«возвращены» — только при строгом true; забытый аргумент даёт «поддержку»', () => {
    // Мутация: замени refunded === true на !refunded или на умолчание true —
    // упадёт. Умолчание «успех» однажды проставит возврат, которого не было.
    expect(src).toMatch(/refunded === true/)
    expect(src).toMatch(/Вернуть звёзды автоматически не удалось/)
  })
})

describe('voiceTrainingWizard: списание, возврат, отказ', () => {
  const src = read(WIZ)

  it('разбор находит денежные вызовы — иначе тест пустой', () => {
    expect(src).toMatch(/updateUserBalance\s*\(/)
  })

  it('отказ списания не запускает обучение', () => {
    expect(src).toMatch(/charged = await updateUserBalance\(/)
    // The guard's body, not 700 characters after it.
    const g = ifElseBlocks(blank(src), 'if \\(!charged\\)')
    expect(g.conStart, 'нет охраны if (!charged)').toBeGreaterThan(-1)
    expect(src.slice(g.conStart, g.conEnd)).toMatch(/ctx\.scene\.leave\(\)/)
  })

  it('возврат в catch — только после состоявшегося списания и не второй раз', () => {
    const at = src.indexOf('} catch (error) {')
    expect(at).toBeGreaterThan(-1)
    const tail = src.slice(at)
    expect(tail).toMatch(/if \(charged && !refundHandled\)/)
    expect(tail).toMatch(/refundAndTell\(/)
    // Утверждение «Средства возвращены» без проверки — ушло.
    expect(tail).not.toMatch(/Средства возвращены\. Попробуйте позже/)
  })

  it('пока получатель мёртв — сцена отказывает на входе, не взяв денег', () => {
    // Событие voice/training.start никто не слушает, таблицы voice_models
    // нет. Мутация: поставь флагу false — упадёт; включать можно только
    // вместе с регистрацией voiceTrainingRVC и созданием таблицы.
    expect(src).toMatch(/const VOICE_TRAINING_DISCONNECTED = true/)
    expect(src).toMatch(/if \(VOICE_TRAINING_DISCONNECTED\)/)
  })
})
