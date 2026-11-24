/**
 * Spec: t27 specs/functions/broadcast-message-send.t27 (STEPS, NOTE 2026-09-17).
 *
 * The whole audience used to go through one step.run('send-messages'). A
 * retry after a mid-way failure re-sent to everyone already served, and one
 * slow Telegram answer could push the step past the HTTP budget. Now the
 * audience is split into batches of 25, one step.run('send-batch-<firstId>')
 * per batch with step.sleep('pause-after-<firstId>') between them, and the
 * function runs one at a time per bot_name.
 *
 * The handler is driven with a recording step object; the broadcast service
 * is mocked so no Telegram or database is touched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
  fetchUsers: vi.fn(),
  sendToAllUsers: vi.fn(),
  checkOwnerPermissions: vi.fn(),
}))

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/inngest_app/client', () => ({
  inngest: {
    createFunction: (opts: unknown, triggers: unknown, handler: unknown) => ({
      opts,
      triggers,
      handler,
    }),
  },
  createInngestFailureHandler: () => vi.fn(),
}))
vi.mock('@/services/plan_b/broadcast.service', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/services/plan_b/broadcast.service')>()
  return {
    ...actual,
    broadcastService: {
      fetchUsers: mocks.fetchUsers,
      sendToAllUsers: mocks.sendToAllUsers,
      checkOwnerPermissions: mocks.checkOwnerPermissions,
    },
  }
})

import { broadcastMessage } from '@/inngest_app/functions/broadcast/broadcastMessage'
import {
  splitIntoBatches,
  floodWaitSeconds,
  BROADCAST_BATCH_SIZE,
} from '@/services/plan_b/broadcast.service'

const fn = broadcastMessage as unknown as {
  opts: Record<string, unknown>
  handler: (ctx: unknown) => Promise<unknown>
}

function recordingStep() {
  const names: string[] = []
  return {
    names,
    run: async (name: string, f: () => Promise<unknown>) => {
      names.push(name)
      return f()
    },
    sleep: async (name: string, _d: string) => {
      names.push(`sleep:${name}`)
    },
  }
}

const users = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    telegram_id: String(1000 + i),
    bot_name: 'neuro_blogger_bot',
  }))

const event = (data: Record<string, unknown> = {}) => ({
  data: {
    textRu: 'ru',
    textEn: 'en',
    contentType: 'post_link',
    postLink: 'https://t.me/x/1',
    bot_name: 'neuro_blogger_bot',
    ...data,
  },
})

beforeEach(() => {
  mocks.fetchUsers.mockReset()
  mocks.sendToAllUsers.mockReset()
  mocks.sendToAllUsers.mockImplementation(
    async (_img: unknown, _txt: unknown, o: { recipients: unknown[] }) => ({
      successCount: o.recipients.length,
      errorCount: 0,
    })
  )
})

describe('broadcast-message-send: one step per batch of 25', () => {
  it('splits 60 recipients into 25 + 25 + 10 with a pause between batches', async () => {
    mocks.fetchUsers.mockResolvedValue({ users: users(60) })
    const step = recordingStep()
    const out = (await fn.handler({ event: event(), step })) as any

    expect(step.names).toEqual([
      'validate-input',
      'check-permissions',
      'fetch-users',
      'send-batch-1000',
      'sleep:pause-after-1000',
      'send-batch-1025',
      'sleep:pause-after-1025',
      'send-batch-1050',
      'analyze-results',
    ])
    expect(mocks.sendToAllUsers).toHaveBeenCalledTimes(3)
    const sizes = mocks.sendToAllUsers.mock.calls.map(
      c => c[2].recipients.length
    )
    expect(sizes).toEqual([25, 25, 10])
    expect(out.statistics).toMatchObject({
      totalUsers: 60,
      successCount: 60,
      errorCount: 0,
    })
  })

  it('a single batch has no pause', async () => {
    mocks.fetchUsers.mockResolvedValue({ users: users(3) })
    const step = recordingStep()
    await fn.handler({ event: event(), step })
    expect(step.names.filter(n => n.startsWith('sleep:'))).toEqual([])
    expect(step.names.filter(n => n.startsWith('send-batch-'))).toEqual([
      'send-batch-1000',
    ])
  })

  it('sums success and error counts across batches', async () => {
    mocks.fetchUsers.mockResolvedValue({ users: users(30) })
    mocks.sendToAllUsers
      .mockResolvedValueOnce({ successCount: 23, errorCount: 2 })
      .mockResolvedValueOnce({ successCount: 4, errorCount: 1 })
    const out = (await fn.handler({
      event: event(),
      step: recordingStep(),
    })) as any
    expect(out.statistics).toMatchObject({ successCount: 27, errorCount: 3 })
  })

  it('every batch call carries recipients, so the service does not re-query the audience', async () => {
    mocks.fetchUsers.mockResolvedValue({ users: users(26) })
    await fn.handler({ event: event(), step: recordingStep() })
    for (const call of mocks.sendToAllUsers.mock.calls) {
      expect(Array.isArray(call[2].recipients)).toBe(true)
      expect(call[2].recipients.length).toBeLessThanOrEqual(
        BROADCAST_BATCH_SIZE
      )
    }
  })

  it('runs one broadcast at a time per bot_name', () => {
    expect(fn.opts.concurrency).toEqual([
      { key: 'event.data.bot_name', limit: 1 },
    ])
  })
})

describe('broadcast helpers', () => {
  it('splitIntoBatches keeps order and covers every item', () => {
    const b = splitIntoBatches([1, 2, 3, 4, 5], 2)
    expect(b).toEqual([[1, 2], [3, 4], [5]])
    expect(splitIntoBatches([], 2)).toEqual([])
  })

  it('floodWaitSeconds reads Telegram 429 retry_after, capped, and ignores other errors', () => {
    expect(
      floodWaitSeconds({
        response: { error_code: 429, parameters: { retry_after: 7 } },
      })
    ).toBe(7)
    expect(
      floodWaitSeconds({
        response: { error_code: 429, parameters: { retry_after: 900 } },
      })
    ).toBe(60)
    expect(floodWaitSeconds({ response: { error_code: 429 } })).toBe(1)
    expect(floodWaitSeconds({ response: { error_code: 403 } })).toBeNull()
    expect(floodWaitSeconds(new Error('x'))).toBeNull()
  })
})

describe('manifest agrees with the code', () => {
  it('lists the batch step and the pause, not send-messages', () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../inngest_app/functions.manifest.json'),
        'utf8'
      )
    )
    const f = manifest.functions.find(
      (x: { id: string }) => x.id === 'broadcast-message-send'
    )
    expect(f.steps).toEqual([
      'validate-input',
      'check-permissions',
      'fetch-users',
      'send-batch-${firstId}',
      'pause-after-${firstId}',
      'analyze-results',
    ])
  })
})
