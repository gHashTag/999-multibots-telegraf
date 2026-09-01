import { describe, expect, it, vi } from 'vitest'
import {
  loadPrivateProfileCounts,
  loadVisiblePrivateProfileCounts,
} from './privateCounts'

describe('loadPrivateProfileCounts', () => {
  it('returns exact owner resource counts from the canonical tables', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ plan_count: 1, files_count: 131, skills_count: 3 }],
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
