/**
 * WHAT WE KNOW ABOUT A ROOM, AND WHAT WE REFUSE TO GUESS.
 *
 * The morning post may say only what we KNOW -- the rule its own module
 * carries, and the one it broke until it was read (form 184). This is the
 * source that feeds it, so the guards are about the ABSENCES:
 *
 *   - `connected` and `last_message_at` have no source at all today, and are
 *     named as unknown rather than left to be inferred from their absence;
 *   - a profile lookup that FAILS must not look like a room where nobody has
 *     a profile. An empty set means both, so the two are told apart by
 *     whether the query ran -- and on a failure the field is left out
 *     entirely, which makes the post silent instead of wrong.
 */
import { describe, it, expect, vi } from 'vitest'

const withClient = vi.fn()
vi.mock('./telegram-tools', () => ({
  requireSeller: vi.fn(async () => undefined),
  withClient: (ctx: unknown, fn: (c: unknown) => unknown) =>
    withClient(ctx, fn),
}))
vi.mock('./tg-proposals', () => ({
  resolvingPeer: (_c: unknown, _t: unknown, fn: () => unknown) => fn(),
}))

import { ROOM_PEOPLE_TOOLS, profilesKnown, PROFILES_SQL } from './room-people'

const members = [
  { id: { toString: () => '900000061' }, firstName: 'Первый' },
  { id: { toString: () => '900000062' }, firstName: 'Второй' },
  { id: { toString: () => '900000063' }, firstName: 'Бот', bot: true },
]

const run = async (pool: any) => {
  withClient.mockImplementation(async (_ctx: unknown, fn: any) =>
    fn({ getParticipants: async () => members })
  )
  return (await ROOM_PEOPLE_TOOLS[0]!.handler({ chat: '-900000099' }, {
    telegramId: '900000001',
    pool,
  } as never)) as any
}

const poolWith = (rows: any[]) => ({
  async query() {
    return { rows }
  },
})
const angryPool = {
  async query() {
    throw new Error('relation "crm_client_profiles" does not exist')
  },
}

describe('who is in the room', () => {
  it('lists the people and leaves the bots out', async () => {
    const r = await run(poolWith([{ telegram_id: '900000061' }]))
    expect(r.people.map((p: any) => p.id)).toEqual(['900000061', '900000062'])
  })

  it('answers has_profile both ways when the lookup ran', async () => {
    const r = await run(poolWith([{ telegram_id: '900000061' }]))
    expect(r.people[0].has_profile).toBe(true)
    expect(r.people[1].has_profile).toBe(false)
  })

  it('THE GUARD: a broken lookup leaves the field OUT, never false', async () => {
    const r = await run(angryPool)
    for (const p of r.people) expect('has_profile' in p).toBe(false)
    expect(String(r.note)).toContain('has_profile')
  })

  it('names the fields nobody can answer, instead of implying them', async () => {
    const r = await run(poolWith([]))
    expect(r.unknown_fields).toContain('connected')
    expect(r.unknown_fields).toContain('last_message_at')
    for (const p of r.people) {
      expect('connected' in p).toBe(false)
      expect('last_message_at' in p).toBe(false)
    }
  })

  it('the lookup asks about this owner and these ids only', async () => {
    expect(PROFILES_SQL).toContain('owner_id = $1')
    expect(PROFILES_SQL).toContain('telegram_id = ANY($2::text[])')
    const asked: any[] = []
    await profilesKnown(
      {
        async query(_q: string, p: any) {
          asked.push(p)
          return { rows: [] }
        },
      },
      '900000001',
      ['900000061']
    )
    expect(asked[0]).toEqual(['900000001', ['900000061']])
  })

  it('no ids, no query', async () => {
    let ran = false
    await profilesKnown(
      {
        async query() {
          ran = true
          return { rows: [] }
        },
      },
      '900000001',
      []
    )
    expect(ran).toBe(false)
  })
})
