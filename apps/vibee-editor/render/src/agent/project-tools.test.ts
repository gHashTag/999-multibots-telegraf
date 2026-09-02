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

describe('owner-scoped project tools', () => {
  it('lists and reads only with the verified context owner', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'one', name: 'One' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'one', name: 'One', composition: '{"tracks":[]}' }],
      })
    const ctx = { telegramId: 'owner-42', pool: { query } }
    await tool('projects_list').handler({}, ctx)
    await tool('project_get').handler({ project_id: 'one' }, ctx)
    expect(query.mock.calls[0][1]).toEqual(['owner-42'])
    expect(query.mock.calls[1][1]).toEqual(['one', 'owner-42'])
  })

  it('saves a draft without accepting ownership from arguments', async () => {
    const query = vi
      .fn()
      .mockResolvedValue({
        rows: [
          { id: 'one', name: 'One', updated_at: '2026-09-02T00:00:00.000Z' },
        ],
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
