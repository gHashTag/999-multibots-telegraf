/**
 * Порядок в обработчике оплаты — и что здесь на самом деле начисляет звёзды.
 *
 * ПОПРАВКА К ПРЕДЫДУЩЕЙ ВЕРСИИ ЭТОГО ТЕСТА. Я утверждал: «звёзды начисляются
 * ДО отметки оплачено» — и заставил код так работать. Рассуждение верное
 * вообще, но неверное здесь: я не проверил, ЧТО именно начисляет.
 *
 * Измерено по данным: баланс — это сумма `stars` по строкам со статусом
 * COMPLETED. То есть **сама строка платежа и есть начисление**. На один номер
 * счёта приходится ровно одна строка (16 681 уникальный inv_id на 17 136
 * строк, дублей ноль): вставка второй блокируется уникальностью, и код
 * обрабатывает это как код 23505.
 *
 * Значит, `updateUserBalance` в этом обработчике — ВТОРИЧНЫЙ шаг: то же
 * обновление по inv_id, сброс кэша, журнал. Его неудача не должна отменять
 * начисление.
 *
 * Мой перенос делал именно это: при отказе строка оставалась PENDING, и
 * человек НЕ получал звёзды — хотя до правки получал. И отказ вероятнее всего
 * у тех, у кого нет строки в `users`, то есть у тех, кого я и защищал.
 *
 * Тест теперь стережёт правильное свойство.
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

  it('отметка «оплачено» стоит ДО вторичного обновления баланса', () => {
    // Отметка и есть начисление: баланс считается по строкам COMPLETED.
    // Если сначала звать updateUserBalance и падать при его отказе, человек
    // останется без звёзд — ровно это я и сделал в прошлой версии.
    expect(at('status: PaymentStatus.COMPLETED')).toBeLessThan(at('updateUserBalance('))
  })

  it('человеку сообщают об успехе ПОСЛЕ отметки', () => {
    expect(at('status: PaymentStatus.COMPLETED')).toBeLessThan(
      at('sendPaymentSuccessNotification(')
    )
  })

  it('неудача вторичного обновления НЕ роняет обработку', () => {
    // Звёзды уже начислены отметкой. Ронять из-за вторичного шага значит
    // заставлять платёжную систему повторять успешный по сути вызов.
    const idx = at('secondary balance update failed')
    expect(idx).toBeGreaterThan(0)
    const tail = src.slice(idx, idx + 400)
    expect(tail).not.toMatch(/return\s+res\s*\.\s*status\(\s*5\d\d\s*\)/)
  })

  it('но неудача вторичного обновления обязательно попадает в журнал', () => {
    // Молчание здесь скрыло бы проблему с профилем человека.
    const idx = at('secondary balance update failed')
    const around = src.slice(Math.max(0, idx - 300), idx + 100)
    expect(around).toMatch(/logger\.error/)
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
