import makeMockContext from '../utils/mockTelegrafContext'
import { imageToPromptWizard } from '../../src/scenes/imageToPromptWizard'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { createHelpCancelKeyboard } from '@/menu'
import { generateImageToPrompt } from '@/services/generateImageToPrompt'
import { getBotToken } from '@/handlers'
import { Composer } from 'telegraf'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { MySession } from '@/interfaces'
import { User } from 'telegraf/typings/core/types/typegram'
import { URL } from 'url'

// Mock dependencies
jest.mock('@/handlers/handleHelpCancel')
jest.mock('@/menu')
jest.mock('@/services/generateImageToPrompt')
jest.mock('@/handlers/getBotToken')
jest.mock('@/helpers/language')

// Import mocked functions
import { isRussian } from '@/helpers/language'

// Type mocks
const mockedHandleCancel = handleHelpCancel as jest.Mock<
  (...args: any[]) => Promise<boolean>
>
const mockedCreateKb = createHelpCancelKeyboard as jest.Mock
const mockedGenerate = generateImageToPrompt as jest.Mock
const mockedGetToken = getBotToken as jest.Mock<() => [string, string] | null>
const mockedIsRussian = isRussian as jest.Mock<() => boolean>

describe('imageToPromptWizard steps', () => {
  let ctx: ReturnType<typeof makeMockContext>
  const steps = Composer.unwrap(imageToPromptWizard.middleware())
  const step0 = steps[0]
  const step1 = steps[1]
  const mockNext = (): Promise<void> => Promise.resolve()
  const mockFrom: User = {
    id: 12345,
    is_bot: false,
    first_name: 'Test',
    language_code: 'en',
  }
  const createMockSession = (
    overrides: Partial<MySession> = {}
  ): MySession => ({
    selectedPayment: null,
    cursor: 0,
    images: [],
    targetUserId: '',
    userModel: null,
    email: null,
    mode: null,
    prompt: null,
    imageUrl: null,
    videoModel: null,
    paymentAmount: null,
    subscription: null,
    neuroPhotoInitialized: false,
    bypass_payment_check: false,
    videoUrl: undefined,
    audioUrl: undefined,
    inviteCode: undefined,
    inviter: undefined,
    subscriptionStep: undefined,
    memory: undefined,
    attempts: undefined,
    amount: undefined,
    selectedModel: undefined,
    modelName: undefined,
    username: undefined,
    triggerWord: undefined,
    steps: undefined,
    translations: undefined,
    buttons: undefined,
    selectedSize: undefined,
    ...overrides,
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockedIsRussian.mockReturnValue(false)
  })

  it('step0: leaves scene if cancelled', async () => {
    const sessionData = createMockSession()
    ctx = makeMockContext({ message: { from: mockFrom } }, sessionData)
    mockedHandleCancel.mockResolvedValueOnce(true)

    await step0(ctx, mockNext)

    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step0: prompts and advances wizard', async () => {
    const sessionData = createMockSession()
    ctx = makeMockContext({ message: { from: mockFrom } }, sessionData)
    mockedHandleCancel.mockResolvedValueOnce(false)
    const keyboard = { reply_markup: { foo: 'bar' } }
    mockedCreateKb.mockReturnValueOnce(keyboard)

    await step0(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith(
      'Please send an image to generate a prompt',
      { reply_markup: keyboard.reply_markup }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step1: no message replies error help', async () => {
    const sessionData = createMockSession()
    ctx = makeMockContext({ message: { from: mockFrom } }, sessionData)
    mockedHandleCancel.mockResolvedValueOnce(false)
    const keyboard = { reply_markup: { foo: 'bar' } }
    mockedCreateKb.mockReturnValueOnce(keyboard)

    await step1(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith('Please send an image', {
      reply_markup: keyboard.reply_markup,
    })
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
    const ctx = makeMockContext(
      {},
      {
        message: { photo: [{ file_id: 'fid1' }, { file_id: 'fid2' }] },
      }
    )
    // mock getFileLink
    ctx.telegram.getFileLink = jest
      .fn()
      .mockResolvedValue({ href: 'http://file.jpg' })
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
