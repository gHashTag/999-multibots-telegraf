/**
 * A ROW THAT IS ALWAYS THERE CARRIES NO INFORMATION.
 *
 * Owner, 24.09.2026: "make the agent show buttons ON THE SUBSTANCE, not in
 * every message -- look at how our browser does it and do the same."
 *
 * The browser's rule, borrowed exactly: permission is asked BY PLACE, not
 * because an action happened (browser/guard.ts). Buttons were the opposite --
 * four of them under every answer because an answer had happened -- so the
 * one time top-up mattered it looked like the hundred times it did not.
 *
 * Two things did NOT change, because both were already by substance: the pay
 * row under an answer carrying an invoice link, and the buttons the agent
 * proposed itself. They cover the ordinary case, which is what makes it safe
 * to drop the blanket set.
 */
import { describe, it, expect } from 'vitest'
import {
  earnedButtons,
  buttonsForAnswer,
} from '@/navigation/helpers/actionButtons'

const ids = (rows: any[][]) =>
  rows.flat().map(b => b.callback_data ?? (b.web_app ? 'web_app' : 'url'))

describe('buttons follow the substance', () => {
  it('a plain answer earns nothing at all', () => {
    expect(earnedButtons('Готово, держи.', true)).toEqual([])
  })

  it('THE POINT: nothing earned means no keyboard, not an empty one', () => {
    // Telegram refuses an inline keyboard with no buttons: an empty one would
    // fail the send rather than send a bare line.
    expect(buttonsForAnswer('Готово, держи.', true).markup).toBeUndefined()
  })

  it('money talk earns top-up; balance talk earns balance', () => {
    expect(
      ids(earnedButtons('Не хватает токенов.', true, { app: false }))
    ).toEqual(['act:topup'])
    expect(
      ids(earnedButtons('На балансе 40 токенов.', true, { app: false }))
    ).toContain('act:balance')
  })

  it('a refusal earns a person to ask, and what-can-I-do', () => {
    const got = ids(
      earnedButtons('Я не могу это сделать.', true, { app: false })
    )
    expect(got).toContain('act:human')
    expect(got).toContain('act:can')
    expect(got).not.toContain('act:topup')
  })

  it('the app button needs the app AND a private chat', () => {
    const line = 'Готово, посмотри в приложении.'
    expect(ids(earnedButtons(line, true))).toContain('web_app')
    // A group rejects web_app and loses the whole message with it.
    expect(ids(earnedButtons(line, true, { app: false }))).not.toContain(
      'web_app'
    )
    // And no app talk, no app button, private or not.
    expect(ids(earnedButtons('Готово.', true))).not.toContain('web_app')
  })

  it('what was already by substance still works: the pay link and the agent', () => {
    const kb = buttonsForAnswer(
      'Счёт: https://t.me/$abc [[Пополнить|act:topup]]',
      true,
      { app: false }
    )
    const got = ids(kb.markup!.reply_markup.inline_keyboard)
    expect(got[0]).toBe('url')
    expect(got).toContain('act:topup')
  })

  it("the owner's hub still rides under his own answers", () => {
    const tail = [[{ text: 'Улей', callback_data: 'hive' }]] as any
    const kb = buttonsForAnswer('Готово.', true, { app: false, tail })
    expect(ids(kb.markup!.reply_markup.inline_keyboard)).toEqual(['hive'])
  })
})
