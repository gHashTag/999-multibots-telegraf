import { getStepSelectionMenuV2 } from '@/menu/getStepSelectionMenuV2'

describe('getStepSelectionMenuV2', () => {
  it('builds Russian keyboard correctly', () => {
    const markup = getStepSelectionMenuV2(true)
    // @ts-ignore
    const kb = markup.reply_markup.keyboard
    expect(kb).toHaveLength(4)
    // First row
    expect(kb[0].map((b: any) => b.text)).toEqual([
      '100 шагов',
      '200 шагов',
      '300 шагов',
    ])
    // Third row
    expect(kb[2].map((b: any) => b.text)).toEqual([
      '700 шагов',
      '800 шагов',
      '1000 шагов',
    ])
    // Last row
    expect(kb[3].map((b: any) => b.text)).toEqual([
      'Справка по команде',
      'Отмена',
    ])
  })

  it('builds English keyboard correctly', () => {
    const markup = getStepSelectionMenuV2(false)
    // @ts-ignore
    const kb = markup.reply_markup.keyboard
    expect(kb).toHaveLength(4)
    expect(kb[0].map((b: any) => b.text)).toEqual([
      '100 steps',
      '200 steps',
      '300 steps',
    ])
    expect(kb[2].map((b: any) => b.text)).toEqual([
      '700 steps',
      '800 steps',
      '1000 steps',
    ])
    expect(kb[3].map((b: any) => b.text)).toEqual([
      'Help for the command',
      'Cancel',
    ])
  })
})
