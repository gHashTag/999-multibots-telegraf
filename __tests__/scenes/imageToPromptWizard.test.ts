import makeMockContext from '../utils/mockTelegrafContext'
import { imageToPromptWizard } from '../../src/scenes/imageToPromptWizard'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { createHelpCancelKeyboard } from '@/menu'
import { generateImageToPrompt } from '@/services/generateImageToPrompt'
import { getBotToken } from '@/handlers'
import { Composer } from 'telegraf'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { MyContext, MySession } from '@/interfaces'
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
  let ctx: MyContext
  const steps = Composer.unwrap(imageToPromptWizard.middleware())
  const step0 = steps[0]
  const step1 = steps[1]
  const mockNext = jest.fn()
  const mockFrom: User = {
    id: 12345,
    is_bot: false,
    first_name: 'Test',
    language_code: 'en',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockedIsRussian.mockReturnValue(false)
    mockNext.mockClear()
  })

  it('step0: leaves scene if cancelled', async () => {
    ctx = makeMockContext({
      update_id: 1,
      message: {
        from: mockFrom,
        message_id: 1,
        date: Date.now(),
        chat: {
          id: mockFrom.id,
          type: 'private',
          first_name: mockFrom.first_name,
        },
      },
    })
    mockedHandleCancel.mockResolvedValueOnce(true)

    await step0(ctx, mockNext)

    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step0: prompts and advances wizard', async () => {
    ctx = makeMockContext({
      update_id: 2,
      message: {
        from: mockFrom,
        message_id: 2,
        date: Date.now(),
        chat: {
          id: mockFrom.id,
          type: 'private',
          first_name: mockFrom.first_name,
        },
      },
    })
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
    ctx = makeMockContext({
      update_id: 3,
      message: {
        from: mockFrom,
        message_id: 3,
        date: Date.now(),
        chat: {
          id: mockFrom.id,
          type: 'private',
          first_name: mockFrom.first_name,
        },
      },
    })
    mockedHandleCancel.mockResolvedValueOnce(false)
    const keyboard = { reply_markup: { foo: 'bar' } }
    mockedCreateKb.mockReturnValueOnce(keyboard)

    await step1(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith('Please send an image', {
      reply_markup: keyboard.reply_markup,
    })
  })

  it('step1: leaves if cancelled', async () => {
    ctx = makeMockContext({
      update_id: 4,
      message: {
        text: 'cancel',
        from: mockFrom,
        message_id: 4,
        date: Date.now(),
        chat: {
          id: mockFrom.id,
          type: 'private',
          first_name: mockFrom.first_name,
        },
      },
    })
    mockedHandleCancel.mockResolvedValueOnce(true)
    await step1(ctx, mockNext)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: processes photo and generates prompt', async () => {
    mockedHandleCancel.mockResolvedValue(false)
    const botName = 'testBotName'
    mockedGetToken.mockReturnValueOnce(['tok', botName])
    ctx = makeMockContext({
      update_id: 1002,
      message: {
        photo: [
          { file_id: 'fid1', file_unique_id: 'uid1', width: 100, height: 100 },
          { file_id: 'fid2', file_unique_id: 'uid2', width: 200, height: 200 },
        ],
        from: mockFrom,
        date: Date.now(),
        message_id: 125,
        chat: {
          id: mockFrom.id,
          type: 'private',
          first_name: mockFrom.first_name,
        },
      },
    })
    ctx.telegram.getFileLink = jest
      .fn<(fileId: string) => Promise<{ href: string }>>()
      .mockResolvedValue({ href: 'http://file.jpg' })

    await step1(ctx, mockNext)

    expect(generateImageToPrompt).toHaveBeenCalledWith(
      'http://file.jpg',
      String(mockFrom.id),
      ctx,
      false,
      botName
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
