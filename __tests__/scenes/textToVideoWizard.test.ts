/**
 * Tests for textToVideoWizard
 */
import { textToVideoWizard } from '@/scenes/textToVideoWizard'
import { makeMockContext, MockContextWithSession } from '../utils/mockContext'
import { Scenes, MiddlewareFn } from 'telegraf'
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { MyContext, MySession } from '../../src/interfaces'
import { User, Message, UserFromGetMe } from 'telegraf/typings/core/types/typegram'
import { botLogger } from '@/utils/logger'

// Mock dependencies
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/menu', () => ({
  videoModelKeyboard: jest.fn(),
  sendGenericErrorMessage: jest.fn(),
}))
jest.mock('@/core/supabase/getUserBalance', () => ({ getUserBalance: jest.fn() }))
jest.mock('@/price/helpers', () => ({
  validateAndCalculateVideoModelPrice: jest.fn(),
  sendBalanceMessage: jest.fn(),
}))
jest.mock('@/services/generateTextToVideo', () => ({ generateTextToVideo: jest.fn() }))
jest.mock('@/handlers/handleHelpCancel')
jest.mock('@/utils/logger')

import { isRussian } from '@/helpers/language'
import { videoModelKeyboard, sendGenericErrorMessage } from '@/menu'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { validateAndCalculateVideoModelPrice, sendBalanceMessage } from '@/price/helpers'
import { generateTextToVideo } from '@/services/generateTextToVideo'
import { handleHelpCancel as handleHelpCancelHandler } from '@/handlers/handleHelpCancel'

// Типизируем моки
const mockedIsRussian = isRussian as jest.Mock<() => boolean>
const mockedVideoKeyboard = videoModelKeyboard as jest.Mock
const mockedGetUserBalance = getUserBalance as jest.MockedFunction<typeof getUserBalance>
const mockedValidateAndCalculateVideoModelPrice = validateAndCalculateVideoModelPrice as jest.MockedFunction<
  (videoModel: string, availableModels: string[], currentBalance: number, isRu: boolean, ctx: MyContext) => Promise<number | null>
>
const mockedSendBalance = sendBalanceMessage as jest.MockedFunction<typeof sendBalanceMessage>
const mockedGenerateTextToVideo = generateTextToVideo as jest.MockedFunction<typeof generateTextToVideo>
const mockedHandleHelpCancel = handleHelpCancelHandler as jest.MockedFunction<typeof handleHelpCancelHandler>
const mockedSendGenericError = sendGenericErrorMessage as jest.Mock

// Определяем мок next
const mockNext = jest.fn<() => Promise<void>>().mockResolvedValue()

