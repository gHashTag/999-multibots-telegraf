/**
 * Неудачная запись платежа не должна выглядеть успешной.
 *
 * Повод. `setPayments` создаёт строку PENDING ПЕРЕД тем, как человека отправят
 * платить по ссылке. Раньше при ошибке вставки она писала в журнал и
 * возвращала `undefined` — то есть выглядела успешной.
 *
 * Цена молчания: записи нет, человек уходит платить, деньги списываются у
 * платёжной системы, обратный вызов Robokassa не находит платёж по `inv_id` и
 * отвечает «Payment not found». Звёзды не начислены, следа в базе нет.
 *
 * Отдельно горько: вызывающий код делал всё правильно — `getRuBillWizard`
 * оборачивает вызов в try/catch и говорит человеку «не удалось создать платёж».
 * Эта защита не срабатывала НИКОГДА, потому что бросать было нечему.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let insertError: { message: string; code?: string } | null = null

vi.mock('@/core/supabase', () => ({
  supabase: {
    from: () => ({
      insert: () => Promise.resolve({ error: insertError }),
    }),
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { setPayments } = await import('@/core/supabase/setPayments')

const base = {
  telegram_id: '144022504',
  OutSum: '1000',
  InvId: '12345',
  currency: 'RUB',
  stars: 1000,
  status: 'PENDING',
  payment_method: 'Robokassa',
  type: 'MONEY_INCOME',
  bot_name: 'neuro_blogger_bot',
  language: 'ru',
} as never

describe('запись платежа', () => {
  beforeEach(() => {
    insertError = null
  })

  it('успешная вставка не бросает', async () => {
    await expect(setPayments(base)).resolves.not.toThrow()
  })

  it('ошибка вставки БРОСАЕТ, а не молчит', async () => {
    insertError = { message: 'permission denied for table payments_v2', code: '42501' }

    // Главная проверка. Молчание здесь стоит человеку денег: он уйдёт платить
    // по ссылке, а записи, к которой привяжется подтверждение, не будет.
    await expect(setPayments(base)).rejects.toThrow(/12345/)
  })

  it('повтор той же записи НЕ бросает — строка уже есть', async () => {
    // 23505 — нарушение уникальности. Нужная строка существует, значит цель
    // достигнута; падать здесь означало бы ломать повторные попытки.
    insertError = { message: 'duplicate key value', code: '23505' }

    await expect(setPayments(base)).resolves.not.toThrow()
  })

  it('в тексте ошибки есть номер счёта — по нему ищут в поддержке', async () => {
    insertError = { message: 'connection reset', code: '08006' }

    await expect(setPayments(base)).rejects.toThrow(/inv_id 12345/)
  })
})
