// import { createHelpCancelKeyboard } from '@/menu/createHelpCancelKeyboard'
import { createHelpCancelKeyboard } from '@/menu'
import { cancelHelpArray } from '@/menu/cancelHelpArray'
import { Markup } from 'telegraf'

describe('createHelpCancelKeyboard', () => {
  it('should return Russian keyboard when isRu is true', () => {
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
