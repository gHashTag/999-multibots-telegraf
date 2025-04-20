// Мокаем зависимости до импортов
jest.mock('@/services/generateNeuroImage', () => jest.fn())
jest.mock('@/handlers/handleHelpCancel', () => ({
  handleHelpCancel: jest.fn(),
}))
jest.mock('@/helpers', () => ({ isRussian: jest.fn() }))
jest.mock('@/scenes/neuroCoderScene/promts', () => ({
  promptNeuroCoder: 'test prompt',
}))

import { neuroCoderScene } from '@/scenes/neuroCoderScene'
import makeMockContext from '../utils/mockTelegrafContext'
import { generateNeuroImage } from '@/services/generateNeuroImage'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { isRussian } from '@/helpers'

describe('neuroCoderScene', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.from = { id: 10, language_code: 'ru' }
    ctx.chat = { id: 20 } as any
    ctx.botInfo = { username: 'bot' }
  })

  it('step 0: prompts for number and advances', async () => {
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    // @ts-ignore
    const step0 = neuroCoderScene.steps[0]
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Выберите количество изображений для генерации:',
      expect.objectContaining({ resize_keyboard: undefined })
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: cancellation leaves', async () => {
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(true)
    // @ts-ignore
    const step1 = neuroCoderScene.steps[1]
    await step1(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: invalid message or missing id replies error and leaves', async () => {
    ctx.from = undefined as any
    ctx.message = undefined as any
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    // @ts-ignore
    const step1 = neuroCoderScene.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Ошибка при выборе количества изображений.'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: valid number triggers generateNeuroImage and leaves', async () => {
    ctx.session = { mode: 'neuro_photo' } as any
    ctx.message = { text: '3' } as any
    ;(handleHelpCancel as jest.Mock).mockResolvedValue(false)
    // @ts-ignore
    const step1 = neuroCoderScene.steps[1]
    await step1(ctx)
    expect(generateNeuroImage).toHaveBeenCalledWith(
      'test prompt',
      expect.any(String),
      3,
      '10',
      ctx,
      'bot'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
