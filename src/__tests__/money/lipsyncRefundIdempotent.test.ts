import { describe, it, expect, vi, beforeEach } from 'vitest'

// async-lipsync-manager refunds a failed job via updateUserBalance. Two paths
// can race to refund the SAME job -- the 30s fallback poller can overlap itself
// when a provider status check hangs, and it can race the webhook path. A second
// refund double-credits the user (money loss). This ratchet locks that a job is
// refunded at most once.
const { updateUserBalance } = vi.hoisted(() => ({
  updateUserBalance: vi.fn(),
}))
vi.mock('@/core/supabase/updateUserBalance', () => ({ updateUserBalance }))

import { AsyncLipSyncManager } from '@/core/lipsync/async-lipsync-manager'

const makeJob = (id: string) =>
  ({
    id,
    telegramId: '123',
    chatId: 1,
    startTime: 0,
    input: {},
    cost: 5,
    status: 'failed',
  }) as any

describe('async-lipsync refund is idempotent per job (no double refund)', () => {
  beforeEach(() => updateUserBalance.mockReset())

  it('two concurrent refunds of the same job credit the user only once', async () => {
    updateUserBalance.mockResolvedValue(true)
    const mgr = AsyncLipSyncManager.getInstance() as any
    const job = makeJob('j1')
    await Promise.all([
      mgr.refundAndDescribe(job, 'test refund'),
      mgr.refundAndDescribe(job, 'test refund'),
    ])
    expect(updateUserBalance).toHaveBeenCalledTimes(1)
  })

  it('a refund that actually failed can be retried (flag reset)', async () => {
    updateUserBalance.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const mgr = AsyncLipSyncManager.getInstance() as any
    const job = makeJob('j2')
    await mgr.refundAndDescribe(job, 'test')
    await mgr.refundAndDescribe(job, 'test')
    expect(updateUserBalance).toHaveBeenCalledTimes(2)
  })
})
