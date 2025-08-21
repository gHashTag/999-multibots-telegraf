import { jest, describe, beforeEach, it, expect } from '@jest/globals'
// Мокаем внешние зависимости до импортов
jest.mock('../../src/services/generateImageFromPrompt', () => jest.fn())
jest.mock('../../src/handlers/handleHelpCancel', () => ({ handleHelpCancel: jest.fn() }))
import { generateImageWizard } from '@/scenes/generateImage'
import makeMockContext from '../utils/mockTelegrafContext'
import generateImageFromPrompt from '../../src/services/generateImageFromPrompt'
import { handleHelpCancel } from '../../src/handlers/handleHelpCancel'

describe.skip('generateImageWizard steps', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    // по умолчанию язык русский
    ctx.from = { id: 1, language_code: 'ru' }
  })

  it('step 0: prompts for prompt and advances wizard', async () => {
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    // @ts-ignore
    const step0 = generateImageWizard.steps[0]
    await step0(ctx)
    expect(handleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Введите промпт для генерации изображения (максимум 1000 символов):',
      { reply_markup: expect.any(Object) }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: handles cancellation', async () => {
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(true)
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(true)
    // @ts-ignore
    const step1 = generateImageWizard.steps[1]
    await step1(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: asks for text prompt when no message text', async () => {
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    ctx.message = {} as any
    // @ts-ignore
    const step1 = generateImageWizard.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Пожалуйста, введите текстовый промпт.',
      { reply_markup: expect.any(Object) }
    )
  })

  it('step 1: rejects too long prompt', async () => {
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    ctx.message = { text: 'a'.repeat(1001) } as any
    // @ts-ignore
    const step1 = generateImageWizard.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      `Промпт слишком длинный. Максимальная длина: 1000 символов.`,
      { reply_markup: expect.any(Object) }
    )
  })

  it('step 1: accepts valid prompt and asks for size', async () => {
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    ctx.message = { text: 'test prompt' } as any
    // @ts-ignore
    const step1 = generateImageWizard.steps[1]
    await step1(ctx)
    // проверяем сохранение
    const state = (ctx.scene.session.state as any)
    expect(state.prompt).toBe('test prompt')
    expect(ctx.reply).toHaveBeenCalledWith(
      'Выберите размер изображения:',
      { reply_markup: expect.objectContaining({ inline_keyboard: expect.any(Array) }) }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 2: handles cancel callback', async () => {
    ctx.callbackQuery = { data: 'cancel' } as any
    // @ts-ignore
    const step2 = generateImageWizard.steps[2]
    await step2(ctx)
    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith('Генерация изображения отменена.')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 2: handles invalid size selection', async () => {
    ctx.callbackQuery = { data: 'foo' } as any
    // @ts-ignore
    const step2 = generateImageWizard.steps[2]
    await step2(ctx)
    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      'Неверный выбор размера. Пожалуйста, выберите один из предложенных вариантов.'
    )
  })

  it('step 2: generates image on valid selection', async () => {
    (generateImageFromPrompt as jest.Mock).mockResolvedValueOnce('http://img.url')
    ctx.callbackQuery = { data: 'size_512' } as any
    // Устанавливаем prompt в состоянии
    ctx.scene.session.state = { prompt: 'hello' }
    // @ts-ignore
    const step2 = generateImageWizard.steps[2]
    await step2(ctx)
    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      'Генерирую изображение по вашему промпту. Это может занять несколько минут...'
    )
    expect(generateImageFromPrompt).toHaveBeenCalledWith(
      'hello',
      ctx.from.id,
      'standard',
      '512x512'
    )
    expect(ctx.replyWithPhoto).toHaveBeenCalledWith(
      'http://img.url',
      { caption: 'Изображение сгенерировано по вашему запросу' }
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})