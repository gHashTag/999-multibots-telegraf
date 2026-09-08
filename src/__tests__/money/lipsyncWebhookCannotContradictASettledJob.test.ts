import { describe, it, expect, vi, beforeEach } from 'vitest'

// The fallback poller gives up 12 minutes in: it marks the job 'failed', tells
// the person it timed out and refunds. The kie.ai webhook can still arrive
// afterwards carrying a SUCCESS, and it calls completeJobByTaskId. Without a
// guard that call flips the settled job to 'completed' and sends the video, so
// the person keeps the refund and gets the product too. This ratchet locks the
// refusal -- and the positive case, because a guard that refuses everything
// would silently disable delivery instead.
vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: vi.fn().mockResolvedValue(true),
}))

import { AsyncLipSyncManager } from '@/core/lipsync/async-lipsync-manager'

const OUTPUT = { id: 'gen1', output: 'https://example.test/v.mp4' } as any

const withJob = (status: string, taskId: string) => {
  const mgr = AsyncLipSyncManager.getInstance() as any
  const job = {
    id: `job_${taskId}`,
    telegramId: '123',
    chatId: 1,
    startTime: 0,
    input: {},
    cost: 5,
    status,
    taskId,
    refundIssued: status === 'failed',
  }
  mgr.jobs.set(job.id, job)
  const sent = vi.fn().mockResolvedValue(undefined)
  mgr.sendSuccessResult = sent
  mgr.sendErrorResult = vi.fn().mockResolvedValue(undefined)
  return { mgr, job, sent }
}

describe('a webhook cannot contradict a job the poller already settled', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not deliver to a job already failed and refunded', async () => {
    const { mgr, job, sent } = withJob('failed', 'task_settled')
    const updated = await mgr.completeJobByTaskId('task_settled', OUTPUT)
    expect(updated).toBe(false)
    expect(sent).not.toHaveBeenCalled()
    expect(job.status).toBe('failed')
  })

  it('does not re-deliver to a job already completed', async () => {
    const { mgr, sent } = withJob('completed', 'task_done')
    expect(await mgr.completeJobByTaskId('task_done', OUTPUT)).toBe(false)
    expect(sent).not.toHaveBeenCalled()
  })

  it('still delivers to a job that is genuinely in flight', async () => {
    const { mgr, job, sent } = withJob('processing', 'task_live')
    expect(await mgr.completeJobByTaskId('task_live', OUTPUT)).toBe(true)
    expect(sent).toHaveBeenCalledTimes(1)
    expect(job.status).toBe('completed')
  })
})
