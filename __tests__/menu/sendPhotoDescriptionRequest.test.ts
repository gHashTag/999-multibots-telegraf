import makeMockContext from '../utils/mockTelegrafContext'

// Mock createHelpCancelKeyboard
jest.mock('@/menu', () => ({
  createHelpCancelKeyboard: (isRu: boolean) => ({ reply_markup: { keyboard: isRu ? [['A']] : [['B']] } }),
}))
import { sendPhotoDescriptionRequest } from '@/menu/sendPhotoDescriptionRequest'
import { createHelpCancelKeyboard } from '@/menu'

describe('sendPhotoDescriptionRequest', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.reply = jest.fn(() => Promise.resolve()) as any
  })

  it('sends Russian prompt for neuro_photo mode', async () => {
    await sendPhotoDescriptionRequest(ctx as any, true, 'neuro_photo')
    expect(ctx.reply).toHaveBeenCalledWith(
      '📸 Опишите на английском, какую нейрофотографию вы хотите сгенерировать.',
      { reply_markup: { keyboard: [['A']] } }
    )
  })

  it('sends Russian prompt for other mode', async () => {
    await sendPhotoDescriptionRequest(ctx as any, true, 'text_to_image')
    expect(ctx.reply).toHaveBeenCalledWith(
      '📸 Опишите на английском, какую фотографию вы хотите сгенерировать.',
      { reply_markup: { keyboard: [['A']] } }
    )
  })

  it('sends English prompt for neuro_photo mode', async () => {
    await sendPhotoDescriptionRequest(ctx as any, false, 'neuro_photo')
    expect(ctx.reply).toHaveBeenCalledWith(
      '📸 Describe what kind of нейрофотографию you want to generate in English.',
      { reply_markup: { keyboard: [['B']] } }
    )
  })

  it('sends English prompt for other mode', async () => {
    await sendPhotoDescriptionRequest(ctx as any, false, 'other')
    expect(ctx.reply).toHaveBeenCalledWith(
      '📸 Describe what kind of фотографию you want to generate in English.',
      { reply_markup: { keyboard: [['B']] } }
    )
  })
})