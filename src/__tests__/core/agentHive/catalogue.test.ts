import { describe, expect, it } from 'vitest'
import { HIVE_AGENTS } from '@/core/bot/agentHive/catalogue'
import { MARKETPLACE_AGENTS } from '../../../../apps/vibee-editor/packages/vibee-atoms/src/agent-marketplace'

/**
 * The bot cannot import the package (separate build roots), so the hive keeps
 * a copy of the identity fields; this is what keeps it a copy.
 */
describe('hive agents = marketplace agents', () => {
  it('has every catalogue agent, in order, with the same identity', () => {
    expect(HIVE_AGENTS.map(a => a.id)).toEqual(
      MARKETPLACE_AGENTS.map(a => a.id)
    )
    for (const [i, a] of MARKETPLACE_AGENTS.entries())
      expect(HIVE_AGENTS[i]).toEqual({
        id: a.id,
        icon: a.icon,
        name: { en: a.name.en, ru: a.name.ru },
        role: { en: a.role.en, ru: a.role.ru },
      })
  })
})
