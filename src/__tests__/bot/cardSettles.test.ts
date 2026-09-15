import { describe, it, expect } from 'vitest'
import { settledKeyboard } from '@/navigation/helpers/crmMenu'

/**
 * WHAT A SPENT CARD LOOKS LIKE.
 *
 * Until 2026-09-15 a press removed the whole keyboard, so an evening's worth
 * of cards in the owner's DM were indistinguishable: text, no buttons, no way
 * to tell what went out from what he killed. Worse, it took away the card's
 * own "История" row -- the only path from a twelve-hour-old draft back to the
 * person, since the map the follow-up keyboard is built from expires in
 * fifteen minutes.
 *
 * These cases pin the redraw. The safety half -- that it happens on the press
 * and before the send, and that a refused redraw still clears the keyboard --
 * lives in nothingSendsWithoutAPress.test.ts, where the rest of that rule is.
 */
const card = (id = 'c1') => ({
  inline_keyboard: [
    [
      { text: '✅ Отправить', callback_data: `tgp:ok:${id}:s3cret` },
      { text: '✖️ Отмена', callback_data: `tgp:no:${id}:s3cret` },
    ],
    [{ text: '👤 История', callback_data: 'crm:lead:900000001' }],
  ],
})

describe('the card after the press', () => {
  it('replaces its own row with one disabled button carrying the verdict', () => {
    const rows = settledKeyboard(card(), '✅ Отправлено')!
    expect(rows[0]).toHaveLength(1)
    const spent = rows[0][0] as Record<string, unknown>
    expect(spent.text).toBe('✅ Отправлено')
    expect(spent.disabled).toEqual({})
  })

  it('keeps every other row exactly as it was', () => {
    // This is the half that was silently lost before: the history row went
    // with the rest of the keyboard, and nothing led back to the person.
    const rows = settledKeyboard(card(), '✖️ Отменено')!
    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual([
      { text: '👤 История', callback_data: 'crm:lead:900000001' },
    ])
  })

  it('names exactly one type, or Telegram refuses the redraw on every press', () => {
    /*
     * The reference on InlineKeyboardButton: "exactly one of the fields other
     * than text, icon_custom_emoji_id and style must be used to specify the
     * type of the button". `disabled` is one of those type fields, so a
     * verdict that also carried callback_data would be refused -- and because
     * the caller falls back to clearing the keyboard, the refusal would look
     * identical to the old behaviour and nobody would notice the feature was
     * dead. This is the case that would catch that.
     */
    const spent = settledKeyboard(card(), '✅ Отправлено')![0][0] as Record<
      string,
      unknown
    >
    const TYPES = [
      'callback_data',
      'url',
      'web_app',
      'login_url',
      'switch_inline_query',
      'switch_inline_query_current_chat',
      'switch_inline_query_chosen_chat',
      'copy_text',
      'callback_game',
      'pay',
    ]
    for (const f of TYPES)
      expect(spent[f], `${f} is set beside disabled`).toBeUndefined()
    expect(spent.disabled).toEqual({})
  })

  it('relabels a card that was already settled once', () => {
    // The press settles twice: a "sending" label before the send and the
    // verdict after it. The second pass must recognise its own work.
    const once = settledKeyboard(card(), '⏳ Отправляю…')!
    const twice = settledKeyboard({ inline_keyboard: once }, '✅ Отправлено')!
    expect(twice[0]).toHaveLength(1)
    expect((twice[0][0] as Record<string, unknown>).text).toBe('✅ Отправлено')
    expect(twice[1]).toEqual(once[1])
  })

  it('refuses a keyboard that holds nothing of ours, so the caller clears it', () => {
    // Null is not a detail: it routes the caller to the old behaviour. A
    // keyboard we do not recognise must never be redrawn half-understood.
    expect(
      settledKeyboard(
        { inline_keyboard: [[{ text: 'Меню', callback_data: 'crm:menu' }]] },
        '✅ Отправлено'
      )
    ).toBeNull()
    expect(settledKeyboard({ inline_keyboard: [] }, 'x')).toBeNull()
    expect(settledKeyboard(undefined, 'x')).toBeNull()
    expect(settledKeyboard(null, 'x')).toBeNull()
  })

  it('survives a row that is not an array', () => {
    const rows = settledKeyboard(
      { inline_keyboard: [null as never, card().inline_keyboard[0]] },
      '✅ Отправлено'
    )!
    expect(rows[rows.length - 1]).toHaveLength(1)
  })
})
