import makeMockContext from '../utils/mockTelegrafContext'
import { defaultSession } from '@/store'

// Mock price models to a small set
jest.mock('@/price/models', () => ({
  imageModelPrices: {
    modelText: { shortName: 'TextModel', inputType: ['text'] },
    modelDev: { shortName: 'DevModel', inputType: ['text', 'dev'] },
    modelImage: { shortName: 'ImageModel', inputType: ['text', 'image'] },
  },
}))

import { imageModelMenu } from '@/menu/imageModelMenu'

describe('imageModelMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('replies with Russian text and correct keyboard', async () => {
    const ctx = makeMockContext({
      message: {
        from: { id: 1, language_code: 'ru', is_bot: false, first_name: 'Test' },
      },
    } as any)
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn(() => Promise.resolve({} as any))

    await imageModelMenu(ctx as any)
    // Expect reply text
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎨 Выберите модель для генерации:',
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          keyboard: expect.any(Array),
        }),
      })
    )
    // Extract keyboard
    // @ts-ignore
    const kb = ctx.reply.mock.calls[0][1].reply_markup.keyboard
    // First row should contain TextModel and ImageModel only (DevModel filtered out)
    expect(kb[0].map((b: any) => b.text)).toEqual(['TextModel', 'ImageModel'])
    // Next row: Cancel/Help
    expect(kb[kb.length - 2].map((b: any) => b.text)).toEqual([
      'Отмена',
      'Справка по команде',
    ])
    // Last row: Main menu
    expect(kb[kb.length - 1].map((b: any) => b.text)).toEqual([
      '🏠 Главное меню',
    ])
  })

  it('replies with English text and correct keyboard', async () => {
    const ctx = makeMockContext({
      message: {
        from: { id: 2, language_code: 'en', is_bot: false, first_name: 'Test' },
      },
    } as any)
    ctx.session = { ...defaultSession }
    ctx.reply = jest.fn(() => Promise.resolve({} as any))

    await imageModelMenu(ctx as any)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎨 Choose a model for generation:',
      expect.objectContaining({
        reply_markup: expect.objectContaining({ keyboard: expect.any(Array) }),
      })
    )
    // @ts-ignore
    const kb = ctx.reply.mock.calls[0][1].reply_markup.keyboard
    // Buttons
    expect(kb[0].map((b: any) => b.text)).toEqual(['TextModel', 'ImageModel'])
    expect(kb[kb.length - 2].map((b: any) => b.text)).toEqual([
      'Cancel',
      'Help for the command',
    ])
    expect(kb[kb.length - 1].map((b: any) => b.text)).toEqual(['🏠 Main menu'])
  })
})
