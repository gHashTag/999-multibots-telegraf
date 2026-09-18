/**
 * Инварианты денег, закреплённые по данным, а не по чтению кода.
 *
 * Замер: scripts/probe-money-map.cjs, разбор: docs/audit/money-map.md.
 *
 * Главный факт: баланс — это сумма `stars` по строкам платежей со статусом
 * COMPLETED, где MONEY_OUTCOME вычитается, а ВСЁ ОСТАЛЬНОЕ прибавляется.
 * Совпало с функцией базы 6 из 6 на самых активных счетах.
 *
 * Отсюда два следствия, которые и стережёт этот тест:
 *
 *   1. Новый тип операции автоматически попадает в ветку «прибавить» и
 *      становится НАЧИСЛЯЮЩИМ — молча. Так `SERVICE_PAYMENT` мог бы стать
 *      источником бесплатных звёзд. Список типов должен меняться осознанно.
 *
 *   2. Перевод строки в COMPLETED и ЕСТЬ начисление. Значит каждое место в
 *      коде, которое это делает, — место выдачи денег. Их должно быть
 *      известное число, и новое не должно появляться незаметно.
 *
 * Я уже ошибся здесь трижды подряд, потому что рассуждал по коду. Этот тест —
 * замена рассуждению.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** Присвоение статуса COMPLETED — не сравнение с ним. */
const WRITES_COMPLETED =
  /(status\s*[:=]\s*[^,;\n]*PaymentStatus\.COMPLETED|updatePaymentStatus\s*\([^)]*PaymentStatus\.COMPLETED)/

const isComparison = (line: string) => /===|!==|\.eq\(/.test(line)

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

const TYPES_FILE = 'src/interfaces/payments.interface.ts'

/**
 * Значения enum PaymentType — читаем из файла, а не импортом: правка коснётся
 * именно этого объявления, и проверять надо его.
 */
function paymentTypes(): string[] {
  const src = fs.readFileSync(TYPES_FILE, 'utf8')
  const body = src.match(/export enum PaymentType\s*\{([^}]*)\}/)?.[1]
  if (!body) return []
  return [...body.matchAll(/(\w+)\s*=\s*'([^']+)'/g)].map(m => m[2]).sort()
}

/** Файлы, где код переводит платёж в COMPLETED. */
function creditingFiles(): string[] {
  const files = new Set<string>()
  for (const f of collect()) {
    for (const line of strip(fs.readFileSync(f, 'utf8')).split('\n')) {
      if (WRITES_COMPLETED.test(line) && !isComparison(line)) files.add(f)
    }
  }
  return [...files].sort()
}

/**
 * Каждое место выдачи денег — с указанием, кто и за что здесь платит.
 * Запись без причины хуже отсутствия записи: она выглядит как разрешение.
 */
const CREDITING_SITES: Record<string, string> = {
  'src/api_server/routes/robokassa.routes.ts':
    'оплата картой, подтверждение от Robokassa',
  'src/api_server/routes/x402.routes.ts':
    'оплата по протоколу x402 — маршрут НЕ подключён в api_server/index.ts',
  'src/commands/adminSubscriptionCommand.ts':
    'выдача подписки владельцем вручную',
  'src/core/supabase/createSuccessfulPayment.ts':
    'общая запись состоявшейся оплаты',
  // cyrillic-ok-next-line: registry text
  'src/core/supabase/claimPendingInvoice.ts':
    'CAS: переводит PENDING в COMPLETED, сверив сумму — выдача без указания суммы', // cyrillic-ok: registry text
  'src/core/supabase/directPayment.ts':
    'прямая запись платежа без внешней системы',
  'src/core/supabase/updateUserBalance.ts': 'списания и начисления из кода',
  'src/handlers/paymentHandlers/index.ts': 'оплата звёздами Telegram',
  'src/scenes/tonNativePaymentScene/index.ts': 'оплата монетой TON',
  'src/scenes/tonPaymentScene/index.ts': 'оплата USDT в сети TON',
}

describe('карта денег: типы операций', () => {
  it('разбор находит объявление типов — иначе тест пустой', () => {
    expect(paymentTypes().length).toBeGreaterThan(0)
  })

  it('список типов ровно такой, каким он измерен', () => {
    // В реестре встречаются MONEY_OUTCOME, MONEY_INCOME, REFUND и один BONUS.
    // BONUS в коде отсутствует намеренно — единственная строка из прошлого.
    // Любое добавление сюда прибавляет деньги, пока не изменена функция
    // get_user_balance внутри базы (её определения в репозитории нет).
    expect(paymentTypes()).toEqual(['MONEY_INCOME', 'MONEY_OUTCOME', 'REFUND'])
  })

  it('SERVICE_PAYMENT не возвращён', () => {
    // Он годами вызывался тремя визардами, отвергался схемой и не списал
    // ни одной звезды. Возврат сделал бы его начисляющим (PR #506).
    expect(paymentTypes()).not.toContain('SERVICE_PAYMENT')
  })

  it('ровно один тип списывает — остальные прибавляют', () => {
    // Свойство не кода, а формулы баланса. Держим его на виду: если типов,
    // трактуемых как расход, станет два, формулу в базе тоже надо менять.
    expect(paymentTypes().filter(t => /OUTCOME/.test(t))).toEqual([
      'MONEY_OUTCOME',
    ])
  })
})

describe('карта денег: места выдачи', () => {
  it('разбор находит места — иначе тест пустой', () => {
    // Страховка от самого себя: сломанный шаблон дал бы зелёный и
    // бессмысленный результат.
    expect(creditingFiles().length).toBeGreaterThan(5)
  })

  it('разбор не принимает сравнение за присвоение', () => {
    const sample = [
      'if (payment.status === PaymentStatus.COMPLETED) {',
      ".eq('status', PaymentStatus.COMPLETED)",
    ]
    for (const line of sample) {
      expect(WRITES_COMPLETED.test(line) && !isComparison(line)).toBe(false)
    }
    expect(
      WRITES_COMPLETED.test('  status: PaymentStatus.COMPLETED,') &&
        !isComparison('  status: PaymentStatus.COMPLETED,')
    ).toBe(true)
  })

  it('нет мест выдачи денег вне перечисленных', () => {
    // Новое такое место — это новый способ получить звёзды. Он должен
    // появляться с объяснением, а не между делом.
    const undocumented = creditingFiles().filter(f => !CREDITING_SITES[f])
    expect(undocumented).toEqual([])
  })

  it('в списке нет файлов, где выдачи уже нет', () => {
    // Запись, пережившая свою причину, молча прикроет следующую.
    const found = new Set(creditingFiles())
    const stale = Object.keys(CREDITING_SITES).filter(f => !found.has(f))
    expect(stale).toEqual([])
  })
})
