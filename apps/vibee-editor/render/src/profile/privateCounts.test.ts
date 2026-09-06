import { describe, expect, it, vi } from 'vitest'
import {
  loadPrivateProfileCounts,
  loadVisiblePrivateProfileCounts,
} from './privateCounts'

describe('loadPrivateProfileCounts', () => {
  it('returns exact owner resource counts from the canonical tables', async () => {
    /*
     * ПОДДЕЛКА ПРОВЕРЯЕТ, ЧТО СЧЁТ ИМЕННОЙ.
     *
     * Мок отдавал числа при любом SQL. Доказано мутацией: заменить все три
     * `WHERE telegram_id = $1` на `WHERE $1 IS NOT NULL` — тест зелёный, а
     * счётчики превращаются в общеплатформенные итоги, то есть человек видит
     * у себя в профиле чужие числа.
     *
     * Каждый из трёх подсчётов обязан быть ограничен владельцем: пропустить
     * один — значит показать чужие файлы среди своих.
     */
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      const т = String(sql).replace(/\s+/g, ' ')
      const именных = (т.match(/WHERE telegram_id = \$1/g) || []).length
      if (именных < 3) {
        throw new Error(
          `подсчёт не ограничен владельцем (${именных} из 3): ${т.slice(0, 200)}`
        )
      }
      return { rows: [{ plan_count: 1, files_count: 131, skills_count: 3 }] }
    })

    await expect(
      loadPrivateProfileCounts({ query }, 'owner-telegram-id')
    ).resolves.toEqual({ plan_count: 1, files_count: 131, skills_count: 3 })

    expect(query).toHaveBeenCalledOnce()
    expect(query.mock.calls[0][1]).toEqual(['owner-telegram-id'])
  })

  it('returns null instead of inventing zeroes when storage is unavailable', async () => {
    const query = vi.fn().mockRejectedValue(new Error('database unavailable'))

    await expect(
      loadPrivateProfileCounts({ query }, 'owner-telegram-id')
    ).resolves.toBeNull()
  })

  it('never queries or exposes private counts to another viewer', async () => {
    const query = vi.fn()

    await expect(
      loadVisiblePrivateProfileCounts(
        { query },
        'profile-owner',
        'different-viewer'
      )
    ).resolves.toBeNull()
    expect(query).not.toHaveBeenCalled()
  })
})
