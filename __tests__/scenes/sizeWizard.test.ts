import { jest, describe, beforeEach, it, expect } from '@jest/globals'
// Мокаем внешние зависимости до импортов
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/handlers', () => ({ handleSizeSelection: jest.fn() }))

import { sizeWizard } from '@/scenes/sizeWizard'
import makeMockContext from '../utils/mockTelegrafContext'
import { isRussian } from '@/helpers/language'
import { handleSizeSelection } from '@/handlers'

describe('sizeWizard steps', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.from = { id: 1, language_code: 'ru' }
  })

  it('step 0: prompts for image size and advances', async () => {
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    // @ts-ignore
    const step0 = sizeWizard.steps[0]
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Выберите размер изображения:',
      { reply_markup: expect.any(Object) }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: leaves when no message', async () => {
    ctx.message = undefined
    // @ts-ignore
    const step1 = sizeWizard.steps[1]
    await step1(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: rejects invalid size and stays', async () => {
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    ctx.message = { text: 'foo' } as any
    // @ts-ignore
    const step1 = sizeWizard.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Неверный размер'),
    )
  })

  it('step 1: handles valid size and leaves', async () => {
    ctx.message = { text: '16:9' } as any
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    // @ts-ignore
    const step1 = sizeWizard.steps[1]
    await step1(ctx)
    expect(handleSizeSelection).toHaveBeenCalledWith(ctx, '16:9')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})