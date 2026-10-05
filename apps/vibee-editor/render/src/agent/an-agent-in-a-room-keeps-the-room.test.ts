import { describe, expect, it } from 'vitest'
import { historyGate, threadFor } from './routes'
import { marketplaceAgentThread, roomThread } from './conversation'

/**
 * An agent's own bot answering in the hive group (spec agent-hive-group.t27,
 * host src/core/bot/agentHive in the bot). Before this, `agent` with `room`
 * dropped the room: a group turn went into the agent's private thread with
 * the asker, and that thread was then read out in front of the group.
 */
const OWNER = '900000001'
// A basic group's id is -<id>: the invented range, signed.
const ROOM = '-900000002'
const getPool = () => ({ query: async () => ({ rows: [] }) })

describe('an agent called in a room', () => {
  it('keeps the room memory and brings its persona', async () => {
    const g: any = await threadFor(undefined, OWNER, getPool, 'blogger', ROOM)
    expect(g).toMatchObject({
      ok: true,
      thread: roomThread(ROOM),
      client: null,
      agent: 'blogger',
      room: ROOM,
    })
  })

  it('still answers in its own thread without a room', async () => {
    const g: any = await threadFor(undefined, OWNER, getPool, 'blogger')
    expect(g.thread).toBe(marketplaceAgentThread('blogger'))
    expect(g.room).toBeUndefined()
  })

  it('refuses a malformed room rather than falling back to the private thread', async () => {
    const g: any = await threadFor(undefined, OWNER, getPool, 'blogger', '42')
    expect(g).toMatchObject({ ok: false, status: 400 })
  })

  it('still gates the agent before the room', async () => {
    const g: any = await threadFor(undefined, OWNER, getPool, 'nobody', ROOM)
    expect(g).toMatchObject({ ok: false, code: 'agent_unavailable' })
  })

  it('reads its history from the room it writes to, not the private thread', async () => {
    const read = async (url: string) =>
      (await historyGate({ url } as any, OWNER, getPool)) as any
    expect(
      (await read(`/api/agent/history?agent=blogger&room=${ROOM}`)).thread
    ).toBe(roomThread(ROOM))
    expect((await read(`/api/agent/history?room=${ROOM}`)).thread).toBe(
      roomThread(ROOM)
    )
    expect((await read('/api/agent/history?agent=blogger')).thread).toBe(
      marketplaceAgentThread('blogger')
    )
  })
})
