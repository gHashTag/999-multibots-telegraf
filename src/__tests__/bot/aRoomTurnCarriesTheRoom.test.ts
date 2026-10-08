import { describe, expect, it } from 'vitest'

/*
 * A TURN IN A ROOM CARRIES THE ROOM, OR IT CARRIES SOMEBODY'S DMs.
 *
 * Issue #2644 kept the agent out of group chats, and the reason was not
 * caution: `спроситьАгента` is keyed by the PERSON, so an answer in a shared
 * room was composed with that person's private correspondence in context and
 * the turn was written back into their personal history. In a room with five
 * people that is their DMs read out in front of four of them.
 *
 * The key exists now (`room`), and this pins the two halves that make it
 * work: the bot sends it in a group, and it is a group id rather than a
 * person's.
 */
describe('a turn in a room carries the room', () => {
  const source = async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    return readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
  }

  it('the group chat id travels with the turn', async () => {
    const src = await source()
    const at = src.indexOf('const inRoom =')
    expect(at, 'nothing computes the room').toBeGreaterThan(-1)
    // To the end of the agent call, not a character count: the comment on
    // which conversation a private turn joins (bot-agent-memory.t27) sits
    // between the two.
    const call = src.indexOf('спроситьАгента(', at) // cyrillic-ok: pre-existing identifier
    const body = src.slice(at, src.indexOf('})\n', call))
    expect(body).toContain("'supergroup'")
    expect(body).toContain('room: inRoom')
  })

  it('a private chat sends no room at all', async () => {
    /*
     * One person writing to the bot alone already has their own thread, and
     * a room key there would split their memory in two for no reason.
     */
    const src = await source()
    const at = src.indexOf('const inRoom =')
    // The body runs to the end of the agent call (`})` closing a line, not
    // the `{})` of a spread), not to a character count: #3544 put the
    // topic's conversation between the two, and a 400-character window lost
    // the spread at 405.
    const call = src.indexOf('спроситьАгента(', at) // cyrillic-ok: pre-existing identifier
    expect(call, 'the room is not computed for the agent call').toBeGreaterThan(
      at
    )
    const body = src.slice(at, src.indexOf('})\n', call))
    // The ternary yields an empty string outside a group, and the spread
    // below is guarded by it.
    expect(body).toMatch(/\?\s*String\(ctx\.chat\.id\)\s*:\s*''/)
    expect(body).toContain('...(inRoom ? { room: inRoom } : {})')
  })

  it('the wire only accepts a negative id, so a person can never be a room', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const agent = readFileSync(
      join(__dirname, '../../services/trinityAgent.ts'),
      'utf8'
    )
    // The pattern lives in one constant and the room is read only through it.
    expect(agent).toMatch(/^const ROOM_RE = \/\^-\\d\{5,20\}\$\/$/m)
    expect(agent).toContain(
      'opts.room && ROOM_RE.test(opts.room) ? opts.room : undefined'
    )
  })
})
