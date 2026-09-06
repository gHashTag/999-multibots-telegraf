import { describe, it, expect, beforeEach } from 'vitest'
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
  it('перебор гасит код после MAX_ATTEMPTS неверных догадок', async () => {
    await выдать('4242', '123456')

    for (let i = 0; i < PAIRING.MAX_ATTEMPTS; i++) {
      const r = await claimPairingCode(pool as any, '000000')
      expect(r.ok).toBe(false)
    }

    // Верный код после исчерпания бюджета уже мёртв.
    const после = await claimPairingCode(pool as any, '123456')
    expect(после.ok).toBe(false)
  })

  /**
   * Этот тест написан ПОСЛЕ мутации, которая должна была его уронить и не
   * уронила. Проверка выше смотрит только на отказ — а отказ даёт и ветка
   * `attempts >= MAX` при чтении строки, поэтому гашение по порогу можно было
   * удалить целиком, и все девять тестов остались бы зелёными.
   *
   * Разница между «отказано» и «погашено» не косметическая: непогашенный код
   * остаётся в таблице живым до истечения TTL, и любая будущая правка, которая
   * начнёт доверять `consumed_at`, воскресит его. Поэтому здесь утверждается
   * СОСТОЯНИЕ в базе, а не ответ функции.
   */
  it('исчерпанный код помечается погашенным, а не просто отклоняется', async () => {
    await выдать('4242', '123456')
    for (let i = 0; i < PAIRING.MAX_ATTEMPTS; i++) {
      await claimPairingCode(pool as any, '000000')
    }
    expect(pool.rows[0].consumed_at).not.toBeNull()
  })

  it('до исчерпания бюджета верный код ещё работает', async () => {
    await выдать('4242', '123456')
    for (let i = 0; i < PAIRING.MAX_ATTEMPTS - 1; i++) {
      await claimPairingCode(pool as any, '000000')
    }
    expect(await claimPairingCode(pool as any, '123456')).toEqual({
      ok: true,
      telegramId: '4242',
    })
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
