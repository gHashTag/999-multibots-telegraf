import { jest, describe, beforeEach, it, expect } from '@jest/globals'
// Мокаем внешние зависимости до импортов
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/handlers/handleHelpCancel', () => ({ handleHelpCancel: jest.fn() }))
jest.mock('@/price/helpers', () => ({ validateAndCalculateImageModelPrice: jest.fn(), sendBalanceMessage: jest.fn() }))
jest.mock('@/services/generateTextToImage', () => ({ generateTextToImage: jest.fn() }))
jest.mock('@/core/supabase', () => ({ getUserBalance: jest.fn() }))

import { textToImageWizard } from '@/scenes/textToImageWizard'
import makeMockContext from '../utils/mockTelegrafContext'
import { isRussian } from '@/helpers/language'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { validateAndCalculateImageModelPrice, sendBalanceMessage } from '@/price/helpers'
import { generateTextToImage } from '@/services/generateTextToImage'
import { getUserBalance } from '@/core/supabase'

describe('textToImageWizard steps', () => {
  let ctx
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.from = { id: 1, language_code: 'ru' }
    ctx.botInfo = { username: 'bot' }
    // Stub handlers
    ;(isRussian as jest.Mock).mockReturnValue(true)
  })

  it('step 0: leaves when no user ID', async () => {
    ctx.from = undefined
    // @ts-ignore
    const step0 = textToImageWizard.steps[0]
    await step0(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 0: prompts and advances', async () => {
    // @ts-ignore
    const step0 = textToImageWizard.steps[0]
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎨 Выберите модель для генерации:',
      expect.objectContaining({ reply_markup: expect.any(Object) })
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 2: invalid prompt leaves', async () => {
    // skip step1, set selectedModel
    ctx.session = { selectedModel: 'm1' }
    ctx.message = {} as any
    // @ts-ignore
    const step2 = textToImageWizard.steps[2]
    await step2(ctx)
    expect(ctx.reply).toHaveBeenCalledWith('❌ Некорректный промпт')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 2: valid prompt generates image and leaves', async () => {
    ctx.session = { selectedModel: 'm1' }
    ctx.message = { text: 'hello' } as any
    ;(generateTextToImage as jest.Mock).mockResolvedValue(undefined)
    // @ts-ignore
    const step2 = textToImageWizard.steps[2]
    await step2(ctx)
    expect(generateTextToImage).toHaveBeenCalledWith(
      'hello',
      'm1',
      1,
      '1',
      true,
      ctx,
      'bot'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})