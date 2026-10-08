/**
 * Spec bot-menu-press.t27 (gHashTag/t27#7824), every test block run against
 * the bot's code in navigation/helpers/pressedMenu.ts, then the behaviour the
 * rules drive: a pressed menu loses its standard buttons, keeps the rest, and
 * the answer to the press never waits for that edit.
 */
import { describe, expect, it, vi } from 'vitest'
import * as SPEC from './bot-menu-press.gen'
import {
  dropPressedMenu,
  editsMarkup,
  keepsButton,
  leavePressedMenu,
  removesKeyboard,
  withoutMenu,
} from '@/navigation/helpers/pressedMenu'
import { ACTION_PREFIX } from '@/navigation/helpers/actionButtons'

const act = (id: string) => ({
  text: id,
  callback_data: `${ACTION_PREFIX}${id}`,
})
const payLink = { text: 'Pay 15', url: 'https://t.me/$invoice' }
const look = { text: 'Look 2', callback_data: 'look:2' }

/** A press on a message carrying `rows`, with an editable keyboard. */
const pressOn = (
  rows: any[][] | undefined,
  edit = vi.fn().mockResolvedValue(true)
) => ({
  callbackQuery: {
    message:
      rows === undefined ? {} : { reply_markup: { inline_keyboard: rows } },
  },
  editMessageReplyMarkup: edit,
})

describe('spec bot-menu-press.t27', () => {
  it('a pressed message keeps every button but the standard menu', () => {
    expect(keepsButton(false)).toBe(true)
    expect(keepsButton(true)).toBe(false)
  })

  it('the pressed message is edited only when a button was removed', () => {
    expect(editsMarkup(0)).toBe(false)
    expect(editsMarkup(1)).toBe(true)
    expect(editsMarkup(5)).toBe(true)
  })

  it('with no button left the keyboard is removed, not sent empty', () => {
    expect(removesKeyboard(0)).toBe(true)
    expect(removesKeyboard(1)).toBe(false)
    expect(removesKeyboard(3)).toBe(false)
  })

  it('the answer never waits for the old menu to go', async () => {
    expect(SPEC.ANSWER_WAITS_FOR_EDIT).toBe(false)
    // An edit that never settles must not hold the handler: leavePressedMenu
    // returns at once, so the answer after it goes out.
    const hanging = vi.fn(() => new Promise(() => undefined))
    expect(
      leavePressedMenu(pressOn([[act('balance')]], hanging))
    ).toBeUndefined()
    expect(hanging).toHaveBeenCalledTimes(1)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})

describe('a pressed menu leaves, everything else stays', () => {
  it('drops the act: buttons and keeps a pay link and a look, row by row', async () => {
    const ctx = pressOn([
      [payLink],
      [act('balance'), act('can')],
      [look, act('human')],
    ])
    expect(await dropPressedMenu(ctx)).toBe(true)
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith({
      inline_keyboard: [[payLink], [look]],
    })
  })

  it('removes the keyboard outright when only the menu was there', async () => {
    const ctx = pressOn([
      [act('topup')],
      [act('balance'), act('can')],
      [act('human')],
    ])
    expect(await dropPressedMenu(ctx)).toBe(true)
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith(undefined)
  })

  it('does not edit a message whose keyboard has no menu button', async () => {
    const ctx = pressOn([[payLink], [look]])
    expect(await dropPressedMenu(ctx)).toBe(false)
    expect(ctx.editMessageReplyMarkup).not.toHaveBeenCalled()
  })

  it('does nothing for a pressed message without a keyboard', async () => {
    const ctx = pressOn(undefined)
    expect(await dropPressedMenu(ctx)).toBe(false)
    expect(ctx.editMessageReplyMarkup).not.toHaveBeenCalled()
  })

  it('a refused edit (too old, already changed) never throws', async () => {
    const refused = vi
      .fn()
      .mockRejectedValue(new Error('message is not modified'))
    const ctx = pressOn([[act('can')]], refused)
    await expect(dropPressedMenu(ctx)).resolves.toBe(false)
  })

  it('counts what it removed and what it kept', () => {
    expect(withoutMenu([[payLink, act('topup')], [act('can')]])).toEqual({
      rows: [[payLink]],
      removed: 2,
      kept: 1,
    })
  })
})
