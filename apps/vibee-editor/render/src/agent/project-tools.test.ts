import { describe, expect, it, vi } from 'vitest'

vi.mock('../../project-routes', async importOriginal => {
  const original = await importOriginal<typeof import('../../project-routes')>()
  return { ...original, ensureProjectsTable: vi.fn() }
})

import { PROJECT_TOOLS } from './project-tools'

const tool = (name: string) => {
  const found = PROJECT_TOOLS.find(candidate => candidate.name === name)
  if (!found) throw new Error(`missing ${name}`)
  return found
}

/*
 * ВЛАДЕНИЕ ПРОВЕРЯЕТСЯ ПО SQL, А НЕ ПО ПАРАМЕТРАМ.
 *
 * Мок отдавал строку при любом запросе, а проверки смотрели только на
 * переданные параметры. Доказано мутацией: убрать `WHERE projects.telegram_id
 * = $2` из upsert — все тесты остаются зелёными, и ни один из 88 файлов
 * набора не краснеет. То есть инструмент агента мог бы затирать ЧУЖОЙ проект,
 * и об этом никто бы не узнал. Вторая мутация, AND→OR в чтении, превращает
 * `project_get` в чтение любого проекта по id — тоже зелено.
 */
function требуетВладения(sql: string, что: string): void {
  const т = sql.replace(/\s+/g, ' ')
  if (!/telegram_id = \$\d/.test(т)) {
    throw new Error(
      `${что}: в запросе нет привязки к владельцу — ${т.slice(0, 160)}`
    )
  }
  if (/ OR telegram_id/.test(т)) {
    throw new Error(`${что}: владелец через OR — это не ограничение, а обход`)
  }
}

describe('owner-scoped project tools', () => {
  it('lists and reads only with the verified context owner', async () => {
    let n = 0
    const ответы = [
      { rows: [{ id: 'one', name: 'One' }] },
      { rows: [{ id: 'one', name: 'One', composition: '{"tracks":[]}' }] },
    ]
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      требуетВладения(sql, 'чтение проекта')
      return ответы[n++] ?? { rows: [] }
    })
    const ctx = { telegramId: 'owner-42', pool: { query } }
    await tool('projects_list').handler({}, ctx)
    await tool('project_get').handler({ project_id: 'one' }, ctx)
    expect(query.mock.calls[0][1]).toEqual(['owner-42'])
    expect(query.mock.calls[1][1]).toEqual(['one', 'owner-42'])
  })

  it('saves a draft without accepting ownership from arguments', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      требуетВладения(sql, 'сохранение проекта')
      return {
        rows: [
          { id: 'one', name: 'One', updated_at: '2026-09-02T00:00:00.000Z' },
        ],
      }
    })
    const ctx = { telegramId: 'owner-42', pool: { query } }
    const result = await tool('project_save').handler(
      {
        project_id: 'one',
        name: 'One',
        composition: { schemaVersion: 1, tracks: [] },
        telegram_id: 'attacker',
      },
      ctx
    )
    expect(query.mock.calls[0][1]?.slice(0, 3)).toEqual([
      'one',
      'owner-42',
      'One',
    ])
    expect(JSON.stringify(query.mock.calls)).not.toContain('attacker')
    expect(result).toMatchObject({ saved: true, draft: true })
  })

  it('rejects invalid ids and compositions before the database', async () => {
    const query = vi.fn()
    const ctx = { telegramId: 'owner-42', pool: { query } }
    await expect(
      tool('project_get').handler({ project_id: '../other' }, ctx)
    ).rejects.toThrow(/project_id/)
    await expect(
      tool('project_save').handler(
        { project_id: 'one', name: 'One', composition: [] },
        ctx
      )
    ).rejects.toThrow(/composition/)
    expect(query).not.toHaveBeenCalled()
  })
})
