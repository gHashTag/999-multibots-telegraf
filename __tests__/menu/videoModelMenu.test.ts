import { videoModelKeyboard } from '@/menu/videoModelMenu'

describe('videoModelKeyboard', () => {
  it('builds keyboard with model names and control buttons in Russian', () => {
    const markup = videoModelKeyboard(true)
    // @ts-ignore
    const kb = markup.reply_markup.keyboard
    expect(kb).toHaveLength(3)
    expect(kb[0].map((b: any) => b.text)).toEqual(['Minimax', 'Haiper'])
    expect(kb[1].map((b: any) => b.text)).toEqual(['Ray', 'I2VGen-XL'])
    expect(kb[2].map((b: any) => b.text)).toEqual([
      'Справка по команде',
      'Отмена',
    ])
  })

  it('builds keyboard with model names and control buttons in English', () => {
    const markup = videoModelKeyboard(false)
    // @ts-ignore
    const kb = markup.reply_markup.keyboard
    expect(kb).toHaveLength(3)
    expect(kb[0].map((b: any) => b.text)).toEqual(['Minimax', 'Haiper'])
    expect(kb[1].map((b: any) => b.text)).toEqual(['Ray', 'I2VGen-XL'])
    expect(kb[2].map((b: any) => b.text)).toEqual([
      'Help for the command',
      'Cancel',
    ])
  })
})
