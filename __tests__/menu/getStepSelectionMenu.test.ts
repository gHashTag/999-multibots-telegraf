import { describe, it, expect } from '@jest/globals'
import { getStepSelectionMenu } from '@/menu/getStepSelectionMenu'

describe('getStepSelectionMenu', () => {
  it('builds Russian keyboard correctly', () => {
    const markup = getStepSelectionMenu(true)
    // @ts-ignore
    const kb = markup.reply_markup.keyboard
    expect(kb).toHaveLength(4)
    // First row
    expect(kb[0].map((b: any) => b.text)).toEqual([
      '1000 шагов',
      '1500 шагов',
      '2000 шагов',
    ])
    // Last row
    expect(kb[3].map((b: any) => b.text)).toEqual([
      'Справка по команде',
      'Отмена',
    ])
  })

  it('builds English keyboard correctly', () => {
    const markup = getStepSelectionMenu(false)
    // @ts-ignore
    const kb = markup.reply_markup.keyboard
    expect(kb).toHaveLength(4)
    expect(kb[0].map((b: any) => b.text)).toEqual([
      '1000 steps',
      '1500 steps',
      '2000 steps',
    ])
    expect(kb[3].map((b: any) => b.text)).toEqual([
      'Help for the command',
      'Cancel',
    ])
  })
})