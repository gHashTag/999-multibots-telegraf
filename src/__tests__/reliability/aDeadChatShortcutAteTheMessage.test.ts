/**
 * THE BRIEF MUST ARRIVE EVEN WHEN THE SHORTCUT UNDER IT CANNOT BE DRAWN.
 *
 * Production, verbatim:
 *
 *   Telegram API error: 400: Bad Request: BUTTON_USER_INVALID
 *   method sendMessage, bot neuro_blogger_bot, user 229866794
 *
 * `errorHandler.ts:147` is right to page for it -- a keyboard the server
 * refuses is our defect, not the customer's doing -- but the page was the only
 * outcome: the owner asked for a lead's brief, the brief was never sent, and
 * what arrived instead was an alert. The cause is the one decorative button
 * under it, `tg://user?id=N`, which Telegram will only render for a person the
 * BOT can resolve. A lead who writes to the owner's personal account has never
 * met the bot.
 *
 * This file drives the helper that retries such a send without those buttons,
 * and pins both edges of it: it must not fire for anything else, and if the
 * second attempt fails the error must still travel on and page.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { logger } from '@/utils/logger'
import {
  isUserLinkRejected,
  withoutUserLinks,
  keepingTheMessage,
} from '@/helpers/telegramUserLink'

/** A Telegraf error, shaped the way the library hands it to a catch block. */
const telegramError = (code: number, description: string) =>
  Object.assign(new Error(`${code}: Bad Request: ${description}`), {
    response: { error_code: code, description: `Bad Request: ${description}` },
  })

const REFUSED = () => telegramError(400, 'BUTTON_USER_INVALID')

/** The lead brief's keyboard, in the shape Markup.inlineKeyboard produces. */
const leadKeyboard = () => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: '✍️ Подготовить', callback_data: 'crm:prep:900000001' }],
      [
        { text: '💬 Открыть чат', url: 'tg://user?id=900000001' },
        { text: '🤫 Отвечу сам', callback_data: 'crm:mute:900000001' },
      ],
      [{ text: '🏠 Меню', callback_data: 'crm:menu' }],
    ],
  },
})

let warn: { mock: { calls: any[][] } }
let error: { mock: { calls: any[][] } }

beforeEach(() => {
  warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger as any)
  error = vi.spyOn(logger, 'error').mockImplementation(() => logger as any)
})

afterEach(() => vi.restoreAllMocks())

describe('reading the refusal', () => {
  it('knows the one description it is allowed to repair', () => {
    expect(isUserLinkRejected(REFUSED())).toBe(true)
  })

  it('does not claim broken markup of ours, which is also a 400', () => {
    // "can't parse entities" is a message WE built wrong. Retrying it without
    // a button changes nothing and would hide a real defect.
    expect(
      isUserLinkRejected(telegramError(400, "can't parse entities: ..."))
    ).toBe(false)
    expect(isUserLinkRejected(telegramError(403, 'bot was blocked'))).toBe(
      false
    )
    expect(isUserLinkRejected(new Error('ECONNRESET'))).toBe(false)
  })
})

describe('taking the shortcut out', () => {
  it('removes only the user link and leaves every other button standing', () => {
    const stripped = withoutUserLinks(leadKeyboard())!
    const rows = stripped.reply_markup.inline_keyboard
    const flat = rows.flat().map((b: any) => b.text)

    expect(flat, 'the dead shortcut survived').not.toContain('💬 Открыть чат')
    expect(flat).toEqual(['✍️ Подготовить', '🤫 Отвечу сам', '🏠 Меню'])
  })

  it('drops a row that the removal emptied', () => {
    // Telegram refuses a keyboard containing an empty row, so a retry that
    // left one would fail again for a brand new reason.
    const only = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💬', url: 'tg://user?id=1' }],
          [{ text: '🏠', callback_data: 'm' }],
        ],
      },
    }
    expect(withoutUserLinks(only)!.reply_markup.inline_keyboard).toEqual([
      [{ text: '🏠', callback_data: 'm' }],
    ])
  })

  it('says null when there is nothing to take out', () => {
    // The caller uses this to tell "retry this" from "nothing to retry", and
    // a link sitting in the TEXT is not something a keyboard edit can repair.
    expect(
      withoutUserLinks({
        reply_markup: {
          inline_keyboard: [[{ text: 'a', callback_data: 'b' }]],
        },
      })
    ).toBeNull()
    expect(withoutUserLinks(undefined)).toBeNull()
    expect(withoutUserLinks({ parse_mode: 'HTML' })).toBeNull()
  })

  it('leaves a t.me button alone', () => {
    // Only the user-link scheme is ours to remove; a public link that fails
    // is a different bug and must stay visible.
    const keep = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Канал', url: 'https://t.me/some_channel' }],
        ],
      },
    }
    expect(withoutUserLinks(keep)).toBeNull()
  })
})

describe('the send that survives it', () => {
  it('delivers the brief on the second try, without the shortcut', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(REFUSED())
      .mockResolvedValueOnce({ message_id: 7 })

    const sent = await keepingTheMessage(send, leadKeyboard(), {
      lead: '900000001',
    })

    expect(sent).toEqual({ message_id: 7 })
    expect(send).toHaveBeenCalledTimes(2)
    const retried = send.mock.calls[1][0]
    expect(
      retried.reply_markup.inline_keyboard.flat().map((b: any) => b.text)
    ).not.toContain('💬 Открыть чат')
    expect(error.mock.calls, 'a repaired send still paged the owner').toEqual(
      []
    )
  })

  it('records which lead could not be linked, without paging', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(REFUSED())
      .mockResolvedValueOnce(undefined)

    await keepingTheMessage(send, leadKeyboard(), { lead: '900000001' })

    expect(error.mock.calls, 'a drawn-over button woke the owner').toEqual([])
    const line = warn.mock.calls.find(c =>
      String(c[0]).includes('the chat shortcut could not be drawn')
    )
    expect(line, 'nothing recorded that a shortcut went missing').toBeTruthy()
    expect(line![1]).toMatchObject({ lead: '900000001' })
    expect(String(line![1].reason)).toContain('BUTTON_USER_INVALID')
  })

  it('sends exactly once when nothing is wrong', async () => {
    const send = vi.fn().mockResolvedValue({ message_id: 1 })

    await keepingTheMessage(send, leadKeyboard())

    expect(send).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls).toEqual([])
  })

  it('STILL throws when the retry fails too', async () => {
    // Second failure means the cause was not the button. The alert is then
    // the right outcome and must not be swallowed by the repair.
    const send = vi.fn().mockRejectedValue(REFUSED())

    await expect(keepingTheMessage(send, leadKeyboard())).rejects.toThrow(
      'BUTTON_USER_INVALID'
    )
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('STILL throws, without retrying, for anything that is ours', async () => {
    const send = vi
      .fn()
      .mockRejectedValue(telegramError(400, "can't parse entities"))

    await expect(keepingTheMessage(send, leadKeyboard())).rejects.toThrow(
      'parse entities'
    )
    expect(send, 'a defect of ours was quietly retried').toHaveBeenCalledTimes(
      1
    )
  })

  it('STILL throws when the refusal names a link it cannot reach', async () => {
    // The pointer is in the message text, not the keyboard: there is nothing
    // to strip, so the caller must not sit in a loop pretending otherwise.
    const send = vi.fn().mockRejectedValue(REFUSED())

    await expect(
      keepingTheMessage(send, { parse_mode: 'HTML' })
    ).rejects.toThrow('BUTTON_USER_INVALID')
    expect(send).toHaveBeenCalledTimes(1)
  })
})
