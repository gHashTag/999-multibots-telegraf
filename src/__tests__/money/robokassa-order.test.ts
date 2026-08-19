/**
 * Порядок в обработчике оплаты: сначала начислить, потом пометить оплаченным.
 *
 * Повод. Раньше платёж помечался `COMPLETED` ДО зачисления звёзд. Если
 * зачисление не срабатывало, это только писалось в журнал — и человеку уходило
 * «оплата прошла успешно».
 *
 * Хуже всего, что починить это не мог даже повтор: Robokassa повторяет вызов
 * при неуспешном ответе, но повтор упирался в проверку «платёж уже обработан →
 * 200 OK», и звёзды не начислялись никогда.
 *
 * Отказ в зачислении не выдуман: `updateUserBalance` отклоняет `MONEY_INCOME`,
 * если у человека нет строки в `users` (docs/audit/ghost-payers.md).
 *
 * Тест разбирает исходник, а не поднимает сервер: проверяемое свойство —
 * ПОРЯДОК операций, и он виден статически. Поднимать Robokassa ради этого
 * незачем.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const FILE = 'src/api_server/routes/robokassa.routes.ts'

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const src = strip(fs.readFileSync(FILE, 'utf8'))

/** Индекс первого вхождения; -1 если нет. */
const at = (needle: string | RegExp) =>
  typeof needle === 'string' ? src.indexOf(needle) : src.search(needle)

describe('порядок обработки оплаты', () => {
  it('разбор находит ключевые шаги — иначе тест пустой', () => {
    expect(at('updateUserBalance(')).toBeGreaterThan(0)
    expect(at('status: PaymentStatus.COMPLETED')).toBeGreaterThan(0)
    expect(at('sendPaymentSuccessNotification(')).toBeGreaterThan(0)
  })

  it('звёзды начисляются ДО отметки «оплачено»', () => {
    // Главная проверка. Обратный порядок делает неудачу неисправимой:
    // повтор от платёжной системы упрётся в «уже обработан».
    expect(at('updateUserBalance(')).toBeLessThan(at('status: PaymentStatus.COMPLETED'))
  })

  it('человеку сообщают об успехе ПОСЛЕ отметки', () => {
    expect(at('status: PaymentStatus.COMPLETED')).toBeLessThan(
      at('sendPaymentSuccessNotification(')
    )
  })

  it('при неудаче начисления обработчик отвечает неуспехом', () => {
    // Иначе платёжная система считает вызов принятым и не повторит его.
    const idx = at('ДЕНЬГИ ПОЛУЧЕНЫ, ЗВЁЗДЫ НЕ НАЧИСЛЕНЫ')
    expect(idx).toBeGreaterThan(0)
    const tail = src.slice(idx, idx + 900)
    expect(tail).toMatch(/return\s+res\s*\.\s*status\(\s*5\d\d\s*\)/)
  })

  it('подпись проверяется раньше любых изменений', () => {
    // Без этого всё остальное не имеет смысла: поддельный вызов начислил бы
    // звёзды сам себе.
    expect(at('validateRobokassaSignature')).toBeLessThan(at('updateUserBalance('))
    expect(at('validateRobokassaSignature')).toBeLessThan(
      at('status: PaymentStatus.COMPLETED')
    )
  })
})
