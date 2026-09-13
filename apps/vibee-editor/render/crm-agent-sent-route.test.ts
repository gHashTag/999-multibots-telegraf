import { describe, it, expect, beforeEach } from 'vitest'
import { Readable } from 'node:stream'

/**
 * POST /api/crm/agent-sent: the bot asks whether an outgoing business
 * message was the agent's confirmed proposal (so it does not pause the AI
 * on the agent's own words). The registry itself: TTL and bounds.
 */
const OWNER = '144022504'

function req(body: unknown) {
  const r = Readable.from([
    Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
  ])
  return Object.assign(r, {
    url: '/api/crm/agent-sent',
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

beforeEach(async () => {
  const { resetAgentSentForTests } = await import('./src/agent/agent-sent')
  resetAgentSentForTests()
})

describe('agent-sent registry', () => {
  it('remembers a send by owner, lead and Telegram message id, and forgets it after the TTL', async () => {
    const { recordAgentSent, wasAgentSent, AGENT_SENT_TTL_MS } = await import(
      './src/agent/agent-sent'
    )
    const t0 = 1_800_000_000_000
    expect(recordAgentSent(OWNER, '504608015', 4242, t0)).toBe(true)
    expect(recordAgentSent(OWNER, '504608015', 'nope', t0)).toBe(false)
    expect(wasAgentSent(OWNER, '504608015', 4242, t0 + 5_000)).toBe(true)
    // Same id in another chat, or another owner, is somebody else's message.
    expect(wasAgentSent(OWNER, '435572800', 4242, t0 + 5_000)).toBe(false)
    expect(wasAgentSent('1', '504608015', 4242, t0 + 5_000)).toBe(false)
    expect(
      wasAgentSent(OWNER, '504608015', 4242, t0 + AGENT_SENT_TTL_MS + 1)
    ).toBe(false)
  })

  it('keeps at most AGENT_SENT_MAX ids, dropping the oldest', async () => {
    const { recordAgentSent, wasAgentSent, AGENT_SENT_MAX } = await import(
      './src/agent/agent-sent'
    )
    const t0 = 1_800_000_000_000
    for (let i = 1; i <= AGENT_SENT_MAX + 1; i++) {
      recordAgentSent(OWNER, '504608015', i, t0 + i)
    }
    expect(wasAgentSent(OWNER, '504608015', 1, t0 + AGENT_SENT_MAX + 2)).toBe(
      false
    )
    expect(
      wasAgentSent(
        OWNER,
        '504608015',
        AGENT_SENT_MAX + 1,
        t0 + AGENT_SENT_MAX + 2
      )
    ).toBe(true)
  })
})

describe('handleCrmAgentSent', () => {
  it('answers agent:true only for a remembered send of the verified owner', async () => {
    const { recordAgentSent } = await import('./src/agent/agent-sent')
    const { handleCrmAgentSent } = await import('./src/agent/routes')
    recordAgentSent(OWNER, '504608015', 4242)

    const yes = res()
    await handleCrmAgentSent(
      req({ lead: '504608015', msg_id: 4242 }),
      yes as never,
      OWNER
    )
    expect(yes.out.code).toBe(200)
    expect(yes.out.body).toEqual({ ok: true, agent: true })

    const other = res()
    await handleCrmAgentSent(
      req({ lead: '504608015', msg_id: 4242 }),
      other as never,
      '1'
    )
    expect(other.out.body).toEqual({ ok: true, agent: false })

    const no = res()
    await handleCrmAgentSent(
      req({ lead: '504608015', msg_id: 7 }),
      no as never,
      OWNER
    )
    expect(no.out.body).toEqual({ ok: true, agent: false })
  })

  it('rejects a bad lead, a bad msg_id and a non-JSON body', async () => {
    const { handleCrmAgentSent } = await import('./src/agent/routes')
    for (const body of [
      { lead: 'abc', msg_id: 1 },
      { lead: '504608015', msg_id: 'x' },
      '{not json',
    ]) {
      const r = res()
      await handleCrmAgentSent(req(body), r as never, OWNER)
      expect(r.out.code).toBe(400)
    }
  })
})