describe('textToVideoWizard', () => {
  let ctx: MockContextWithSession<Scenes.WizardSessionData & MySession>
  const mockFrom: User = { id: 7, is_bot: false, first_name: 'User', username: 'user', language_code: 'ru' }
  const mockChat = { id: 1, type: 'private' as const, first_name: 'User' }
  const mockBotInfo: UserFromGetMe = {
    id: 1,
    is_bot: true,
    first_name: 'Bot',
    username: 'TestBot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  }

  const steps = textToVideoWizard.steps as MiddlewareFn<MyContext>[];
  const step0 = steps[0] as MiddlewareFn<MyContext>
  const step1 = steps[1] as MiddlewareFn<MyContext>
  const step2 = steps[2] as MiddlewareFn<MyContext>

  beforeEach(() => {
    jest.clearAllMocks()
    mockNext.mockClear()
    ctx = makeMockContext(
      { update_id: 1, message: { message_id: 1, date: 1, chat: mockChat, from: mockFrom, text: '/start' } },
      { scene: { enter: jest.fn(), leave: jest.fn() }, session: { state: {} } as any },
      { botInfo: mockBotInfo }
    )
    mockedHandleHelpCancel.mockResolvedValue(true)
    mockedGetUserBalance.mockResolvedValue(1000)
    mockedValidateAndCalculateVideoModelPrice.mockResolvedValue(10)
  })

  it('step0: prompts model selection and calls next()', async () => {
    mockedIsRussian.mockReturnValueOnce(true)
    const kb = { reply_markup: { keyboard: [[{ text: 'model1' }]], resize_keyboard: true } }
    mockedVideoKeyboard.mockReturnValueOnce(kb)

    await step0(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith(
      'Выберите модель для генерации:',
      kb
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step0: handles exception and leaves scene', async () => {
    mockedIsRussian.mockReturnValueOnce(false)
    mockedVideoKeyboard.mockImplementationOnce(() => { throw new Error('fail') })

    await step0(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith('❌ An error occurred: fail')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: no text sends error and leaves', async () => {
    ctx = makeMockContext(
      { update_id: 1, message: { message_id: 1, date: 1, chat: mockChat, from: mockFrom, text: '' } },
      {},
      { botInfo: mockBotInfo }
    )

    await step1(ctx, mockNext)
    expect(mockedSendGenericError).toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: cancel leaves scene', async () => {
    const cancelMessage: Message.TextMessage = { message_id: 1, date: 1, chat: mockChat, from: mockFrom, text: 'Отмена' }
    ctx = makeMockContext(
      { update_id: 1, message: cancelMessage },
      {},
      { botInfo: mockBotInfo }
    )
    mockedIsRussian.mockReturnValueOnce(true)
    mockedHandleHelpCancel.mockResolvedValueOnce(true)

    await step1(ctx, mockNext)

    expect(mockedHandleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: insufficient funds leaves scene', async () => {
    const modelMessage: Message.TextMessage = { message_id: 1, date: 1, chat: mockChat, from: mockFrom, text: 'modelx' }
    ctx = makeMockContext(
      { update_id: 1, message: modelMessage },
      {},
      { botInfo: mockBotInfo }
    )
    mockedIsRussian.mockReturnValueOnce(true)
    mockedHandleHelpCancel.mockResolvedValueOnce(false)
    mockedGetUserBalance.mockResolvedValueOnce(5)
    mockedValidateAndCalculateVideoModelPrice.mockResolvedValueOnce(10)

    await step1(ctx, mockNext)

    expect(mockedValidateAndCalculateVideoModelPrice).toHaveBeenCalledWith(
        'modelx', expect.any(Array), 5, true, ctx
    )
    expect(mockedGetUserBalance).toHaveBeenCalledWith(7)
    expect(ctx.reply).toHaveBeenCalledWith('❌ Недостаточно средств. Ваш баланс: 5 T.', expect.any(Object))
    expect(mockedSendBalance).not.toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: valid selection sends balance and next', async () => {
    const modelMessage: Message.TextMessage = { message_id: 1, date: 1, chat: mockChat, from: mockFrom, text: 'modelx' }
    ctx = makeMockContext(
      { update_id: 1, message: modelMessage },
      { session: { state: {} } as any },
      { botInfo: mockBotInfo }
    )
    mockedIsRussian.mockReturnValueOnce(false)
    mockedHandleHelpCancel.mockResolvedValueOnce(false)
    mockedGetUserBalance.mockResolvedValueOnce(100)
    mockedValidateAndCalculateVideoModelPrice.mockResolvedValueOnce(20)

    await step1(ctx, mockNext)

    expect(mockedValidateAndCalculateVideoModelPrice).toHaveBeenCalledWith(
        'modelx', expect.any(Array), 100, false, ctx
    )
    expect(mockedGetUserBalance).toHaveBeenCalledWith(7)
    expect(mockedSendBalance).toHaveBeenCalledWith(ctx, 100, 20, false, 'TestBot')
    expect(ctx.reply).toHaveBeenCalledWith('Please send a text description', expect.any(Object))
    expect(ctx.session.videoModel).toBe('modelx')
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step2: processes prompt and generates video then leave', async () => {
    const promptMessage: Message.TextMessage = { message_id: 1, date: 1, chat: mockChat, from: mockFrom, text: 'hello' }
    const sessionData: Partial<MySession> = { videoModel: 'm1' }
    ctx = makeMockContext(
      { update_id: 1, message: promptMessage },
      { session: sessionData as any },
      { botInfo: mockBotInfo }
    )
    mockedIsRussian.mockReturnValueOnce(true)
    mockedGenerateTextToVideo.mockResolvedValueOnce(undefined)

    await step2(ctx, mockNext)

    expect(mockedGenerateTextToVideo).toHaveBeenCalledWith(
      ctx,
      'hello',
      'm1',
      '7',
      'user',
      true
    )
    expect(ctx.session.prompt).toBe('hello')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step2: no text sends error and leaves', async () => {
    const emptyMessage: Message.TextMessage = { message_id: 1, date: 1, chat: mockChat, from: mockFrom, text: '' }
    const sessionData: Partial<MySession> = { videoModel: 'm1' }
    ctx = makeMockContext(
      { update_id: 1, message: emptyMessage },
      { session: sessionData as any },
      { botInfo: mockBotInfo }
    )
    mockedIsRussian.mockReturnValueOnce(false)

    await step2(ctx, mockNext)

    expect(mockedSendGenericError).toHaveBeenCalledWith(ctx, false)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: invalid model leaves scene', async () => {
    mockedValidateAndCalculateVideoModelPrice.mockResolvedValue(null)
    const modelMessage: Message.TextMessage = { message_id: 1, date: 1, chat: mockChat, from: mockFrom, text: 'some invalid model' }
    ctx = makeMockContext(
      { update_id: 1, message: modelMessage },
      {},
      { botInfo: mockBotInfo }
    )
    mockedHandleHelpCancel.mockResolvedValueOnce(false)
    mockedGetUserBalance.mockResolvedValueOnce(1000)

    await step1(ctx, mockNext)

    expect(mockedValidateAndCalculateVideoModelPrice).toHaveBeenCalledWith(
        'some invalid model', expect.any(Array), 1000, false, ctx
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: valid model sends balance and next', async () => {
    mockedValidateAndCalculateVideoModelPrice.mockResolvedValue(10)
    const modelMessage: Message.TextMessage = { message_id: 1, date: 1, chat: mockChat, from: mockFrom, text: 'valid_model' }
    ctx = makeMockContext(
      { update_id: 1, message: modelMessage },
      { session: { state: {} } as any },
      { botInfo: mockBotInfo }
    )
    mockedHandleHelpCancel.mockResolvedValueOnce(false)
    mockedGetUserBalance.mockResolvedValueOnce(1000)

    await step1(ctx, mockNext)

    expect(mockedValidateAndCalculateVideoModelPrice).toHaveBeenCalledWith(
        'valid_model', expect.any(Array), 1000, false, ctx
    )
    expect(mockedGetUserBalance).toHaveBeenCalledWith(7)
    expect(mockedSendBalance).toHaveBeenCalledWith(ctx, 1000, 10, false, 'TestBot')
    expect(ctx.reply).toHaveBeenCalledWith('Please send a text description', expect.any(Object))
    expect(ctx.session.videoModel).toBe('valid_model')
    expect(ctx.wizard.next).toHaveBeenCalled()
  })
})