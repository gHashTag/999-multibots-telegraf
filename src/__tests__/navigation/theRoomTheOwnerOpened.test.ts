import { describe, expect, it } from 'vitest'
import { isAddressedToUs } from '@/navigation/helpers/groupAddressing'
import {
  conciergeChats,
  isConciergeChat,
} from '@/navigation/helpers/groupConcierge'

/*
 * ONE ROOM WHERE THE AGENT WORKS WITH PEOPLE, NOT ONLY WHEN NAMED.
 *
 * Owner, 2026-09-24: "why is the bot not talking to her in the chat -- I want
 * the agent to start helping her there". It was not broken: it was obeying his
 * own rule from 2026-09-20, which exists because five paying clients share a
 * group with him and an answer nobody asked for lands in front of all five.
 *
 * So the exception is PER ROOM and never a default.
 */
const GROUP = '-1009000000042'
const env = (v?: string) =>
  ({ ...(v === undefined ? {} : { GROUP_CONCIERGE_CHATS: v }) }) as never

const ctx = (over: Record<string, unknown> = {}) =>
  ({
    chat: { id: Number(GROUP), type: 'supergroup' },
    botInfo: { id: 5, username: 'test_bot' },
    message: { text: 'просто разговор' },
    ...over,
  }) as never

describe('the room the owner opened', () => {
  it('reads the ids out of the list, commas or spaces', () => {
    expect([...conciergeChats(env(`${GROUP}, -1009000000043`))]).toEqual([
      GROUP,
      '-1009000000043',
    ])
    expect([...conciergeChats(env(`${GROUP} -1009000000043`))]).toHaveLength(2)
  })

  it('ignores anything that is not an id, so a typo opens no room', () => {
    expect([...conciergeChats(env('@some_group, hello, 12'))]).toEqual([])
    expect(isConciergeChat('not-an-id', env(GROUP))).toBe(false)
  })

  it('is off when nobody set the list -- never a default', () => {
    expect(isConciergeChat(GROUP, env())).toBe(false)
    expect(isConciergeChat(GROUP, env(''))).toBe(false)
  })

  it('a private chat is never one of these rooms', () => {
    // One person writing to the bot alone is addressing it by definition;
    // two answers to one question is the only thing this could add.
    expect(isConciergeChat('144022504', env('144022504'))).toBe(false)
  })

  it('an ordinary message in that room IS addressed to us', () => {
    const before = { ...process.env }
    try {
      delete process.env.GROUP_CONCIERGE_CHATS
      expect(isAddressedToUs(ctx()), 'the rule must hold by default').toBe(
        false
      )
      process.env.GROUP_CONCIERGE_CHATS = GROUP
      expect(isAddressedToUs(ctx())).toBe(true)
    } finally {
      process.env = before as never
    }
  })

  it('and every other room keeps the rule of 2026-09-20', () => {
    const before = { ...process.env }
    try {
      process.env.GROUP_CONCIERGE_CHATS = GROUP
      const other = ctx({ chat: { id: -1009000000099, type: 'supergroup' } })
      expect(isAddressedToUs(other)).toBe(false)
      // Named, and it answers -- in any room, as before.
      expect(
        isAddressedToUs(
          ctx({
            chat: { id: -1009000000099, type: 'supergroup' },
            message: { text: 'привет @test_bot' },
          })
        )
      ).toBe(true)
    } finally {
      process.env = before as never
    }
  })
})
