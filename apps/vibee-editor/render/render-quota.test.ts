import { describe, expect, it } from 'vitest'
import {
  FREE_RENDER_LIMIT,
  readRenderQuota,
  refundRenderQuota,
  reserveRenderQuota,
} from './render-quota'

function fakePool() {
  let used = 0
  const запросы: string[] = []
  return {
    get used() {
      return used
    },
    /** Все SQL, которые сюда пришли: проверять надо текст, а не догадку. */
    get запросы() {
      return запросы
    },
    async query(sql: string) {
      запросы.push(sql)
      if (sql.includes('CREATE TABLE')) return { rows: [] }
      if (sql.includes('SELECT used_count'))
        return { rows: [{ used_count: used }] }
      if (sql.includes('INSERT INTO app_render_quota')) {
        if (used >= FREE_RENDER_LIMIT) return { rows: [] }
        used += 1
        return { rows: [{ used_count: used }] }
      }
      if ((() => {
        /*
         * ВОЗВРАТ КВОТЫ ОБЯЗАН БЫТЬ ИМЕННЫМ.
         *
         * Подделка считала один счётчик и о владельце не знала вовсе, поэтому
         * мутация `WHERE telegram_id = $1 AND period_start = $2::date` →
         * `WHERE period_start = $2::date` оставляла зелёными все 88 файлов
         * набора. В настоящем Postgres это возвращает квоту ВСЕМ
         * пользователям за текущий месяц при каждом неудачном рендере.
         */
        if (sql.includes('GREATEST') && !/telegram_id = \$1/.test(sql)) {
          throw new Error(
            'возврат квоты без привязки к владельцу: ' +
              sql.replace(/\s+/g, ' ').slice(0, 160)
          )
        }
        return sql.includes('GREATEST')
      })()) {
        used = Math.max(0, used - 1)
        return { rows: [] }
      }
      throw new Error(`unexpected SQL: ${sql}`)
    },
  }
}

describe('authoritative render quota', () => {
  it('reserves atomically up to the configured free limit', async () => {
    const pool = fakePool()
    const outcomes = []
    for (let i = 0; i < FREE_RENDER_LIMIT + 1; i += 1) {
      outcomes.push(await reserveRenderQuota(pool, '42', false))
    }
    expect(outcomes.filter(result => result.allowed)).toHaveLength(
      FREE_RENDER_LIMIT
    )
    expect(outcomes.at(-1)?.allowed).toBe(false)
  })

  it('refunds a failed render and reports the server count', async () => {
    const pool = fakePool()
    const reservation = await reserveRenderQuota(pool, '42', false)
    await refundRenderQuota(pool, '42', false, reservation.periodStart)
    expect((await readRenderQuota(pool, '42', false)).total_renders).toBe(0)
  })

  it('ВОЗВРАТ ИМЕННОЙ: в запросе есть привязка к владельцу', async () => {
    /*
     * Доказано мутацией: убрать `telegram_id = $1` из возврата — и все 88
     * файлов набора остаются зелёными. В настоящем Postgres это возвращает
     * квоту ВСЕМ пользователям за текущий месяц при каждом неудачном рендере.
     *
     * Проверка смотрит на ТЕКСТ запроса, а не на поведение подделки: подделка
     * считает один счётчик и о владельцах не знает вовсе, поэтому по её
     * поведению отличить именной возврат от общего невозможно в принципе.
     */
    const pool = fakePool()
    const reservation = await reserveRenderQuota(pool, '42', false)
    await refundRenderQuota(pool, '42', false, reservation.periodStart)
    const возврат = pool.запросы.find(q => q.includes('GREATEST'))
    expect(возврат, 'возврат квоты вообще не выполнялся').toBeDefined()
    expect(возврат).toMatch(/telegram_id = \$1/)
  })

  it('keeps the verified owner unlimited without mutating usage', async () => {
    const pool = fakePool()
    expect(await reserveRenderQuota(pool, '42', true)).toEqual({
      allowed: true,
      used: 0,
      periodStart: null,
    })
    expect(pool.used).toBe(0)
  })

  it('refunds the exact reserved month after a UTC rollover', async () => {
    const calls: unknown[][] = []
    const pool = {
      async query(sql: string, params: unknown[] = []) {
        calls.push(params)
        if (sql.includes('CREATE TABLE')) return { rows: [] }
        if (sql.includes('INSERT INTO app_render_quota')) {
          return { rows: [{ used_count: 1 }] }
        }
        if (sql.includes('GREATEST')) {
          // Та же проверка, что и в подделке выше: возврат квоты обязан быть
          // ИМЕННЫМ. Подделок в файле две, и починка одной оставила мутацию
          // незамеченной — поймано этой же мутацией.
          if (!/telegram_id = \$1/.test(sql)) {
            throw new Error(
              'возврат квоты без привязки к владельцу: ' +
                sql.replace(/\s+/g, ' ').slice(0, 160)
            )
          }
          return { rows: [] }
        }
        throw new Error(`unexpected SQL: ${sql}`)
      },
    }
    const reservation = await reserveRenderQuota(
      pool,
      '42',
      false,
      new Date('2026-08-31T23:59:59.000Z')
    )
    await refundRenderQuota(pool, '42', false, reservation.periodStart)
    expect(calls.at(-1)?.[1]).toBe('2026-08-01')
  })
})
