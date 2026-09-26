import { describe, expect, it } from 'vitest'
import {
  CLIENT_ID_RE,
  clientThread,
  ROOM_ID_RE,
  roomThread,
  SELF_THREAD,
} from './src/agent/conversation'
import { threadFor } from './src/agent/routes'

/**
 * A ROOM HAS ITS OWN MEMORY, AND THAT IS THE WHOLE POINT.
 *
 * Until this existed a turn in a group was keyed by the PERSON who wrote, so
 * an answer in a shared room was composed with that person's private
 * correspondence in context and written back into it. Issue #2644 put "do not
 * call the agent in the room" out of scope for exactly this reason, and named
 * the trap that made the obvious fix fail: a group id is NEGATIVE, and the
 * client pattern takes positive digits only.
 *
 * So the test that matters here is not that rooms work -- it is that a room
 * never becomes a person's thread by accident.
 */
const OWNER = '900000091'
const ROOM = '-1009000000042'
const pool = () => ({ query: async () => ({ rows: [] }) })

describe('a room has its own memory', () => {
  it('keys the thread by the chat, not by whoever wrote', async () => {
    const gate = await threadFor(null, OWNER, pool, undefined, ROOM)
    expect(gate).toMatchObject({ ok: true, thread: roomThread(ROOM) })
    expect((gate as { thread: string }).thread).not.toContain(OWNER)
    // And it is not the asker's own thread either.
    expect((gate as { thread: string }).thread).not.toBe(SELF_THREAD)
  })

  it('a group id is not a client id -- the trap #2644 wrote down', () => {
    /*
     * `dmLeadMenu` and the client thread both take positive digits. A group
     * starts with a minus, so reusing the client path would have refused the
     * room as "bad client" -- silently, in front of everybody.
     */
    expect(CLIENT_ID_RE.test(ROOM)).toBe(false)
    expect(ROOM_ID_RE.test(ROOM)).toBe(true)
    expect(ROOM_ID_RE.test('900000091')).toBe(false)
    expect(roomThread(ROOM)).not.toBe(clientThread('900000091'))
  })

  it('refuses anything that is not a room id', async () => {
    for (const bad of ['-12', 'room', '-abc', '900000091', '-']) {
      const gate = await threadFor(null, OWNER, pool, undefined, bad)
      expect(gate, bad).toMatchObject({ ok: false, status: 400 })
    }
  })

  it('needs no seller, because a room is a place and not somebody lead', async () => {
    /*
     * A client thread is gated on the caller being a seller: it is that
     * seller's lead. A room is not owned by anybody in it, and everyone who
     * can write there is already inside.
     */
    const gate = await threadFor(null, '900000052', pool, undefined, ROOM)
    expect(gate).toMatchObject({ ok: true })
  })

  it('leaves the ordinary threads exactly as they were', async () => {
    const self = await threadFor(null, OWNER, pool)
    expect(self).toMatchObject({ ok: true, thread: SELF_THREAD })
    /*
     * Client + agent was refused until 2026-09-26; the owner asked for
     * specialists in client chats. It is the CLIENT's thread, never a room.
     */
    /*
     * Client + agent was refused outright until 2026-09-26; the owner asked
     * for specialists in client chats. It still passes the seller gate
     * first -- this caller is no seller, so neither the client nor the agent
     * opens (agent-marketplace.test.ts holds the seller's case).
     */
    const bothAtOnce = await threadFor('900000051', OWNER, pool, 'blogger')
    expect(bothAtOnce).toEqual({
      ok: false,
      status: 403,
      error: 'not a seller',
    })
  })
})
