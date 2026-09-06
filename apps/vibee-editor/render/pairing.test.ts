import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { issuePairingCode, claimPairingCode, PAIRING } from './session-store'

/**
 * A Postgres stand-in small enough to reason about.
 *
 * WHY NOT A REAL DATABASE. Every guard in `claimPairingCode` is written as a
 * WHERE clause precisely so the database enforces it under concurrency. A fake
 * cannot prove that. What it CAN prove is the thing that actually broke twice
 * in this file's neighbourhood: that the code paths call the right statements
 * in the right order and return the right shape.
 *
 * So this fake implements the four statements literally — including the
 * `consumed_at IS NULL` and `expires_at > now()` filters — and any statement it
 * does not recognise THROWS rather than silently returning no rows. A fake that
 * answers "0 rows" to a query it did not understand turns a broken test into a
 * passing one, which is worse than having no test.
 */
class FakePool {
  rows: {
    code_hash: string
    telegram_id: string
    expires_at: number
    consumed_at: number | null
    attempts: number
  }[] = []

  now = Date.now()

  async query(sql: string, params: unknown[] = []): Promise<{ rows: any[] }> {
    const s = sql.replace(/\s+/g, ' ').trim()

    if (s.startsWith('CREATE TABLE')) return { rows: [] }

    if (
      s.includes(
        'UPDATE app_pairing_codes SET consumed_at = now() WHERE telegram_id'
      )
    ) {
      for (const r of this.rows) {
        if (r.telegram_id === params[0] && r.consumed_at === null)
          r.consumed_at = this.now
      }
      return { rows: [] }
    }

    if (s.startsWith('INSERT INTO app_pairing_codes')) {
      this.rows.push({
        code_hash: String(params[0]),
        telegram_id: String(params[1]),
        expires_at: Date.parse(String(params[2])),
        consumed_at: null,
        attempts: 0,
      })
      return { rows: [] }
    }

    if (s.startsWith('SELECT telegram_id, expires_at, consumed_at, attempts')) {
      const hit = this.rows.filter(r => r.code_hash === params[0])
      return { rows: hit }
    }

    if (s.includes('SET attempts = attempts + 1')) {
      for (const r of this.rows) {
        if (r.consumed_at === null && r.expires_at > this.now) r.attempts++
      }
      return { rows: [] }
    }

    if (
      s.includes(
        'SET consumed_at = now() WHERE consumed_at IS NULL AND attempts >='
      )
    ) {
      for (const r of this.rows) {
        if (r.consumed_at === null && r.attempts >= Number(params[0]))
          r.consumed_at = this.now
      }
      return { rows: [] }
    }

    if (s.includes('SET consumed_at = now() WHERE code_hash')) {
      /*
       * УСЛОВИЯ БЕРУТСЯ ИЗ ЗАПРОСА, А НЕ ПОВТОРЯЮТСЯ ЗДЕСЬ.
       *
       * Подделка переписывала WHERE у себя, поэтому удаление
       * `AND consumed_at IS NULL` из настоящего кода — то есть снятие
       * ОДНОРАЗОВОСТИ кода, который выдаёт сессию и refresh-токен, —
       * оставляло все 20 тестов зелёными. Включая два с названиями «второй
       * обмен тем же кодом не проходит» и «код второй раз не проходит».
       *
       * Отсутствующее в SQL условие обязано отсутствовать и в отборе.
       */
      const проверяетОдноразовость = s.includes('consumed_at IS NULL')
      const проверяетСрок = s.includes('expires_at > now()')
      const out: any[] = []
      for (const r of this.rows) {
        if (
          r.code_hash === params[0] &&
          (!проверяетОдноразовость || r.consumed_at === null) &&
          (!проверяетСрок || r.expires_at > this.now)
        ) {
          r.consumed_at = this.now
          out.push({ telegram_id: r.telegram_id })
        }
      }
      return { rows: out }
    }

    throw new Error(`FakePool: неизвестный запрос: ${s.slice(0, 80)}`)
  }
}

