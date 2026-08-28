import { describe, it, expect, beforeEach } from 'vitest'
import {
  startJob,
  finishJob,
  failJob,
  getJob,
  listJobs,
  _resetJobs,
} from './generate-jobs'

describe('generation jobs', () => {
  beforeEach(() => _resetJobs())

  it('records a result under the id handed out before the work started', () => {
    const job = startJob('video', '4242', 'a cat')
    expect(job.state).toBe('running')

    finishJob(job.id, 'https://storage/a.mp4', 'replicate/seedance')

    const found = getJob(job.id)
    expect(found?.state).toBe('done')
    expect(found?.url).toBe('https://storage/a.mp4')
    expect(found?.provider).toBe('replicate/seedance')
  })

  it('a failure is recorded too, not silently dropped', () => {
    const job = startJob('audio', '4242')
    failJob(job.id, 'ELEVENLABS_API_KEY holds an id, not a key')
    expect(getJob(job.id)?.state).toBe('failed')
    expect(getJob(job.id)?.error).toContain('ELEVENLABS')
  })

  /**
   * The test this file exists for.
   *
   * A prompt says what someone was trying to make and the url points at a file
   * they paid for. Both are personal. The naive filter — job.owner === owner —
   * matches every server-to-server job (owner '') against a caller with no
   * identity, handing one person's list to another.
   */
  it('never returns another account list, and an empty owner matches nothing', () => {
    const mine = startJob('video', '4242', 'mine')
    startJob('video', '9999', 'someone else')
    startJob('video', '', 'server to server')

    const forMe = listJobs('4242')
    expect(forMe.map(j => j.id)).toEqual([mine.id])

    // The dangerous case: no identity must not mean "everything".
    expect(listJobs('')).toEqual([])
  })

  it('newest first, so a lost result is the first thing seen', () => {
    const a = startJob('image', '4242', 'older')
    // startedAt comes from Date.now(); two calls in the same millisecond would
    // make the order arbitrary, so the older one is aged explicitly.
    const stored = getJob(a.id)!
    stored.startedAt -= 5000
    const b = startJob('image', '4242', 'newer')

    expect(listJobs('4242').map(j => j.id)).toEqual([b.id, a.id])
  })

  it('finishing an unknown id is ignored rather than throwing', () => {
    // A late callback for a swept job must not take the process down.
    expect(() => finishJob('no-such-id', 'https://x')).not.toThrow()
    expect(() => failJob('no-such-id', 'boom')).not.toThrow()
  })
})
