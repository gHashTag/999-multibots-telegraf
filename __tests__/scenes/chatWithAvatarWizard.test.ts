/**
 * Tests for chatWithAvatarWizard
 */
import { chatWithAvatarWizard } from '../../src/scenes/chatWithAvatarWizard'
import makeMockContext from '../utils/mockTelegrafContext'
import { MyContext } from '@/interfaces'
import { Composer } from 'telegraf'

// Mock dependencies
jest.mock('../../src/helpers/language', () => ({ isRussian: jest.fn() }))
// jest.mock('../../src/menu/createHelpCancelKeyboard', () => ({ createHelpCancelKeyboard: jest.fn() }))
jest.mock('../../src/handlers/handleHelpCancel', () => ({
  handleHelpCancel: jest.fn(),
}))
jest.mock('../../src/handlers/handleTextMessage', () => ({
  handleTextMessage: jest.fn(),
}))
jest.mock('../../src/core/supabase', () => ({
  getUserByTelegramId: jest.fn(),
  updateUserLevelPlusOne: jest.fn(),
}))

import { isRussian } from '../../src/helpers/language'
// import { createHelpCancelKeyboard } from '../../src/menu/createHelpCancelKeyboard'
import { handleHelpCancel } from '../../src/handlers/handleHelpCancel'
import { handleTextMessage } from '../../src/handlers/handleTextMessage'
import {
  getUserByTelegramId,
  updateUserLevelPlusOne,
} from '../../src/core/supabase'

describe('chatWithAvatarWizard', () => {
  let ctx: MyContext
  let next: jest.Mock
  const wizardMiddleware = chatWithAvatarWizard.middleware()

  beforeEach(() => {
    jest.clearAllMocks()
    next = jest.fn()
  })

  it('step0: sends prompt and calls next()', async () => {
    ctx = makeMockContext({ update_id: 1 })
    ;(isRussian as jest.Mock).mockReturnValue(true)
    // Mock keyboard
    // (createHelpCancelKeyboard as jest.Mock).mockReturnValue({ reply_markup: { foo: 'bar' } })

    ctx.wizard.cursor = 0
    await wizardMiddleware(ctx, next)

    expect(isRussian).toHaveBeenCalledWith(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Напиши мне сообщение 💭 и я отвечу на него'
      // expect.objectContaining({ reply_markup: { foo: 'bar' } })
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step1: no message leaves scene', async () => {
    ctx = makeMockContext({ update_id: 2 })
    ctx.wizard.cursor = 1
    await wizardMiddleware(ctx, next)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: handleHelpCancel true leaves scene', async () => {
    ctx = makeMockContext({
      update_id: 3,
      message: {
        text: 'hi',
        from: { id: 1, is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private', first_name: 'Test' },
        date: 0,
        message_id: 1,
      },
    })
    ;(handleHelpCancel as jest.Mock).mockResolvedValue(true)
    ctx.wizard.cursor = 1
    await wizardMiddleware(ctx, next)
    expect(handleHelpCancel).toHaveBeenCalledWith(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: processes text and does not update level when level != 4', async () => {
    ctx = makeMockContext({
      update_id: 4,
      message: {
        text: 'hello',
        from: { id: 1, is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private', first_name: 'Test' },
        date: 0,
        message_id: 2,
      },
    })
    ;(handleHelpCancel as jest.Mock).mockResolvedValue(false)
    ;(getUserByTelegramId as jest.Mock).mockResolvedValue({
      data: { level: 3 },
    })

    ctx.wizard.cursor = 1
    await wizardMiddleware(ctx, next)

    expect(handleTextMessage).toHaveBeenCalledWith(ctx)
    expect(updateUserLevelPlusOne).not.toHaveBeenCalled()
  })

  it('step1: processes text and updates level when level === 4', async () => {
    const userId = 1
    ctx = makeMockContext({
      update_id: 5,
      message: {
        text: 'hello',
        from: { id: userId, is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private', first_name: 'Test' },
        date: 0,
        message_id: 3,
      },
    })
    ;(handleHelpCancel as jest.Mock).mockResolvedValue(false)
    ;(getUserByTelegramId as jest.Mock).mockResolvedValue({
      data: { level: 4 },
    })

    ctx.wizard.cursor = 1
    await wizardMiddleware(ctx, next)

    expect(handleTextMessage).toHaveBeenCalledWith(ctx)
    expect(updateUserLevelPlusOne).toHaveBeenCalledWith(userId.toString(), 4)
  })

  it('step1: throws if user does not exist', async () => {
    const userId = 1
    ctx = makeMockContext({
      update_id: 6,
      message: {
        text: 'hello',
        from: { id: userId, is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private', first_name: 'Test' },
        date: 0,
        message_id: 4,
      },
    })
    ;(handleHelpCancel as jest.Mock).mockResolvedValue(false)
    ;(getUserByTelegramId as jest.Mock).mockResolvedValue({ data: null })

    ctx.wizard.cursor = 1
    await expect(wizardMiddleware(ctx, next)).rejects.toThrow(
      `User with ID ${userId} does not exist.`
    )
  })
})
