/**
 * IN A ROOM WITH OTHER PEOPLE, THE BOT SPEAKS ONLY WHEN SPOKEN TO.
 *
 * Owner, 2026-09-20: five VIP clients share one Telegram group with him, and
 * @t27ai_bot is in it. He turned privacy mode OFF in BotFather -- which is
 * what a concierge needs, and which also handed the agent fallback every
 * message in that room, because it had no chat-type gate at all.
 *
 * That is not noise, it is a liability: the agent quotes prices, describes
 * what the platform can do, and holds a conversation. Five paying people read
 * each other there.
 *
 * Ids below are invented (9000000xx). No real person appears in this
 * repository.
 */
import { describe, it, expect } from 'vitest'
import { isAddressedToUs } from '@/navigation/helpers/groupAddressing'

const BOT = { id: 8527452024, username: 't27ai_bot' }

const inGroup = (message: Record<string, unknown>) =>
  ({
    chat: { id: -5350275033, type: 'group' },
    botInfo: BOT,
    message,
  }) as never

const inPrivate = (text: string) =>
  ({
    chat: { id: 900000301, type: 'private' },
    botInfo: BOT,
    message: { text },
  }) as never

describe('when the bot may answer in a group', () => {
  /*
   * THE CASE THE GATE EXISTS FOR. Two clients talking to each other is the
   * ordinary content of that room, and the bot answering it is the failure.
   */
  it('stays out of a conversation between clients', () => {
    expect(isAddressedToUs(inGroup({ text: 'привет, как прошёл эфир?' }))).toBe(
      false
    ) // cyrillic-ok: fixture
    expect(isAddressedToUs(inGroup({ text: 'а сколько это стоит?' }))).toBe(
      false
    ) // cyrillic-ok: fixture
    expect(isAddressedToUs(inGroup({ photo: [{ file_id: 'x' }] }))).toBe(false)
    expect(isAddressedToUs(inGroup({ voice: { file_id: 'x' } }))).toBe(false)
  })

  it('answers when it is named', () => {
    expect(isAddressedToUs(inGroup({ text: '@t27ai_bot сделай рилс' }))).toBe(
      true
    ) // cyrillic-ok: fixture
    expect(
      isAddressedToUs(inGroup({ text: 'спроси @T27AI_BOT про цену' }))
    ).toBe(true) // cyrillic-ok: fixture
    expect(isAddressedToUs(inGroup({ caption: 'вот файл @t27ai_bot' }))).toBe(
      true
    ) // cyrillic-ok: fixture
  })

  /*
   * A NEAR-MISS NAME IS NOT THE NAME. `@t27ai_bot_old` shares a prefix and is
   * somebody else entirely.
   */
  it('is not fooled by a name that merely starts the same', () => {
    expect(isAddressedToUs(inGroup({ text: '@t27ai_bot_old умер' }))).toBe(
      false
    ) // cyrillic-ok: fixture
  })

  it('answers a reply to its own message, and not to another bot', () => {
    expect(
      isAddressedToUs(
        inGroup({
          text: 'да',
          reply_to_message: { from: { id: BOT.id, is_bot: true } },
        }) // cyrillic-ok: fixture
      )
    ).toBe(true)
    expect(
      isAddressedToUs(
        inGroup({
          text: 'да',
          reply_to_message: { from: { id: 777, is_bot: true } },
        }) // cyrillic-ok: fixture
      )
    ).toBe(false)
    expect(
      isAddressedToUs(
        inGroup({
          text: 'да',
          reply_to_message: { from: { id: 900000302, is_bot: false } },
        }) // cyrillic-ok: fixture
      )
    ).toBe(false)
  })

  /*
   * A COMMAND ADDRESSED TO ANOTHER BOT IS THAT BOT'S BUSINESS. Telegram shows
   * it to everyone in the room; answering it is the same interruption.
   */
  it('takes its own commands and leaves another bot its own', () => {
    expect(isAddressedToUs(inGroup({ text: '/help' }))).toBe(true)
    expect(isAddressedToUs(inGroup({ text: '/help@t27ai_bot' }))).toBe(true)
    expect(isAddressedToUs(inGroup({ text: '/help@other_bot' }))).toBe(false)
  })

  /*
   * A PRIVATE CHAT IS NOT A ROOM. One person writing to the bot alone is
   * addressing it by definition, and the gate must not change that path.
   */
  it('changes nothing in a private chat', () => {
    expect(isAddressedToUs(inPrivate('привет'))).toBe(true) // cyrillic-ok: fixture
    expect(isAddressedToUs(inPrivate('сделай видео'))).toBe(true) // cyrillic-ok: fixture
  })

  /*
   * A BOT THAT DOES NOT KNOW ITS OWN NAME MUST NOT GUESS. Without botInfo
   * every mention test is unanswerable, and the safe direction in a room full
   * of clients is silence.
   */
  it('stays silent when it does not know its own name', () => {
    const noName = {
      chat: { id: -5350275033, type: 'group' },
      botInfo: undefined,
      message: { text: '@t27ai_bot сделай' }, // cyrillic-ok: fixture
    } as never
    expect(isAddressedToUs(noName)).toBe(false)
  })
})
