/**
 * THE SHUTDOWN NOTICE REGISTRY (services/laneNotices.ts).
 *
 * A job holds a notice from the moment it is handed to a lane until it ends.
 * At shutdown only the lanes the drain could not finish are told, each
 * recipient once however many of their jobs were left, and a failed send
 * does not stop the others.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let notices: typeof import('@/services/laneNotices')

beforeEach(async () => {
  vi.resetModules()
  notices = await import('@/services/laneNotices')
})

describe('shutdown notices', () => {
  it('only unfinished lanes are told, each recipient once', async () => {
    const send = vi.fn(async () => true)
    notices.holdShutdownNotice('dm:900000201', { recipient: 'a', send })
    notices.holdShutdownNotice('dm:900000201', { recipient: 'a', send })
    const other = vi.fn(async () => true)
    notices.holdShutdownNotice('dm:900000202', {
      recipient: 'b',
      send: other,
    })

    expect(await notices.sendShutdownNotices(['dm:900000201'])).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
  })

  it('a released notice is gone; releasing twice is harmless', async () => {
    const send = vi.fn(async () => true)
    const release = notices.holdShutdownNotice('crm:900000203', {
      recipient: 'c',
      send,
    })
    expect(notices.heldNoticeCount()).toBe(1)
    release()
    release()
    expect(notices.heldNoticeCount()).toBe(0)
    expect(await notices.sendShutdownNotices(['crm:900000203'])).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('a waiting job keeps the lane covered after the running one lets go', async () => {
    const send = vi.fn(async () => true)
    const first = notices.holdShutdownNotice('dm:900000204', {
      recipient: 'd',
      send,
    })
    notices.holdShutdownNotice('dm:900000204', { recipient: 'd', send })
    first()
    expect(await notices.sendShutdownNotices(['dm:900000204'])).toBe(1)
  })

  it('a failed send is not counted and does not stop the others', async () => {
    notices.holdShutdownNotice('dm:900000205', {
      recipient: 'e',
      send: async () => {
        throw new Error('Forbidden: bot was blocked by the user')
      },
    })
    const ok = vi.fn(async () => true)
    notices.holdShutdownNotice('dm:900000206', { recipient: 'f', send: ok })
    expect(
      await notices.sendShutdownNotices(['dm:900000205', 'dm:900000206'])
    ).toBe(1)
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('nothing unfinished, nothing sent', async () => {
    const send = vi.fn(async () => true)
    notices.holdShutdownNotice('dm:900000207', { recipient: 'g', send })
    expect(await notices.sendShutdownNotices([])).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })
})
