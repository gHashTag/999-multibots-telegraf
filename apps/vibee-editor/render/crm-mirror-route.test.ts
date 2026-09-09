import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'

/**
 * POST /api/crm/mirror: the bot's DM exchange into the memory at once.
 */
const OWNER = '144022504'

function req(body: unknown) {
  const r = Readable.from([
    Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
  ])
  return Object.assign(r, {
    url: '/api/crm/mirror',
    method: 'POST',
    headers: {},
  }) as never
}
function res() {
  const out = { code: 0, body: null as any }
  return {
    out,
    writeHead: (code: number) => {
      out.code = code
    },
    end: (s: string) => {
      out.body = JSON.parse(s)
    },
  }
}

const mirrorNow = vi.fn(async () => ({ fresh: 2, zep: 2 }))
beforeEach(() => {
  vi.resetModules()
  mirrorNow.mockClear()
  vi.doMock('./src/agent/crm-mirror', () => ({ mirrorNow }))
})

describe('handleCrmMirror', () => {
  it('parses the messages, dates in three shapes, and mirrors them for the verified owner', async () => {
    const { handleCrmMirror } = await import('./src/agent/routes')
    const r = res()
    await handleCrmMirror(
      req({
        lead: '900000001',
        name: 'Pilot',
        messages: [
          {
            msg_id: 10,
            at: '2026-09-08T16:09:43Z',
            out: false,
            text: 'сколько стоит рилс?',
          },
          { msg_id: 11, at: 1757348157, out: true, text: 'смотря какой' },
          { msg_id: 12, at: 1757348157000, out: true, text: '' },
        ],
      }),
      r as never,
      OWNER,
      async () => ({ query: async () => ({ rows: [] }) })
    )
    expect(r.out.code).toBe(200)
    expect(r.out.body).toEqual({ ok: true, fresh: 2, zep: 2 })
    const [, owner, lead, msgs, name] = mirrorNow.mock.calls[0] as unknown as [
      unknown,
      string,
      string,
      any[],
      string,
    ]
    expect(owner).toBe(OWNER)
    expect(lead).toBe('900000001')
    expect(name).toBe('Pilot')
    expect(msgs.map(m => m.msgId)).toEqual([10, 11])
    expect(msgs[0].at.toISOString()).toBe('2026-09-08T16:09:43.000Z')
    expect(msgs[1].at.getTime()).toBe(1757348157000)
    expect(msgs[0].out).toBe(false)
  })

  it('refuses a bad lead, the owner themselves, no messages, and non-JSON -- before touching the memory', async () => {
    const { handleCrmMirror } = await import('./src/agent/routes')
    const pool = async () => ({ query: async () => ({ rows: [] }) })
    for (const body of [
      { lead: '@pilot_client', messages: [{ msg_id: 1, text: 'x' }] },
      { lead: OWNER, messages: [{ msg_id: 1, text: 'x' }] },
      { lead: '900000001', messages: [] },
      { lead: '900000001', messages: [{ msg_id: 'nope', text: 'x' }] },
      '{not json',
    ]) {
      const r = res()
      await handleCrmMirror(req(body), r as never, OWNER, pool)
      expect(r.out.code, JSON.stringify(body)).toBe(400)
    }
    expect(mirrorNow).not.toHaveBeenCalled()
  })
})
