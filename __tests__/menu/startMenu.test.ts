import makeMockContext from '../utils/mockTelegrafContext'
import { startMenu } from '@/menu/startMenu'
import { levels } from '@/menu/mainMenu'

describe('startMenu', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    ctx = makeMockContext()
    ctx.reply = jest.fn(() => Promise.resolve()) as any
  })

  it('replies with Russian text and keyboard', async () => {
    await startMenu(ctx as any, true)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Выберите действие в меню:',
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          keyboard: [[{ text: levels[104].title_ru }]]
        })
      })
    )
  })

  it('replies with English text and keyboard', async () => {
    await startMenu(ctx as any, false)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Choose an action in the menu:',
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          keyboard: [[{ text: levels[104].title_en }]]
        })
      })
    )
  })
})