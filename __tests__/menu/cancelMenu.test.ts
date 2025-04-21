import { cancelMenu } from '@/menu/cancelMenu'

describe('cancelMenu', () => {
  it('creates keyboard with Cancel in English', () => {
    const markup = cancelMenu(false)
    // @ts-ignore
    expect(markup.reply_markup.keyboard).toEqual([[{ text: 'Cancel' }]])
  })

  it('creates keyboard with Отмена in Russian', () => {
    const markup = cancelMenu(true)
    // @ts-ignore
    expect(markup.reply_markup.keyboard).toEqual([[{ text: 'Отмена' }]])
  })
})