describe('спаривание по коду', () => {
  let pool: FakePool
  beforeEach(() => {
    pool = new FakePool()
  })

  const выдать = (id: string, код: string) =>
    issuePairingCode(pool as any, id, () => код)

  it('код обменивается на тот telegram_id, которому выдан', async () => {
    await выдать('4242', '123456')
    const r = await claimPairingCode(pool as any, '123456')
    expect(r).toEqual({ ok: true, telegramId: '4242' })
  })

  it('второй обмен тем же кодом не проходит', async () => {
    await выдать('4242', '123456')
    await claimPairingCode(pool as any, '123456')
    const второй = await claimPairingCode(pool as any, '123456')
    expect(второй).toEqual({ ok: false, reason: 'expired' })
  })

  it('сырой код нигде не хранится — только его отпечаток', async () => {
    await выдать('4242', '123456')
    expect(JSON.stringify(pool.rows)).not.toContain('123456')
  })

  it('повторная выдача гасит прошлый код: живым остаётся ровно один', async () => {
    await выдать('4242', '111111')
    await выдать('4242', '222222')

    expect(await claimPairingCode(pool as any, '111111')).toEqual({
      ok: false,
      reason: 'expired',
    })
    expect(await claimPairingCode(pool as any, '222222')).toEqual({
      ok: true,
      telegramId: '4242',
    })
  })

  it('истёкший код не принимается', async () => {
    await выдать('4242', '123456')
    pool.now += (PAIRING.TTL_SECONDS + 1) * 1000
    expect(await claimPairingCode(pool as any, '123456')).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('чужой код не выдаёт чужую личность', async () => {
    await выдать('4242', '111111')
    expect(await claimPairingCode(pool as any, '999999')).toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  /**
   * Главный тест этого файла. Шесть цифр — миллион вариантов, и это защита
   * только потому, что попытки считаются. Если счётчик перестанет двигаться на
   * НЕВЕРНЫХ догадках, перебор станет бесплатным, а все остальные тесты
   * останутся зелёными: они проверяют верный код.
   */
  /*
   * ЭТИ ТРИ ПРОВЕРКИ ОПИСЫВАЛИ ЗАЩИТУ, КОТОРУЮ ПРИШЛОСЬ СНЯТЬ.
   *
   * Перебор ограничивался начислением промахов: пять неверных догадок — и код
   * гаснет. Разбор входа 07.09.2026 показал, чем это оплачено: начисление шло
   * запросом БЕЗ фильтра по владельцу
   *
   *     UPDATE app_pairing_codes SET attempts = attempts + 1
   *      WHERE consumed_at IS NULL AND expires_at > now()
   *
   * то есть каждый промах гасил живые коды ВСЕХ людей платформы. Маршрут не
   * требует личности (и не может: у входящего ещё ничего нет), тормоза по
   * частоте не было. Пять запросов в секунду с любого адреса — и вход по коду
   * не работает ни у кого, навсегда, ценой копеек.
   *
   * Снять защиту и промолчать было бы нечестно, поэтому прочность возвращена
   * двумя другими способами, и оба проверяются:
   *
   *   entry-throttle.test.ts   десять попыток в минуту с источника;
   *   ниже                     восемь цифр вместо шести — 10^8 вместо 10^6.
   *
   * Худший случай считается честно: тысяча адресов даёт 20 000 догадок за 120
   * секунд жизни кода — 0,02% против 10^8. Прежние шесть цифр дали бы 2% за то
   * же окно, то есть попадание за пару часов.
   */
  it('промах НЕ гасит ни свой код, ни чужие', async () => {
    await выдать('4242', '12345678')
    await выдать('7777', '87654321')
    for (let i = 0; i < 20; i++) {
      expect((await claimPairingCode(pool as any, '00000000')).ok).toBe(false)
    }
    // Оба кода живы: слепые догадки больше никого не выключают.
    expect(await claimPairingCode(pool as any, '12345678')).toEqual({
      ok: true,
      telegramId: '4242',
    })
    expect(await claimPairingCode(pool as any, '87654321')).toEqual({
      ok: true,
      telegramId: '7777',
    })
  })

  it('длина кода задана одним местом и берётся оттуда', () => {
    /*
     * Генератор брал `randomInt(0, 1_000_000)` и дополнял нулями до
     * PAIRING.DIGITS. Пока цифр было шесть, всё сходилось; подними длину — и
     * он молча продолжил бы выдавать миллион значений, дополняя нулями.
     * Восемь цифр на экране, энтропия прежняя: косметика вместо защиты.
     */
    // Без комментариев: рассказ о снятом `randomInt(0, 1_000_000)` обязан
    // остаться в коде и не должен ронять проверку. Пятый случай этого класса
    // за смену — вырезаем один раз.
    const маршруты = fs
      .readFileSync(path.join(__dirname, 'session-routes.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(PAIRING.DIGITS).toBe(8)
    expect(маршруты).toContain('const верх = 10 ** PAIRING.DIGITS')
    expect(маршруты).not.toContain('randomInt(0, 1_000_000)')
    // И приём кода не должен знать длину числом.
    expect(маршруты).not.toMatch(/\/\^\\d\{6\}\$\//)
  })

  it('коды разных людей не смешиваются', async () => {
    await выдать('1111', '111111')
    await выдать('2222', '222222')
    expect(await claimPairingCode(pool as any, '222222')).toEqual({
      ok: true,
      telegramId: '2222',
    })
  })
})
