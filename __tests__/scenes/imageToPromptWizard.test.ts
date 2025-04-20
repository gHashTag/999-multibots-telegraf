import makeMockContext from '../utils/mockTelegrafContext'
import { imageToPromptWizard } from '../../src/scenes/imageToPromptWizard'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { createHelpCancelKeyboard } from '@/menu'
import { generateImageToPrompt } from '@/services/generateImageToPrompt'
import { getBotToken } from '@/handlers'

// Mock dependencies
jest.mock('@/handlers/handleHelpCancel', () => ({ handleHelpCancel: jest.fn() }))
jest.mock('@/menu', () => ({ createHelpCancelKeyboard: jest.fn(opts => ({ reply_markup: opts })) }))
jest.mock('@/services/generateImageToPrompt', () => ({ generateImageToPrompt: jest.fn() }))
jest.mock('@/handlers/getBotToken', () => ({ getBotToken: jest.fn() }))

describe('imageToPromptWizard steps', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('step0: leaves scene if cancelled', async () => {
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(true)
    const ctx = makeMockContext()
    // @ts-ignore
    const step0 = imageToPromptWizard.steps[0]
    await step0(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step0: prompts and advances wizard', async () => {
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    const keyboard = { reply_markup: { foo: 'bar' } }
    ;(createHelpCancelKeyboard as jest.Mock).mockReturnValueOnce(keyboard)
    const ctx = makeMockContext()
    // @ts-ignore
    const step0 = imageToPromptWizard.steps[0]
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Please send an image to generate a prompt',
      { reply_markup: keyboard.reply_markup }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step1: no message replies error help', async () => {
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    const keyboard = { reply_markup: { foo: 'bar' } }
    ;(createHelpCancelKeyboard as jest.Mock).mockReturnValueOnce(keyboard)
    const ctx = makeMockContext()
    // @ts-ignore
    const step1 = imageToPromptWizard.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Please send an image',
      { reply_markup: keyboard.reply_markup }
    )
  })

  it('step1: leaves if cancelled', async () => {
    const msgCtx = makeMockContext({}, { message: { text: 'foo' } })
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(true)
    // @ts-ignore
    const step1 = imageToPromptWizard.steps[1]
    await step1(msgCtx)
    expect(msgCtx.scene.leave).toHaveBeenCalled()
  })

  it('step1: processes photo and generates prompt', async () => {
    ;(handleHelpCancel as jest.Mock).mockResolvedValue(false)
    ;(getBotToken as jest.Mock).mockResolvedValueOnce(['tok', 'botName'])
    ;(getBotToken as jest.Mock).mockResolvedValueOnce(['tok', 'botName'])
    const ctx = makeMockContext({}, {
      message: { photo: [{ file_id: 'fid1' }, { file_id: 'fid2' }] }
    })
    // mock getFileLink
    ctx.telegram.getFileLink = jest.fn().mockResolvedValue({ href: 'http://file.jpg' })
    // @ts-ignore
    const step1 = imageToPromptWizard.steps[1]
    await step1(ctx)
    expect(generateImageToPrompt).toHaveBeenCalledWith(
      'http://file.jpg',
      '12345',
      ctx,
      true,
      'botName'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})