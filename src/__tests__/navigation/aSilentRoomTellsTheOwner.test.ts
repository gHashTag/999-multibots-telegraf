import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SILENT_ROOM_MAX_MEMBERS,
  forgetSilentRooms,
  silentRoomNoticeText,
  tellOwnersTheRoomIsSilent,
} from '@/navigation/helpers/silentRoomNotice'

/*
 * A CLIENT WRITING IN A ROOM THE BOT KEEPS SILENT IN IS TOLD TO THE OWNER.
 *
 * Owner, 2026-10-03: the VIP client wrote a full brief in a room with him and
 * the bot, the bot read it, said nothing, and told nobody -- for four days.
 * The silence rule stays; the silence is no longer invisible.
 */
const OWNER = 144
const ROOM = -5205915306

function fakeCtx(over: {
  members?: number
  from?: Record<string, unknown>
  status?: string
  type?: string
}) {
  const telegram = {
    getChatMembersCount: vi.fn(async () => over.members ?? 3),
    getChatMember: vi.fn(async () => ({ status: over.status ?? 'creator' })),
    sendMessage: vi.fn(async () => ({})),
  }
  const ctx = {
    chat: { id: ROOM, type: over.type ?? 'group', title: 'Leela Chakra Ai' },
    from: over.from ?? { id: 77, first_name: 'Geya', is_bot: false },
    message: { text: 'Нужен сценарий на 72 рилса' },
    telegram,
  }
  return { ctx: ctx as never, telegram }
}

describe('a silent room tells the owner', () => {
  beforeEach(() => forgetSilentRooms())

  it('tells the owner who is in the room, with the line that opens it', async () => {
    const { ctx, telegram } = fakeCtx({})
    await tellOwnersTheRoomIsSilent(ctx, [OWNER])
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1)
    const [to, text] = telegram.sendMessage.mock.calls[0] as unknown as [
      number,
      string,
    ]
    expect(to).toBe(OWNER)
    expect(text).toContain('Leela Chakra Ai')
    expect(text).toContain('Geya')
    expect(text).toContain('72 рилса')
    expect(text).toContain(String(ROOM))
  })

  it('says it once per room, not on every message', async () => {
    const { ctx, telegram } = fakeCtx({})
    await tellOwnersTheRoomIsSilent(ctx, [OWNER])
    await tellOwnersTheRoomIsSilent(ctx, [OWNER])
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('keeps the shared room of five clients quiet, as he decided', async () => {
    const { ctx, telegram } = fakeCtx({ members: SILENT_ROOM_MAX_MEMBERS + 1 })
    await tellOwnersTheRoomIsSilent(ctx, [OWNER])
    expect(telegram.sendMessage).not.toHaveBeenCalled()
  })

  it('does not report the owner talking in his own room', async () => {
    const { ctx, telegram } = fakeCtx({
      from: { id: OWNER, first_name: 'Dmitrii', is_bot: false },
    })
    await tellOwnersTheRoomIsSilent(ctx, [OWNER])
    expect(telegram.sendMessage).not.toHaveBeenCalled()
  })

  it('does not tell an admin who is not in that room', async () => {
    const { ctx, telegram } = fakeCtx({ status: 'left' })
    await tellOwnersTheRoomIsSilent(ctx, [OWNER])
    expect(telegram.sendMessage).not.toHaveBeenCalled()
  })

  it('ignores bots and private chats', async () => {
    const bot = fakeCtx({ from: { id: 9, is_bot: true } })
    await tellOwnersTheRoomIsSilent(bot.ctx, [OWNER])
    const dm = fakeCtx({ type: 'private' })
    await tellOwnersTheRoomIsSilent(dm.ctx, [OWNER])
    expect(bot.telegram.sendMessage).not.toHaveBeenCalled()
    expect(dm.telegram.getChatMembersCount).not.toHaveBeenCalled()
  })

  it('never throws into message handling', async () => {
    const { ctx, telegram } = fakeCtx({})
    telegram.getChatMembersCount.mockRejectedValueOnce(new Error('403'))
    await expect(
      tellOwnersTheRoomIsSilent(ctx, [OWNER])
    ).resolves.toBeUndefined()
  })

  it('cuts a long brief instead of flooding the owner', () => {
    const text = silentRoomNoticeText({
      room: 'R',
      chatId: '-1',
      who: 'G',
      said: 'a'.repeat(1000),
    })
    expect(text.length).toBeLessThan(700)
  })

  it('both silent branches report instead of dropping the message', () => {
    const src = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    expect(src).not.toMatch(/if \(!isAddressedToUs\(ctx\)\) return next\(\)/)
    expect(
      src.match(/void tellOwnersTheRoomIsSilent\(ctx, ADMIN_IDS_ARRAY\)/g)
    ).toHaveLength(2)
  })
})
