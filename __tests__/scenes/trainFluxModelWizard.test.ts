/**
 * Tests for trainFluxModelWizard
 */
import { MiddlewareFn, Scenes } from 'telegraf'
import { trainFluxModelWizard } from '@/scenes/trainFluxModelWizard'
import { makeMockContext, MockContextWithSession } from '../utils/mockContext'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { MyContext, MySession } from '@/interfaces'
import { Message } from 'telegraf/types'

// Mock dependencies
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/handlers/handleHelpCancel', () => ({
  handleHelpCancel: jest.fn<() => Promise<boolean>>(),
}))

import { isRussian } from '@/helpers/language'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'

// Типизируем моки
const mockedIsRussian = isRussian as jest.Mock<() => boolean>
const mockedHandleHelpCancel = handleHelpCancel as jest.MockedFunction<
  typeof handleHelpCancel
>

// Определяем мок next
const mockNext = jest.fn<() => Promise<void>>().mockResolvedValue()

describe('trainFluxModelWizard', () => {
  let ctx: MockContextWithSession<Scenes.WizardSessionData & MySession>

  const steps = trainFluxModelWizard.steps as MiddlewareFn<MyContext>[]
  const step0 = steps[0]
  const step1 = steps[1]

  beforeEach(() => {
    jest.clearAllMocks()
    mockNext.mockClear()
    ctx = makeMockContext(
      { update_id: 1 },
      { scene: { enter: jest.fn(), leave: jest.fn() }, session: {} },
      {
        botInfo: {
          id: 1,
          is_bot: true,
          first_name: 'Bot',
          username: 'TestBot',
        },
      }
    )
  })

  it('step 0: valid message sets session and advances wizard', async () => {
    mockedIsRussian.mockReturnValue(false)
    const message: Message.TextMessage = {
      message_id: 1,
      date: 1,
      chat: { id: 1, type: 'private', first_name: 'Bob' },
      from: {
        id: 111,
        is_bot: false,
        first_name: 'Bob',
        username: 'Bob',
        language_code: 'en',
      },
      text: '/trainFluxModelWizard 9876 Bob',
    }
    ctx = makeMockContext(
      { update_id: 1, message },
      { scene: { enter: jest.fn(), leave: jest.fn() }, session: {} },
      {
        botInfo: {
          id: 1,
          is_bot: true,
          first_name: 'Bot',
          username: 'TestBot',
        },
      }
    )

    await step0(ctx, mockNext)

    expect(ctx.session.images).toEqual([])
    expect(ctx.session.modelName).toBe('bob')
    expect(ctx.session.targetUserId).toBe('9876')
    expect(ctx.session.username).toBe('Bob')
    expect(ctx.session.triggerWord).toBe('bob')
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Please send images'),
      expect.any(Object)
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 0: missing username replies error and leaves', async () => {
    mockedIsRussian.mockReturnValue(false)
    const message: Message.TextMessage = {
      message_id: 1,
      date: 1,
      chat: { id: 1, type: 'private', first_name: 'User' },
      from: { id: 112, is_bot: false, first_name: 'User', language_code: 'en' },
      text: '/trainFluxModelWizard 1234',
    }
    ctx = makeMockContext(
      { update_id: 1, message },
      { scene: { enter: jest.fn(), leave: jest.fn() }, session: {} },
      {
        botInfo: {
          id: 1,
          is_bot: true,
          first_name: 'Bot',
          username: 'TestBot',
        },
      }
    )

    await step0(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ You need to set a username in Telegram settings to train a model'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: /done with <10 images prompts count and does not leave', async () => {
    mockedIsRussian.mockReturnValue(false)
    const message: Message.TextMessage = {
      message_id: 1,
      date: 1,
      chat: { id: 1, type: 'private', first_name: 'User' },
      from: { id: 113, is_bot: false, first_name: 'User', language_code: 'en' },
      text: '/done',
    }
    ctx = makeMockContext(
      { update_id: 1, message },
      {
        scene: { enter: jest.fn(), leave: jest.fn() },
        session: { images: [] },
      },
      {
        botInfo: {
          id: 1,
          is_bot: true,
          first_name: 'Bot',
          username: 'TestBot',
        },
      }
    )
    mockedHandleHelpCancel.mockResolvedValue(false)

    await step1(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith(
      '📸 Minimum 10 images required. Current: 0'
    )
    expect(ctx.scene.enter).not.toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('step 1: /done with >=10 images enters upload scene', async () => {
    mockedIsRussian.mockReturnValue(false)
    const message: Message.TextMessage = {
      message_id: 1,
      date: 1,
      chat: { id: 1, type: 'private', first_name: 'User' },
      from: { id: 114, is_bot: false, first_name: 'User', language_code: 'en' },
      text: '/done',
    }
    const initialSession = { images: Array(10).fill('file_id') }
    ctx = makeMockContext(
      { update_id: 1, message },
      {
        scene: { enter: jest.fn(), leave: jest.fn() },
        session: initialSession,
      },
      {
        botInfo: {
          id: 1,
          is_bot: true,
          first_name: 'Bot',
          username: 'TestBot',
        },
      }
    )
    mockedHandleHelpCancel.mockResolvedValue(false)

    await step1(ctx, mockNext)

    expect(ctx.scene.enter).toHaveBeenCalledWith('uploadTrainFluxModelScene')
  })

  it('step 1: cancel leaves the scene', async () => {
    mockedIsRussian.mockReturnValue(false)
    const message: Message.TextMessage = {
      message_id: 1,
      date: 1,
      chat: { id: 1, type: 'private', first_name: 'User' },
      from: { id: 115, is_bot: false, first_name: 'User', language_code: 'en' },
      text: 'irrelevant',
    }
    ctx = makeMockContext(
      { update_id: 1, message },
      {
        scene: { enter: jest.fn(), leave: jest.fn() },
        session: { images: [] },
      },
      {
        botInfo: {
          id: 1,
          is_bot: true,
          first_name: 'Bot',
          username: 'TestBot',
        },
      }
    )
    mockedHandleHelpCancel.mockResolvedValue(true)

    await step1(ctx, mockNext)

    expect(mockedHandleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
