import { describe, it, expect } from '@jest/globals'
import { createHelpCancelKeyboard } from '@/menu/createHelpCancelKeyboard'
import { cancelHelpArray } from '@/menu/cancelHelpArray'

describe('createHelpCancelKeyboard', () => {
  it('creates keyboard markup matching cancelHelpArray for Russian', () => {
    const markup = createHelpCancelKeyboard(true)
    // @ts-ignore
    expect(markup.reply_markup.keyboard).toEqual(cancelHelpArray(true))
  })

  it('creates keyboard markup matching cancelHelpArray for English', () => {
    const markup = createHelpCancelKeyboard(false)
    // @ts-ignore
    expect(markup.reply_markup.keyboard).toEqual(cancelHelpArray(false))
  })
})