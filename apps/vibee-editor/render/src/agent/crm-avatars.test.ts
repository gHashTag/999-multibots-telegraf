import { describe, expect, it } from 'vitest'
import {
  COMPACT_TOOLS,
  COMPACT_TOOLS_EXCLUDED,
  DIRECT_CALL_ONLY,
  TOOLS_BY_NAME,
} from './tools'
import { DUE_SQL } from './crm-avatars'

/**
 * FACES IN THE CRM (crm_client_avatars).
 *
 * The tool opens the owner's Telegram session and walks up to 30 people, so
 * it is the SCREEN's, not the model's: registered, callable directly over
 * /mcp, refused inside a model turn, and kept out of the compact kit whose
 * token budget is pinned. And it looks only at the caller's own people.
 */
describe('crm_client_avatars', () => {
  it('is registered', () => {
    expect(TOOLS_BY_NAME.get('crm_client_avatars')).toBeTruthy()
  })

  it('is direct-call only and outside the compact kit', () => {
    expect(DIRECT_CALL_ONLY.has('crm_client_avatars')).toBe(true)
    expect(COMPACT_TOOLS.test('crm_client_avatars')).toBe(true)
    expect(COMPACT_TOOLS_EXCLUDED.test('crm_client_avatars')).toBe(true)
  })

  it('reads only the caller’s own people, never checked or stale first', () => {
    expect(DUE_SQL).toMatch(/WHERE owner_id = \$1/)
    expect(DUE_SQL).toMatch(/avatar_checked_at IS NULL/)
    expect(DUE_SQL).toMatch(/LIMIT \$3/)
  })
})
